import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, GatewaySettings, GatewayTelemetry, ScenarioPreset } from '../types';
import { sendPromptToApigee, exhaustLlmQuota } from '../services/apigeeClient';
import { GatewayTraceViewer } from './GatewayTraceViewer';
import { SCENARIO_PRESETS, USERS, getUserInfo, DEFAULT_SSO_USER } from '../services/defaultSettings';
import { Send, Bot, User, ShieldAlert, Activity, Sparkles, Shield, Database, Globe, Key, AlertTriangle } from 'lucide-react';

interface ChatPlaygroundProps {
  settings: GatewaySettings;
  setSettings: React.Dispatch<React.SetStateAction<GatewaySettings>>;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  activeTelemetry: GatewayTelemetry | null;
  setActiveTelemetry: React.Dispatch<React.SetStateAction<GatewayTelemetry | null>>;
}

export const ChatPlayground: React.FC<ChatPlaygroundProps> = ({
  settings,
  setSettings,
  messages,
  setMessages,
  activeTelemetry,
  setActiveTelemetry,
}) => {
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chat' | 'trace'>('chat');
  const [hasUnreadTrace, setHasUnreadTrace] = useState(false);
  const [cacheStep, setCacheStep] = useState<0 | 1>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleExecute = async (textToSubmit: string, overrideSettings?: GatewaySettings) => {
    if (!textToSubmit.trim() || loading) return;

    const userText = textToSubmit.trim();
    setInputText('');

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    const settingsToUse = overrideSettings || settings;

    try {
      const response = await sendPromptToApigee(
        userText,
        settingsToUse,
        messages
      );

      const agentMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'agent',
        text: response.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model: response.telemetry.model,
        isError: !response.success,
        telemetry: {
          ...response.telemetry,
          userEmail: settingsToUse.userEmail || DEFAULT_SSO_USER.email,
        },
      };

      setMessages((prev) => [...prev, agentMessage]);
      setActiveTelemetry({
        ...response.telemetry,
        userEmail: settingsToUse.userEmail || DEFAULT_SSO_USER.email,
      });

      if (mobileTab === 'chat') {
        setHasUnreadTrace(true);
      }
    } catch (err: any) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'agent',
        text: `Error connecting to gateway: ${err.message}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    if (settings.omitEmailHeader) {
      setSettings((prev) => ({ ...prev, omitEmailHeader: false }));
    }
    handleExecute(inputText, { ...settings, omitEmailHeader: false });
  };

  const handleSelectSample = (preset: ScenarioPreset) => {
    const isIdentityTest =
      preset.id === 'zero-trust-identity' || Boolean(preset.settingsOverride?.omitEmailHeader);

    let effectiveSettings: GatewaySettings = {
      ...settings,
      ...preset.settingsOverride,
      omitEmailHeader: isIdentityTest,
    };

    if (preset.settingsOverride?.activeUser) {
      const u = USERS[preset.settingsOverride.activeUser];
      if (u) {
        effectiveSettings.apiKey = u.apiKey;
      }
    }

    if (preset.settingsOverride) {
      const persistentOverrides = { ...preset.settingsOverride };
      delete persistentOverrides.omitEmailHeader;

      if (Object.keys(persistentOverrides).length > 0) {
        setSettings((prev) => ({
          ...prev,
          ...persistentOverrides,
          ...(preset.settingsOverride?.activeUser
            ? {
                apiKey: USERS[preset.settingsOverride.activeUser]?.apiKey || prev.apiKey,
              }
            : {}),
          omitEmailHeader: false,
        }));
      } else {
        setSettings((prev) => ({ ...prev, omitEmailHeader: false }));
      }
    } else {
      setSettings((prev) => ({ ...prev, omitEmailHeader: false }));
    }

    handleExecute(preset.prompt, effectiveSettings);
  };

  const sampleChips = [
    {
      label: '⚡ Success (200 OK)',
      promptId: 'success-prompt',
      title: 'Normal 200 OK inference with token telemetry accounting',
      color: 'hover:border-blue-500 hover:text-blue-300',
      icon: Sparkles,
      iconColor: 'text-blue-400',
    },
    {
      label: '🛡️ Model Armor (400)',
      promptId: 'model-armor-block',
      title: 'Destructive script blocked by Apigee Model Armor (SUP-UserPrompt)',
      color: 'hover:border-rose-500 hover:text-rose-300',
      icon: Shield,
      iconColor: 'text-rose-400',
    },
    {
      label:
        cacheStep === 0
          ? '⚡ Semantic Cache (Seed)'
          : '⚡ Semantic Cache (Hit)',
      promptId: 'cache-toggle',
      title:
        cacheStep === 0
          ? "Seed cache: 'Why should developers use Apigee for AI? Give 2 quick bullet points.' (with use-cache: true)"
          : "Sub-100ms vector hit: 'What are the key benefits of Apigee for AI? In 2 quick bullet points.'",
      color: 'hover:border-emerald-500 hover:text-emerald-300',
      icon: Database,
      iconColor: 'text-emerald-400',
    },
    {
      label: '🌐 Direct LLM (No Cache)',
      promptId: 'no-cache',
      title: "In 2 punchy lines, how does semantic caching save cloud LLM costs? (without use-cache header)",
      color: 'hover:border-cyan-500 hover:text-cyan-300',
      icon: Globe,
      iconColor: 'text-cyan-400',
    },
    {
      label: '🔒 Identity Check (401)',
      promptId: 'zero-trust-identity',
      title: 'Knock knock! Can I access the API without showing my badge? (without X-User-Email header)',
      color: 'hover:border-orange-500 hover:text-orange-300',
      icon: Key,
      iconColor: 'text-orange-400',
    },
    {
      label: '⚠️ Quota Breach (429)',
      promptId: 'quota-breach',
      title: 'Demonstrates Apigee LTQ-TokenEnforce rate limit token quota violation (HTTP 429)',
      color: 'hover:border-amber-500 hover:text-amber-300',
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
    },
  ];

  const handleChipClick = async (chip: (typeof sampleChips)[0]) => {
    if (chip.promptId === 'cache-toggle') {
      const targetPresetId = cacheStep === 0 ? 'cache-seed' : 'cache-hit';
      const preset = SCENARIO_PRESETS.find((p) => p.id === targetPresetId);
      if (preset) {
        handleSelectSample(preset);
        setCacheStep((prev) => (prev === 0 ? 1 : 0));
      }
      return;
    }

    if (chip.promptId === 'quota-breach') {
      const preset = SCENARIO_PRESETS.find((p) => p.id === 'quota-breach');
      if (preset) {
        setLoading(true);
        await exhaustLlmQuota(settings);
        handleSelectSample(preset);
      }
      return;
    }

    const preset = SCENARIO_PRESETS.find((p) => p.id === chip.promptId);
    if (preset) {
      handleSelectSample(preset);
    }
  };

  const activeUser = getUserInfo(settings.activeUser);
  const ssoUser = settings.ssoUser || DEFAULT_SSO_USER;
  const effectiveEmail = ssoUser.email || settings.userEmail || DEFAULT_SSO_USER.email;

  return (
    <div className="h-[calc(100vh-3.25rem)] flex flex-col md:flex-row overflow-hidden bg-slate-950">
      {/* Mobile Tab Switcher (< md) */}
      <div className="flex md:hidden items-center border-b border-slate-800 bg-slate-900/90 px-3 py-1.5 gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('chat')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer min-h-[36px] ${
            mobileTab === 'chat'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 bg-slate-800/60'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>Chat Playground</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileTab('trace');
            setHasUnreadTrace(false);
          }}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer min-h-[36px] relative ${
            mobileTab === 'trace'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 bg-slate-800/60'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-purple-400" />
          <span>Gateway Trace</span>
          {hasUnreadTrace && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-slate-900 animate-pulse" />
          )}
        </button>
      </div>

      {/* Left Column: Chat Area */}
      <div
        className={`flex-1 flex flex-col bg-slate-900/60 border-r border-slate-800/80 h-full overflow-hidden ${
          mobileTab === 'chat' ? 'flex' : 'hidden md:flex'
        }`}
      >
        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center p-4 sm:p-6 select-none max-w-2xl mx-auto my-auto">
              <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mb-2 text-blue-400">
                <Bot className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">Apigee AI Gateway Studio</h3>
              <p className="text-xs text-slate-400 mt-0.5 mb-5 text-center">
                Select a live capability tile below or enter a prompt to inspect gateway governance:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                {sampleChips.map((chip) => {
                  const preset = SCENARIO_PRESETS.find(
                    (p) =>
                      p.id ===
                      (chip.promptId === 'cache-toggle'
                        ? cacheStep === 0
                          ? 'cache-seed'
                          : 'cache-hit'
                        : chip.promptId)
                  );
                  const Icon = chip.icon || Sparkles;
                  return (
                    <button
                      key={chip.promptId}
                      type="button"
                      onClick={() => handleChipClick(chip)}
                      className="p-3 bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl text-left transition group cursor-pointer flex flex-col justify-between gap-2 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${chip.iconColor || 'text-blue-400'}`} />
                          <span className="text-xs font-semibold text-slate-200 group-hover:text-blue-300 transition truncate">
                            {chip.label}
                          </span>
                        </div>
                        {preset?.badgeText && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60 shrink-0">
                            {preset.badgeText}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {preset?.description || chip.title}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'agent' && (
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    msg.isError
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  }`}
                >
                  {msg.isError ? <ShieldAlert className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-sm transition ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : msg.isError
                    ? 'bg-slate-900 text-slate-200 border border-rose-500/40 rounded-bl-none'
                    : 'bg-slate-900/90 text-slate-100 border border-slate-800 rounded-bl-none'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>

                {/* Inline Telemetry Badge on Agent Messages */}
                {msg.telemetry && (
                  <div className="mt-2 pt-1.5 border-t border-slate-800/60 flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                    <span
                      className={`font-semibold ${
                        msg.telemetry.guardrailStatus === 'BLOCKED'
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {msg.telemetry.guardrailStatus === 'BLOCKED'
                        ? '🛡️ Blocked by Model Armor'
                        : '🛡️ Secured'}
                    </span>
                    <span>•</span>
                    <span>{msg.telemetry.latencyMs}ms</span>
                    {msg.telemetry.totalTokens && (
                      <>
                        <span>•</span>
                        <span>{msg.telemetry.totalTokens} tokens</span>
                      </>
                    )}
                    {msg.telemetry.cacheStatus === 'HIT' && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-400 font-bold">Vector Cache Hit</span>
                      </>
                    )}
                    <span className="ml-auto opacity-60 text-[9px]">{msg.timestamp}</span>
                  </div>
                )}
              </div>

              {msg.sender === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5 text-slate-300">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex gap-3 items-center">
              <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 animate-pulse">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="bg-slate-900 text-slate-300 text-xs px-3.5 py-2 rounded-xl flex items-center gap-2 border border-slate-800">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                <span>Governing prompt via Apigee AI Gateway ({settings.environment.toUpperCase()})...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input & Quick Chips */}
        <div className="p-3 sm:p-3.5 bg-slate-950/80 border-t border-slate-800/80 shrink-0">
          {/* Subtle Horizontal Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 no-scrollbar">
            <span className="text-[10px] text-slate-500 font-medium shrink-0 mr-1">Quick Demo:</span>
            {sampleChips.map((chip) => (
              <button
                key={chip.promptId}
                type="button"
                onClick={() => handleChipClick(chip)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium bg-slate-900 border border-slate-800 text-slate-300 whitespace-nowrap transition cursor-pointer min-h-[32px] ${chip.color}`}
                title={chip.title}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Prompt Input */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Enter your prompt or select a quick demo chip above..."
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[44px]"
            />
            <button
              type="submit"
              disabled={loading || !inputText.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium shadow-md shadow-blue-600/20 transition disabled:opacity-40 flex items-center gap-1.5 text-xs sm:text-sm shrink-0 min-h-[44px] cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>

          {/* Active Status Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[10px] text-slate-500 font-mono">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span>Gateway: <strong className="text-blue-400 uppercase">{settings.environment}</strong></span>
              <span>•</span>
              <span>SSO: <strong className="text-emerald-400 font-semibold">{ssoUser.name}</strong> <span className="text-slate-400">({effectiveEmail})</span></span>
              <span>•</span>
              <span>Tier: <strong className="text-amber-400 font-semibold">{activeUser.name}</strong></span>
              <span>•</span>
              <span>Model: <strong className="text-purple-400">{settings.model}</strong></span>
              {settings.omitEmailHeader && (
                <>
                  <span>•</span>
                  <span className="bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/30 flex items-center gap-1">
                    <span>⚠️ Email Omitted</span>
                    <button
                      type="button"
                      onClick={() => setSettings((prev) => ({ ...prev, omitEmailHeader: false }))}
                      className="underline text-white ml-0.5 hover:text-rose-200 cursor-pointer font-bold"
                    >
                      Restore
                    </button>
                  </span>
                </>
              )}
            </div>
            <div>
              <span>Cache: <strong className={settings.useCache ? 'text-emerald-400' : 'text-slate-500'}>{settings.useCache ? 'ENABLED' : 'OFF'}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Clean Telemetry Inspector */}
      <div
        className={`w-full md:w-80 lg:w-96 bg-slate-950 border-l border-slate-800/80 h-full overflow-hidden flex-col shrink-0 ${
          mobileTab === 'trace' ? 'flex flex-1' : 'hidden md:flex'
        }`}
      >
        <GatewayTraceViewer
          telemetry={activeTelemetry}
          settings={settings}
          onToggleCache={() =>
            setSettings((prev) => ({ ...prev, useCache: !prev.useCache }))
          }
        />
      </div>
    </div>
  );
};
