import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, GatewaySettings, GatewayTelemetry, ScenarioPreset, PromptTransactionRecord } from '../types';
import { sendPromptToApigee, getGatewayTargetUrl } from '../services/apigeeClient';
import { GatewayTraceViewer } from './GatewayTraceViewer';
import { SCENARIO_PRESETS, USERS, getUserInfo, DEFAULT_SSO_USER, AUTO_ROUTING_EXAMPLES, CACHE_EXAMPLES, TOKEN_LIMIT_EXAMPLES, UNAUTHORIZED_401_EXAMPLES, MODEL_ARMOR_EXAMPLES } from '../services/defaultSettings';
import { Send, Bot, User, ShieldAlert, Activity, Sparkles, Shield, Database, Globe, RotateCcw, Zap } from 'lucide-react';
import { ApigeeColorSymbol } from './ApigeeLogo';

interface ChatPlaygroundProps {
  settings: GatewaySettings;
  setSettings: React.Dispatch<React.SetStateAction<GatewaySettings>>;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  activeTelemetry: GatewayTelemetry | null;
  setActiveTelemetry: React.Dispatch<React.SetStateAction<GatewayTelemetry | null>>;
  onTransactionRecorded?: (tx: PromptTransactionRecord) => void;
  onResetChat?: () => void;
}

export const ChatPlayground: React.FC<ChatPlaygroundProps> = ({
  settings,
  setSettings,
  messages,
  setMessages,
  activeTelemetry,
  setActiveTelemetry,
  onTransactionRecorded,
  onResetChat,
}) => {
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chat' | 'trace'>('chat');
  const [hasUnreadTrace, setHasUnreadTrace] = useState(false);
  const [cacheStep, setCacheStep] = useState<0 | 1>(0);
  const [autoStep, setAutoStep] = useState<0 | 1 | 2>(0);
  const [tokenStep, setTokenStep] = useState<0 | 1>(0);
  const [authStep, setAuthStep] = useState<0 | 1>(0);
  const [armorStep, setArmorStep] = useState<0 | 1 | 2>(0);
  const [activeSendingUrl, setActiveSendingUrl] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleReset = () => {
    setInputText('');
    if (onResetChat) {
      onResetChat();
    }
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
    const targetUrl = getGatewayTargetUrl(settingsToUse, settingsToUse.model);
    setActiveSendingUrl(targetUrl);

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
        targetUrl: response.telemetry.targetUrl || targetUrl,
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

      if (onTransactionRecorded) {
        onTransactionRecorded({
          id: Date.now().toString(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          userEmail: settingsToUse.userEmail || DEFAULT_SSO_USER.email,
          model: response.telemetry.model,
          provider: response.telemetry.provider || (response.telemetry.model?.startsWith('claude') ? 'anthropic' : 'google'),
          promptTokens: response.telemetry.promptTokens || 0,
          candidatesTokens: response.telemetry.candidatesTokens || 0,
          totalTokens: response.telemetry.totalTokens || 0,
          costUsd: parseFloat(response.telemetry.costUsd || '0'),
          latencyMs: response.telemetry.latencyMs,
          cacheStatus: response.telemetry.cacheStatus,
          status: response.telemetry.status,
          autoRouted: response.telemetry.autoRouted,
        });
      }

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
        targetUrl,
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

  // 6 preset scenarios in strictly requested sequence:
  // 1. Identity check, 2. Unauthorized model, 3. Model Armor, 4. Auto, 5. Semantic cache, 6. No cache
  const sampleChips = [
    {
      label:
        authStep === 0
          ? '🚫 Auth (401): Missing Auth (1/2)'
          : '🚫 Auth (401): Model Block (2/2)',
      promptId: 'unauthorized-toggle',
      title:
        authStep === 0
          ? 'Step 1: Omits Authorization header -> HTTP 401 Unauthorized'
          : 'Step 2: Sales key calling restricted model -> HTTP 401 Forbidden',
      color: 'hover:border-rose-500 hover:text-rose-500',
      icon: ShieldAlert,
      iconColor: 'text-rose-500',
    },
    {
      label:
        armorStep === 0
          ? '🛡️ Armor: Destructive (1/3)'
          : armorStep === 1
          ? '🛡️ Armor: Jailbreak (2/3)'
          : '🛡️ Armor: PII Exfil (3/3)',
      promptId: 'model-armor-toggle',
      title:
        armorStep === 0
          ? 'Step 1: Malicious deletion script -> Intercepted by Model Armor'
          : armorStep === 1
          ? 'Step 2: DAN prompt injection override -> Intercepted by Model Armor'
          : 'Step 3: Confidential SSN/PII exfiltration query -> Intercepted by Model Armor',
      color: 'hover:border-red-500 hover:text-red-500',
      icon: Shield,
      iconColor: 'text-red-500',
    },
    {
      label:
        autoStep === 0
          ? '🧠 Auto: General / Fast (1/3)'
          : autoStep === 1
          ? '🧠 Auto: Deep Reasoning (2/3)'
          : '🧠 Auto: Coding (3/3)',
      promptId: 'auto-routing',
      title:
        autoStep === 0
          ? 'Auto Example 1/3: General query (<200 chars) -> Auto-classified as General / Fast'
          : autoStep === 1
          ? 'Auto Example 2/3: Deep reasoning (trade-offs, benchmark) -> Auto-classified as Deep Reasoning'
          : 'Auto Example 3/3: Coding implementation -> Auto-classified as Coding',
      color: 'hover:border-purple-500 hover:text-purple-500',
      icon: Sparkles,
      iconColor: 'text-purple-500',
    },
    {
      label:
        tokenStep === 0
          ? '⚡ Token Quota: Pass (1/2)'
          : '🛑 Token Limit: Exceeded (2/2)',
      promptId: 'token-limit-toggle',
      title:
        tokenStep === 0
          ? 'Step 1: Request consuming ~90 tokens within product quota limit (HTTP 200 OK)'
          : 'Step 2: Request exceeding product quota limit (HTTP 429 Rate Limit Interception)',
      color:
        tokenStep === 0
          ? 'hover:border-emerald-500 hover:text-emerald-500'
          : 'hover:border-rose-500 hover:text-rose-500',
      icon: tokenStep === 0 ? Zap : ShieldAlert,
      iconColor: tokenStep === 0 ? 'text-emerald-500' : 'text-rose-500',
    },
    {
      label:
        cacheStep === 0
          ? '⚡ Cache: Seed (Miss)'
          : '⚡ Cache: Instant Hit ($0)',
      promptId: 'cache-toggle',
      title:
        cacheStep === 0
          ? 'Step 1: Complex prompt executed live and seeded into Apigee semantic vector cache'
          : 'Step 2: Semantically equivalent prompt served instantly from Apigee vector cache with $0 token cost',
      color: 'hover:border-emerald-500 hover:text-emerald-500',
      icon: Database,
      iconColor: 'text-emerald-500',
    },
    {
      label: '🌐 Direct (No Cache)',
      promptId: 'no-cache',
      title: 'Sends request without use-cache header to verify live inference and latency contrast',
      color: 'hover:border-cyan-500 hover:text-cyan-500',
      icon: Globe,
      iconColor: 'text-cyan-500',
    },
  ];

  const handleAuthStep = (step: 0 | 1, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAuthStep(step);
    const example = UNAUTHORIZED_401_EXAMPLES[step];
    const overrides = (example.settingsOverride || {}) as Partial<GatewaySettings>;
    const effectiveSettings: GatewaySettings = {
      ...settings,
      ...overrides,
    };
    setSettings((prev) => ({
      ...prev,
      ...overrides,
    }));
    handleExecute(example.prompt, effectiveSettings);
  };

  const handleArmorStep = (step: 0 | 1 | 2, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setArmorStep(step);
    const example = MODEL_ARMOR_EXAMPLES[step];
    const effectiveSettings: GatewaySettings = {
      ...settings,
      useCache: false,
      omitEmailHeader: false,
    };
    setSettings((prev) => ({
      ...prev,
      useCache: false,
      omitEmailHeader: false,
    }));
    handleExecute(example.prompt, effectiveSettings);
  };

  const handleAutoRoutingStep = (step: 0 | 1 | 2, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAutoStep(step);
    const example = AUTO_ROUTING_EXAMPLES[step];
    const effectiveSettings: GatewaySettings = {
      ...settings,
      model: 'auto',
      useCache: false,
      omitEmailHeader: false,
    };
    setSettings((prev) => ({
      ...prev,
      model: 'auto',
      useCache: false,
      omitEmailHeader: false,
    }));
    handleExecute(example.prompt, effectiveSettings);
  };

  const handleCacheStep = (step: 0 | 1, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCacheStep(step);
    const example = CACHE_EXAMPLES[step];
    const effectiveSettings: GatewaySettings = {
      ...settings,
      useCache: true,
      model: 'gemini-3.1-flash-lite',
      omitEmailHeader: false,
    };
    setSettings((prev) => ({
      ...prev,
      useCache: true,
      model: 'gemini-3.1-flash-lite',
      omitEmailHeader: false,
    }));
    handleExecute(example.prompt, effectiveSettings);
  };

  const handleTokenStep = (step: 0 | 1, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTokenStep(step);
    const example = TOKEN_LIMIT_EXAMPLES[step];
    const effectiveSettings: GatewaySettings = {
      ...settings,
      useCache: false,
      model: 'gemini-2.0-flash',
      omitEmailHeader: false,
    };
    setSettings((prev) => ({
      ...prev,
      useCache: false,
      model: 'gemini-2.0-flash',
      omitEmailHeader: false,
    }));
    handleExecute(example.prompt, effectiveSettings);
  };

  const handleChipClick = async (chip: (typeof sampleChips)[0]) => {
    if (chip.promptId === 'model-armor-toggle') {
      const nextStep = armorStep;
      handleArmorStep(nextStep);
      setArmorStep(((nextStep + 1) % 3) as 0 | 1 | 2);
      return;
    }
    if (chip.promptId === 'unauthorized-toggle') {
      const nextStep = authStep;
      handleAuthStep(nextStep);
      setAuthStep(nextStep === 0 ? 1 : 0);
      return;
    }
    if (chip.promptId === 'token-limit-toggle') {
      const nextStep = tokenStep;
      handleTokenStep(nextStep);
      setTokenStep(nextStep === 0 ? 1 : 0);
      return;
    }

    if (chip.promptId === 'cache-toggle') {
      const nextStep = cacheStep;
      handleCacheStep(nextStep);
      setCacheStep(nextStep === 0 ? 1 : 0);
      return;
    }

    if (chip.promptId === 'auto-routing') {
      const nextStep = autoStep;
      handleAutoRoutingStep(nextStep);
      setAutoStep(((nextStep + 1) % 3) as 0 | 1 | 2);
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
            <div className="h-full flex flex-col items-center justify-center p-4 sm:p-6 select-none max-w-3xl mx-auto my-auto">
              <div className="w-11 h-11 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-center mb-2.5">
                <ApigeeColorSymbol className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Apigee AI Gateway</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-5 text-center">
                Select a live capability scenario below or enter a custom prompt to inspect gateway governance:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
                {sampleChips.map((chip) => {
                  const preset = SCENARIO_PRESETS.find(
                    (p) =>
                      p.id ===
                      (chip.promptId === 'cache-toggle'
                        ? 'cache-toggle'
                        : chip.promptId)
                  );
                  const Icon = chip.icon || Sparkles;
                  return (
                    <button
                      key={chip.promptId}
                      type="button"
                      onClick={() => handleChipClick(chip)}
                      className="p-3 bg-white dark:bg-slate-900/90 hover:bg-slate-50 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-slate-700 rounded-xl text-left transition group cursor-pointer flex flex-col justify-between gap-2 shadow-xs hover:shadow-sm"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Icon className={`w-4 h-4 shrink-0 ${chip.iconColor || 'text-blue-500'}`} />
                            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition">
                              {preset?.title || chip.label}
                            </span>
                          </div>
                          {preset?.badgeText && (
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 shrink-0 font-medium">
                              {preset.badgeText}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                          {preset?.description || chip.title}
                        </p>
                      </div>

                      {chip.promptId === 'unauthorized-toggle' && (
                        <div className="flex items-center gap-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                          <button
                            type="button"
                            onClick={(e) => handleAuthStep(0, e)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition cursor-pointer ${
                              authStep === 0
                                ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 font-bold border border-rose-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            1. Missing Auth
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleAuthStep(1, e)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition cursor-pointer ${
                              authStep === 1
                                ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 font-bold border border-rose-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            2. Model Block
                          </button>
                        </div>
                      )}

                      {chip.promptId === 'model-armor-toggle' && (
                        <div className="flex items-center gap-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                          <button
                            type="button"
                            onClick={(e) => handleArmorStep(0, e)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition cursor-pointer ${
                              armorStep === 0
                                ? 'bg-red-500/20 text-red-600 dark:text-red-300 font-bold border border-red-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            1. Destructive
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleArmorStep(1, e)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition cursor-pointer ${
                              armorStep === 1
                                ? 'bg-red-500/20 text-red-600 dark:text-red-300 font-bold border border-red-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            2. Jailbreak
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleArmorStep(2, e)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition cursor-pointer ${
                              armorStep === 2
                                ? 'bg-red-500/20 text-red-600 dark:text-red-300 font-bold border border-red-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            3. PII Exfil
                          </button>
                        </div>
                      )}

                      {chip.promptId === 'auto-routing' && (
                        <div className="flex items-center gap-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                          <button
                            type="button"
                            onClick={(e) => handleAutoRoutingStep(0, e)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition cursor-pointer ${
                              autoStep === 0
                                ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300 font-bold border border-purple-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            1. General / Fast
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleAutoRoutingStep(1, e)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition cursor-pointer ${
                              autoStep === 1
                                ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300 font-bold border border-purple-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            2. Deep Reasoning
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleAutoRoutingStep(2, e)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition cursor-pointer ${
                              autoStep === 2
                                ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300 font-bold border border-purple-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            3. Coding
                          </button>
                        </div>
                      )}

                      {chip.promptId === 'cache-toggle' && (
                        <div className="flex items-center gap-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                          <button
                            type="button"
                            onClick={(e) => handleCacheStep(0, e)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition cursor-pointer ${
                              cacheStep === 0
                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-bold border border-emerald-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            1. Seed (Miss)
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleCacheStep(1, e)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition cursor-pointer ${
                              cacheStep === 1
                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-bold border border-emerald-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            2. Instant Hit ($0)
                          </button>
                        </div>
                      )}

                      {chip.promptId === 'token-limit-toggle' && (
                        <div className="flex items-center gap-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                          <button
                            type="button"
                            onClick={(e) => handleTokenStep(0, e)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition cursor-pointer ${
                              tokenStep === 0
                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-bold border border-emerald-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            1. Pass (200 OK)
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleTokenStep(1, e)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition cursor-pointer ${
                              tokenStep === 1
                                ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 font-bold border border-rose-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            2. Exceeded (429)
                          </button>
                        </div>
                      )}
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
                      ? 'bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30'
                      : 'bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-600/20 dark:text-blue-400 dark:border-blue-500/30'
                  }`}
                >
                  {msg.isError ? <ShieldAlert className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-xs transition ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : msg.isError
                    ? 'bg-rose-50/70 text-slate-900 border border-rose-200 dark:bg-slate-900 dark:text-slate-200 dark:border-rose-500/40 rounded-bl-none'
                    : 'bg-white text-slate-900 border border-slate-200 dark:bg-slate-900/90 dark:text-slate-100 dark:border-slate-800 rounded-bl-none'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>

                {/* Inline Telemetry & Target URL Badge on Agent Messages */}
                <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/60 space-y-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  {msg.targetUrl && (
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 font-bold text-[9px] shrink-0">
                        POST
                      </span>
                      <span className="text-slate-500 font-semibold shrink-0">Target URL:</span>
                      <span className="truncate text-blue-700 dark:text-blue-400 select-all font-medium">{msg.targetUrl}</span>
                    </div>
                  )}
                  {msg.telemetry && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`font-semibold ${
                          msg.telemetry.guardrailStatus === 'BLOCKED'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400'
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
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">Vector Cache Hit</span>
                        </>
                      )}
                      <span className="ml-auto opacity-60 text-[9px]">{msg.timestamp}</span>
                    </div>
                  )}
                </div>
              </div>

              {msg.sender === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 mt-0.5 text-slate-700 dark:text-slate-300">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))}

          {/* Prominent Loading / Sending Indicator with Target URL */}
          {loading && (
            <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500/30 text-xs space-y-2 animate-pulse shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-semibold">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping" />
                  <span>Sending prompt to Apigee AI Gateway ({settings.environment.toUpperCase()})...</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 uppercase font-bold">
                  POST
                </span>
              </div>
              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-blue-200/80 dark:border-slate-800 font-mono text-[11px] text-slate-800 dark:text-slate-200 break-all select-all">
                <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="text-blue-700 dark:text-blue-400 font-semibold shrink-0">Request URL:</span>
                <span className="truncate text-slate-900 dark:text-slate-200 font-medium">
                  {activeSendingUrl || getGatewayTargetUrl(settings, settings.model)}
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input & Quick Chips */}
        <div className="p-3 sm:p-3.5 bg-white/90 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800/80 shrink-0 backdrop-blur">
          {/* All 6 Scenario Chips in Exact Required Order */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-2.5 no-scrollbar w-full">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider shrink-0 mr-1">Scenarios:</span>
            {sampleChips.map((chip) => (
              <button
                key={chip.promptId}
                type="button"
                onClick={() => handleChipClick(chip)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 whitespace-nowrap transition cursor-pointer min-h-[32px] hover:bg-slate-200/70 dark:hover:bg-slate-800 shrink-0 ${chip.color}`}
                title={chip.title}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Prompt Input Form */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            {/* Prompt Text Input */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Enter your prompt or select a quick scenario chip above..."
              className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[44px]"
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={loading || !inputText.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white rounded-xl font-medium shadow-xs transition flex items-center justify-center gap-1.5 text-xs sm:text-sm shrink-0 min-h-[44px] cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>

            {/* Reset Button next to Send */}
            <button
              type="button"
              onClick={handleReset}
              className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl font-medium shadow-xs transition flex items-center justify-center gap-1.5 text-xs sm:text-sm shrink-0 min-h-[44px] cursor-pointer"
              title="Clear Chat & Reset Session"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </form>

          {/* Active Status Footer */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mt-2 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span>Gateway: <strong className="text-blue-600 dark:text-blue-400 uppercase font-semibold">{settings.environment}</strong></span>
              <span>•</span>
              <span>SSO: <strong className="text-slate-700 dark:text-slate-200 font-semibold">{ssoUser.name}</strong> <span className="text-slate-400">({effectiveEmail})</span></span>
              <span>•</span>
              <span>Tier: <strong className="text-slate-700 dark:text-slate-200 font-semibold">{activeUser.name}</strong></span>
              <span>•</span>
              <span>Model: <strong className="text-purple-600 dark:text-purple-400 font-semibold">{settings.model === 'auto' ? 'Auto (Intelligent Routing)' : settings.model}</strong></span>
              {settings.omitEmailHeader && (
                <>
                  <span>•</span>
                  <span className="bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-800/60 flex items-center gap-1 font-medium">
                    <span>⚠️ Missing Authorization</span>
                    <button
                      type="button"
                      onClick={() => setSettings((prev) => ({ ...prev, omitEmailHeader: false }))}
                      className="underline text-rose-700 dark:text-rose-200 ml-0.5 hover:text-rose-900 cursor-pointer font-bold"
                    >
                      Restore Auth
                    </button>
                  </span>
                </>
              )}
            </div>

            {/* Interactive Cache Toggle in Footer */}
            <button
              type="button"
              onClick={() => setSettings((prev) => ({ ...prev, useCache: !prev.useCache }))}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-semibold text-[10px] transition cursor-pointer border ${
                settings.useCache
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700 shadow-2xs hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/70'
              }`}
              title={`Semantic Vector Cache is currently ${settings.useCache ? 'ENABLED (use-cache: true)' : 'OFF (live inference)'}. Click to toggle.`}
            >
              <Zap className={`w-3 h-3 ${settings.useCache ? 'text-emerald-600 dark:text-emerald-400 fill-emerald-500/30' : 'text-slate-400'}`} />
              <span>Cache:</span>
              <strong className={settings.useCache ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-slate-500 dark:text-slate-400 font-normal'}>
                {settings.useCache ? 'ENABLED' : 'OFF'}
              </strong>
            </button>
          </div>
        </div>
      </div>

      {/* Right Column: Clean Telemetry Inspector */}
      <div
        className={`w-full md:w-80 lg:w-96 bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800/80 h-full overflow-hidden flex-col shrink-0 ${
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
