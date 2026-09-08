import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, GatewaySettings, GatewayTelemetry, ScenarioPreset } from '../types';
import { sendPromptToApigee } from '../services/apigeeClient';
import { GatewayTraceViewer } from './GatewayTraceViewer';
import { SCENARIO_PRESETS, USERS, getUserInfo, DEFAULT_SSO_USER } from '../services/defaultSettings';
import { Send, Bot, User, ShieldAlert, Activity } from 'lucide-react';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleExecute = async (promptToSend: string, settingsToUse: GatewaySettings) => {
    if (!promptToSend.trim() || loading) return;

    const userMsgText = promptToSend.trim();
    setInputText('');

    const userMessage: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: userMsgText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const result = await sendPromptToApigee(userMsgText, settingsToUse, messages);

      const agentMessage: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'agent',
        text: result.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model: result.telemetry.model,
        isError: !result.success,
        telemetry: result.telemetry,
      };

      setMessages((prev) => [...prev, agentMessage]);
      setActiveTelemetry(result.telemetry);
      if (mobileTab === 'chat') {
        setHasUnreadTrace(true);
      }
    } catch (err: any) {
      const userInfo = getUserInfo(settingsToUse.activeUser);
      const errorTelemetry: GatewayTelemetry = {
        status: 500,
        statusText: 'Client Error',
        endpointUrl: '',
        model: settingsToUse.model,
        environment: settingsToUse.environment,
        user: userInfo.name,
        userEmail: settingsToUse.userEmail || userInfo.email,
        latencyMs: 0,
        cacheStatus: settingsToUse.useCache ? 'MISS' : 'DISABLED',
        guardrailStatus: 'NONE',
        headersSent: {},
        headersReceived: {},
        rawRequest: { prompt: userMsgText },
        rawResponse: { error: err.message },
      };

      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'agent',
        text: `⚠️ Execution error: ${err.message}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
        telemetry: errorTelemetry,
      };

      setMessages((prev) => [...prev, errorMsg]);
      setActiveTelemetry(errorTelemetry);
      if (mobileTab === 'chat') {
        setHasUnreadTrace(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (settings.omitEmailHeader) {
      setSettings((prev) => ({ ...prev, omitEmailHeader: false }));
    }
    handleExecute(inputText, { ...settings, omitEmailHeader: false });
  };

  const handleSelectSample = (preset: ScenarioPreset) => {
    const isIdentityTest = preset.id === 'zero-trust-identity';

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

    // Persist visual/user settings (model, user, cache) but NEVER persist omitEmailHeader
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

  // Primary sample prompt chips
  const sampleChips = [
    {
      label: '⚡ Apigee Overview',
      promptId: 'apigee-summary',
      color: 'hover:border-blue-500 hover:text-blue-300',
    },
    {
      label: '🛡️ Test Model Armor',
      promptId: 'model-armor-block',
      color: 'hover:border-rose-500 hover:text-rose-300',
    },
    {
      label: '⚡ Test Semantic Cache',
      promptId: 'cache-hit',
      color: 'hover:border-emerald-500 hover:text-emerald-300',
    },
    {
      label: '🔒 Test Identity Check',
      promptId: 'zero-trust-identity',
      color: 'hover:border-orange-500 hover:text-orange-300',
    },
  ];

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
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 select-none">
              <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mb-2.5 text-blue-400">
                <Bot className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-400 font-medium">Apigee AI Gateway</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Send a prompt or pick a quick demo chip below.</p>
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
            {sampleChips.map((chip) => {
              const preset = SCENARIO_PRESETS.find((p) => p.id === chip.promptId);
              if (!preset) return null;
              return (
                <button
                  key={chip.promptId}
                  type="button"
                  onClick={() => handleSelectSample(preset)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium bg-slate-900 border border-slate-800 text-slate-300 whitespace-nowrap transition cursor-pointer min-h-[32px] ${chip.color}`}
                >
                  {chip.label}
                </button>
              );
            })}
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
