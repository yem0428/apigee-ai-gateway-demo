import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage, GatewaySettings, GatewayTelemetry, ScenarioPreset, PromptTransactionRecord } from '../types';
import { sendPromptToApigee, getGatewayTargetUrl } from '../services/apigeeClient';
import { TourActionId } from '../services/tourSteps';
import { GatewayTraceViewer } from './GatewayTraceViewer';
import { SCENARIO_PRESETS, USERS, getUserInfo, DEFAULT_SSO_USER, AUTO_ROUTING_EXAMPLES, CACHE_EXAMPLES, TOKEN_LIMIT_EXAMPLES, UNAUTHORIZED_401_EXAMPLES, MODEL_ARMOR_EXAMPLES, CLAUDE_CLI_OVERRIDE_EXAMPLES } from '../services/defaultSettings';
import { Send, Bot, User, ShieldAlert, Activity, Sparkles, Shield, Database, Globe, RotateCcw, Zap, Workflow, Terminal } from 'lucide-react';
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
  onOpenRequestFlow?: (telemetry: GatewayTelemetry) => void;
  /**
   * A scenario the guided tour wants run. The tour narrates live responses rather than
   * screenshots, so it reuses the exact handlers behind the demo chips - there is no
   * second, tour-only code path that could drift from what the chips actually do.
   */
  tourAction?: TourActionId | null;
  onTourActionHandled?: () => void;
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
  onOpenRequestFlow,
  tourAction,
  onTourActionHandled,
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
  const [claudeStep, setClaudeStep] = useState<0 | 1>(0);
  const [pendingConfirmIntercept, setPendingConfirmIntercept] = useState<{
    prompt: string;
    requestedModel: string;
    clientSource: string;
  } | null>(null);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaScope, setQuotaScope] = useState<'Person' | 'Team'>('Team');
  const [quotaNewTokens, setQuotaNewTokens] = useState(10000);
  const [quotaReason, setQuotaReason] = useState('Unattended subagent sprint & high-frequency analysis');
  const [quotaSubmitting, setQuotaSubmitting] = useState(false);
  const [quotaSuccessMsg, setQuotaSuccessMsg] = useState<string | null>(null);
  const [activeSendingUrl, setActiveSendingUrl] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleReset = () => {
    setInputText('');
    setPendingConfirmIntercept(null);
    setQuotaSuccessMsg(null);
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

      /*
        One object, two references - deliberately.

        The inspector works out which call it is showing by comparing `activeTelemetry`
        against each message's `telemetry` by identity, because two calls in a demo
        routinely have byte-identical field values (replaying a prompt to show a cache
        hit is exactly that). Cloning this into two equal-but-separate objects silently
        breaks that: the inspector can never match a message, so the comparison band and
        the historical-call banner never appear.
      */
      const callTelemetry: GatewayTelemetry = {
        ...response.telemetry,
        userEmail: settingsToUse.userEmail || DEFAULT_SSO_USER.email,
      };

      const agentMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'agent',
        text: response.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model: response.telemetry.model,
        isError: !response.success,
        targetUrl: response.telemetry.targetUrl || targetUrl,
        telemetry: callTelemetry,
      };

      setMessages((prev) => [...prev, agentMessage]);
      setActiveTelemetry(callTelemetry);

      if (onTransactionRecorded) {
        onTransactionRecorded({
          id: Date.now().toString(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          userEmail: settingsToUse.userEmail || DEFAULT_SSO_USER.email,
          // PromptTransactionRecord requires strings. An unattributed cache hit
          // gets its own bucket rather than being credited to a model that may
          // not have produced the cached bytes.
          model: response.telemetry.model || 'served-from-cache',
          provider: response.telemetry.provider
            || (response.telemetry.model
              ? (response.telemetry.model.startsWith('claude') ? 'anthropic' : 'google')
              : 'cache'),
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
    const trimmed = inputText.trim();
    // If developer manually targets claude-opus-4-5@20251101 with a short/simple query, trigger the Claude Code CLI Confirm Intercept
    if (settings.model === 'claude-opus-4-5@20251101' && trimmed.length < 75 && !pendingConfirmIntercept) {
      setPendingConfirmIntercept({
        prompt: trimmed,
        requestedModel: 'claude-opus-4-5@20251101',
        clientSource: 'claude-code-cli',
      });
      setInputText('');
      return;
    }
    let settingsToUse: GatewaySettings = {
      ...settings,
      omitEmailHeader: false,
      clientSource: undefined,
      subagentName: undefined,
      overrideMode: undefined,
      originalRequestedModel: undefined,
    };
    if (settings.model === 'auto' && settings.activeUser !== 'admin') {
      settingsToUse = {
        ...settingsToUse,
        activeUser: 'admin',
        keyTier: 'admin',
        apiKey: USERS.admin.apiKey,
      };
    }
    if (settings.omitEmailHeader) {
      setSettings((prev) => ({ ...prev, omitEmailHeader: false }));
    }
    handleExecute(trimmed, settingsToUse);
  };

  const handleClaudeStep = (step: 0 | 1, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setClaudeStep(step);
    const example = CLAUDE_CLI_OVERRIDE_EXAMPLES[step];
    if (step === 0) {
      // Step 0: Interactive Developer Confirmation Mode in Claude Code CLI
      setSettings((prev) => ({
        ...prev,
        activeUser: 'admin',
        keyTier: 'admin',
        apiKey: USERS.admin.apiKey,
        model: 'claude-opus-4-5@20251101',
        useCache: false,
        omitEmailHeader: false,
      }));
      setPendingConfirmIntercept({
        prompt: example.prompt,
        requestedModel: example.requestedModel,
        clientSource: 'claude-code-cli (Interactive Developer Session)',
      });
      return;
    }

    // Step 1: Unattended Claude Code Subagent Policy Auto-Override
    setPendingConfirmIntercept(null);
    const effectiveSettings: GatewaySettings = {
      ...settings,
      activeUser: 'admin',
      keyTier: 'admin',
      apiKey: USERS.admin.apiKey,
      model: example.requestedModel,
      useCache: false,
      omitEmailHeader: false,
      clientSource: 'claude-code-cli',
      subagentName: example.subagentName || 'subagent:code-worker',
      overrideMode: 'auto-override',
      originalRequestedModel: example.requestedModel,
    };
    setSettings((prev) => ({
      ...prev,
      activeUser: 'admin',
      keyTier: 'admin',
      apiKey: USERS.admin.apiKey,
      model: example.requestedModel,
      useCache: false,
      omitEmailHeader: false,
    }));
    handleExecute(example.prompt, effectiveSettings);
  };

  const handleConfirmInterceptDecision = (chosenModel: string, mode: 'confirmed-switch' | 'confirmed-keep') => {
    if (!pendingConfirmIntercept) return;
    const { prompt, requestedModel } = pendingConfirmIntercept;
    setPendingConfirmIntercept(null);
    const effectiveSettings: GatewaySettings = {
      ...settings,
      activeUser: 'admin',
      keyTier: 'admin',
      apiKey: USERS.admin.apiKey,
      model: chosenModel,
      useCache: false,
      omitEmailHeader: false,
      clientSource: 'claude-code-cli',
      overrideMode: mode,
      originalRequestedModel: requestedModel,
    };
    setSettings((prev) => ({
      ...prev,
      activeUser: 'admin',
      keyTier: 'admin',
      apiKey: USERS.admin.apiKey,
      model: chosenModel,
      useCache: false,
      omitEmailHeader: false,
    }));
    handleExecute(prompt, effectiveSettings);
  };

  const handleSubmitQuotaIncrease = async () => {
    setQuotaSubmitting(true);
    const teamLabel = 'SGX Quantitative Engineering';
    try {
      const res = await fetch('/api/quotas/request-increase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: quotaScope,
          requester: settings.ssoUser?.email || settings.userEmail || DEFAULT_SSO_USER.email,
          team: teamLabel,
          model: 'claude-haiku-4-5@20251001',
          requestedTokensPerMin: quotaNewTokens,
          requestedBudgetUsd: 500,
          reason: quotaReason,
          autoApprove: true,
        }),
      });
      if (res.ok) {
        setShowQuotaModal(false);
        setQuotaSuccessMsg(
          `Quota Increase Approved (${quotaScope}: ${quotaScope === 'Team' ? teamLabel : (settings.ssoUser?.email || DEFAULT_SSO_USER.email)}) — Limit raised from 50 to ${quotaNewTokens.toLocaleString()} tokens/min on claude-haiku-4-5@20251001! Re-run the prompt to verify 200 OK.`
        );
      }
    } catch {
      // Ignore network error
    } finally {
      setQuotaSubmitting(false);
    }
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
                apiKey: USERS[preset.settingsOverride.activeUser]?.apiKey || '',
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
      label:
        claudeStep === 0
          ? '🤖 Claude Code: Confirm Switch (1/2)'
          : '🤖 Claude Subagent: Auto-Override (2/2)',
      promptId: 'claude-cli-override',
      title:
        claudeStep === 0
          ? 'Step 1 (Developer Confirm Mode): Simple query on expensive Claude Opus 4.5 -> Gateway asks developer to confirm switching to Flash Lite or DeepSeek V4 (99.5% savings)'
          : 'Step 2 (Unattended Subagent Mode): Claude Code subagent requests Opus 4.5 -> Gateway Policy automatically overrides to DeepSeek V4 on Vertex SGX Tenancy',
      color: 'hover:border-amber-500 hover:text-amber-600',
      icon: Terminal,
      iconColor: 'text-amber-500',
    },
    {
      label:
        authStep === 0
          ? '🚫 Access Control: Missing Auth (1/2)'
          : '🚫 Access Control: Restricted Model (2/2)',
      promptId: 'unauthorized-toggle',
      title:
        authStep === 0
          ? 'Step 1: Ordinary request with no caller identity -> HTTP 401 Unauthorized'
          : 'Step 2: Enterprise key calling a model its product does not entitle -> HTTP 401 Unauthorized',
      color: 'hover:border-rose-500 hover:text-rose-500',
      icon: ShieldAlert,
      iconColor: 'text-rose-500',
    },
    {
      label:
        armorStep === 0
          ? '🛡️ Model Armor: Destructive (1/3)'
          : armorStep === 1
          ? '🛡️ Model Armor: Jailbreak (2/3)'
          : '🛡️ Model Armor: PII Exfil (3/3)',
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
          ? '🧠 Model Routing: Simple / Fast (1/3)'
          : autoStep === 1
          ? '🧠 Model Routing: Deep Reasoning (2/3)'
          : '🧠 Model Routing: Coding (3/3)',
      promptId: 'auto-routing',
      title:
        autoStep === 0
          ? 'Auto Example 1/3: Trivial factual lookup -> Auto-classified as Simple'
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
          ? '⚡ Tokenomics: Within Limit (1/2)'
          : '🛑 Tokenomics: Limit Exceeded (2/2)',
      promptId: 'token-limit-toggle',
      title:
        tokenStep === 0
          ? 'Step 1: Request consuming ~90 tokens within product quota limit (HTTP 200 OK)'
          : 'Step 2: Request exceeding product quota limit (HTTP 429 Rate Limit Interception + Inbuilt Quota Increase Request)',
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
          ? 'Step 1: Complex prompt executed live and seeded into semantic vector cache'
          : 'Step 2: Semantically equivalent prompt served instantly from vector cache with $0 token cost',
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

  const handleAutoRoutingStep = (step: 0 | 1 | 2, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAutoStep(step);
    const example = AUTO_ROUTING_EXAMPLES[step];
    const targetPersona = 'admin';
    const effectiveSettings: GatewaySettings = {
      ...settings,
      activeUser: targetPersona,
      keyTier: 'admin',
      apiKey: USERS.admin.apiKey,
      model: 'auto',
      useCache: false,
      omitEmailHeader: false,
    };
    setSettings((prev) => ({
      ...prev,
      activeUser: targetPersona,
      keyTier: 'admin',
      apiKey: USERS.admin.apiKey,
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
    const targetPersona = 'admin';
    const effectiveSettings: GatewaySettings = {
      ...settings,
      activeUser: targetPersona,
      keyTier: 'admin',
      apiKey: USERS.admin.apiKey,
      useCache: false,
      model: 'claude-haiku-4-5@20251001',
      omitEmailHeader: false,
    };
    setSettings((prev) => ({
      ...prev,
      activeUser: targetPersona,
      keyTier: 'admin',
      apiKey: USERS.admin.apiKey,
      useCache: false,
      model: 'claude-haiku-4-5@20251001',
      omitEmailHeader: false,
    }));
    handleExecute(example.prompt, effectiveSettings);
  };

  const handleChipClick = async (chip: (typeof sampleChips)[0]) => {
    if (chip.promptId === 'claude-cli-override') {
      const nextStep = claudeStep;
      handleClaudeStep(nextStep);
      setClaudeStep(nextStep === 0 ? 1 : 0);
      return;
    }
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

  /*
    Run whatever scenario the tour asked for, then immediately tell the parent it has
    been consumed so the same request cannot re-fire on the next render.

    Deliberately keyed on `tourAction` alone. The handlers it calls are redefined on
    every render, so depending on them would re-run this effect - and therefore re-send
    a real, billable gateway call - on every keystroke in the prompt box.
  */
  useEffect(() => {
    if (!tourAction) return;
    switch (tourAction) {
      case 'auto-simple':
        handleAutoRoutingStep(0);
        break;
      case 'auto-coding':
        handleAutoRoutingStep(2);
        break;
      case 'cache-seed':
        handleCacheStep(0);
        break;
      case 'cache-hit':
        handleCacheStep(1);
        break;
    }
    onTourActionHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourAction]);

  const activeUser = getUserInfo(settings.activeUser);
  const ssoUser = settings.ssoUser || DEFAULT_SSO_USER;
  const effectiveEmail = ssoUser.email || settings.userEmail || DEFAULT_SSO_USER.email;


  /** The id of the message whose telemetry the inspector is currently showing. */
  const selectedMessageId = useMemo(() => {
    if (!activeTelemetry) return undefined;
    // Compared by identity: telemetry objects are stored per message and never cloned,
    // so this stays correct even when two calls have identical field values (which is
    // exactly what happens when you replay the same prompt to demonstrate a cache hit).
    return messages.find((m) => m.telemetry === activeTelemetry)?.id;
  }, [messages, activeTelemetry]);

  const latestTelemetryMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.sender === 'agent' && m.telemetry) return m.id;
    }
    return undefined;
  }, [messages]);

  const isViewingHistoricalCall =
    !!selectedMessageId && !!latestTelemetryMessageId && selectedMessageId !== latestTelemetryMessageId;



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
        className={`flex-1 flex flex-col surface-flow border-r border-slate-200 h-full overflow-hidden ${
          mobileTab === 'chat' ? 'flex' : 'hidden md:flex'
        }`}
      >
        {/* Messages Feed */}
        <div data-tour-id="chat-messages" className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center p-4 sm:p-6 select-none max-w-3xl mx-auto my-auto">
              <div className="w-11 h-11 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center mb-2.5">
                <ApigeeColorSymbol className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">AI Gateway</h3>
              <p className="text-xs text-slate-500 mt-0.5 mb-5 text-center">
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
                      className="p-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-400 rounded-xl text-left transition group cursor-pointer flex flex-col justify-between gap-2 shadow-xs hover:shadow-sm"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Icon className={`w-4 h-4 shrink-0 ${chip.iconColor || 'text-blue-500'}`} />
                            <span className="text-xs font-semibold text-slate-900 group-hover:text-blue-600 transition">
                              {preset?.title || chip.label}
                            </span>
                          </div>
                          {preset?.badgeText && (
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 shrink-0 font-medium">
                              {preset.badgeText}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                          {preset?.description || chip.title}
                        </p>
                      </div>

                      {chip.promptId === 'unauthorized-toggle' && (
                        <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-100 w-full">
                          <button
                            type="button"
                            onClick={(e) => handleAuthStep(0, e)}
                            className={`w-full text-center text-[9px] px-1 py-0.5 rounded font-mono transition cursor-pointer whitespace-nowrap ${
                              authStep === 0
                                ? 'bg-rose-500/20 text-rose-600 font-bold border border-rose-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            Missing Auth
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleAuthStep(1, e)}
                            className={`w-full text-center text-[9px] px-1 py-0.5 rounded font-mono transition cursor-pointer whitespace-nowrap ${
                              authStep === 1
                                ? 'bg-rose-500/20 text-rose-600 font-bold border border-rose-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            Restricted Model
                          </button>
                        </div>
                      )}

                      {chip.promptId === 'model-armor-toggle' && (
                        <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-slate-100 w-full">
                          <button
                            type="button"
                            onClick={(e) => handleArmorStep(0, e)}
                            className={`w-full text-center text-[8.5px] px-0.5 py-0.5 rounded font-mono tracking-tight transition cursor-pointer whitespace-nowrap ${
                              armorStep === 0
                                ? 'bg-red-500/20 text-red-600 font-bold border border-red-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            Destructive
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleArmorStep(1, e)}
                            className={`w-full text-center text-[8.5px] px-0.5 py-0.5 rounded font-mono tracking-tight transition cursor-pointer whitespace-nowrap ${
                              armorStep === 1
                                ? 'bg-red-500/20 text-red-600 font-bold border border-red-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            Jailbreak
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleArmorStep(2, e)}
                            className={`w-full text-center text-[8.5px] px-0.5 py-0.5 rounded font-mono tracking-tight transition cursor-pointer whitespace-nowrap ${
                              armorStep === 2
                                ? 'bg-red-500/20 text-red-600 font-bold border border-red-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            PII Exfil
                          </button>
                        </div>
                      )}

                      {chip.promptId === 'auto-routing' && (
                        <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-slate-100 w-full">
                          <button
                            type="button"
                            onClick={(e) => handleAutoRoutingStep(0, e)}
                            className={`w-full text-center text-[8.5px] px-0.5 py-0.5 rounded font-mono tracking-tight transition cursor-pointer whitespace-nowrap ${
                              autoStep === 0
                                ? 'bg-purple-500/20 text-purple-600 font-bold border border-purple-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            Simple
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleAutoRoutingStep(1, e)}
                            className={`w-full text-center text-[8.5px] px-0.5 py-0.5 rounded font-mono tracking-tight transition cursor-pointer whitespace-nowrap ${
                              autoStep === 1
                                ? 'bg-purple-500/20 text-purple-600 font-bold border border-purple-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            Reasoning
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleAutoRoutingStep(2, e)}
                            className={`w-full text-center text-[8.5px] px-0.5 py-0.5 rounded font-mono tracking-tight transition cursor-pointer whitespace-nowrap ${
                              autoStep === 2
                                ? 'bg-purple-500/20 text-purple-600 font-bold border border-purple-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            Coding
                          </button>
                        </div>
                      )}

                      {chip.promptId === 'claude-cli-override' && (
                        <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-100 w-full">
                          <button
                            type="button"
                            onClick={(e) => handleClaudeStep(0, e)}
                            className={`w-full text-center text-[8.5px] px-1 py-0.5 rounded font-mono transition cursor-pointer whitespace-nowrap ${
                              claudeStep === 0
                                ? 'bg-indigo-500/20 text-indigo-600 font-bold border border-indigo-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            1. Dev Confirm
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleClaudeStep(1, e)}
                            className={`w-full text-center text-[8.5px] px-1 py-0.5 rounded font-mono transition cursor-pointer whitespace-nowrap ${
                              claudeStep === 1
                                ? 'bg-indigo-500/20 text-indigo-600 font-bold border border-indigo-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            2. Subagent Override
                          </button>
                        </div>
                      )}

                      {chip.promptId === 'cache-toggle' && (
                        <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-100 w-full">
                          <button
                            type="button"
                            onClick={(e) => handleCacheStep(0, e)}
                            className={`w-full text-center text-[9px] px-1 py-0.5 rounded font-mono transition cursor-pointer whitespace-nowrap ${
                              cacheStep === 0
                                ? 'bg-emerald-500/20 text-emerald-600 font-bold border border-emerald-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            Seed (Miss)
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleCacheStep(1, e)}
                            className={`w-full text-center text-[9px] px-1 py-0.5 rounded font-mono transition cursor-pointer whitespace-nowrap ${
                              cacheStep === 1
                                ? 'bg-emerald-500/20 text-emerald-600 font-bold border border-emerald-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            Instant Hit ($0)
                          </button>
                        </div>
                      )}

                      {chip.promptId === 'token-limit-toggle' && (
                        <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-100 w-full">
                          <button
                            type="button"
                            onClick={(e) => handleTokenStep(0, e)}
                            className={`w-full text-center text-[9px] px-1 py-0.5 rounded font-mono transition cursor-pointer whitespace-nowrap ${
                              tokenStep === 0
                                ? 'bg-emerald-500/20 text-emerald-600 font-bold border border-emerald-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            Pass (200 OK)
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleTokenStep(1, e)}
                            className={`w-full text-center text-[9px] px-1 py-0.5 rounded font-mono transition cursor-pointer whitespace-nowrap ${
                              tokenStep === 1
                                ? 'bg-rose-500/20 text-rose-600 font-bold border border-rose-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            Exceeded (429)
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
                      ? 'bg-rose-50 text-rose-600 border border-rose-200'
                      : 'bg-blue-50 text-blue-600 border border-blue-200'
                  }`}
                >
                  {msg.isError ? <ShieldAlert className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>
              )}

              {(() => {
                const selectable = msg.sender === 'agent' && !!msg.telemetry;
                const isSelected = selectable && msg.id === selectedMessageId;
                const bubbleClass = `max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-xs transition text-left ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : msg.isError
                    ? 'bg-rose-50/70 text-slate-900 border border-rose-200 rounded-bl-none'
                    : 'bg-white text-slate-900 border border-slate-200 rounded-bl-none'
                } ${
                  selectable ? 'cursor-pointer hover:border-blue-300 hover:shadow-sm' : ''
                } ${
                  isSelected ? 'ring-2 ring-blue-500/70 border-blue-300' : ''
                }`;

                const body = (
                  <>
                    <div className="whitespace-pre-wrap">{msg.text}</div>

                    {/* Inline Quota Increase Action on 429 Exceeded Bubbles */}
                    {msg.telemetry?.status === 429 && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-[11px] text-amber-900 font-sans">
                          <span className="font-bold">SGX Self-Service Quota Governance:</span> Need a higher token limit for your Person / Team?
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowQuotaModal(true);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-sans font-bold text-[11px] transition cursor-pointer shadow-2xs"
                        >
                          ⚡ Request Quota Increase (Person / Team)
                        </button>
                      </div>
                    )}

                {/* Inline Telemetry & Target URL Badge on Agent Messages */}
                <div className="mt-2 pt-1.5 border-t border-slate-100 space-y-1 text-[10px] text-slate-500 font-mono">
                  {msg.targetUrl && (
                    <div className="flex items-center justify-between gap-2 overflow-hidden">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 font-bold text-[9px] shrink-0">
                          POST
                        </span>
                        <span className="text-slate-500 font-semibold shrink-0">Target URL:</span>
                        <span className="truncate text-blue-700 select-all font-medium">{msg.targetUrl}</span>
                      </div>
                      {msg.telemetry && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTelemetry(msg.telemetry!);
                            }}
                            aria-pressed={msg.id === selectedMessageId}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-sans font-semibold text-[10px] transition cursor-pointer shadow-2xs border ${
                              msg.id === selectedMessageId
                                ? 'bg-slate-200 text-slate-900 border-slate-400 font-bold'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                            }`}
                            title="Show this call's telemetry in the inspector"
                          >
                            <Activity className="w-3 h-3" />
                            <span>Telemetry</span>
                          </button>
                          {onOpenRequestFlow && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenRequestFlow(msg.telemetry!);
                              }}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-sans font-semibold text-[10px] transition cursor-pointer shadow-2xs"
                              title="View Exact Execution Flow Diagram for This Request"
                            >
                              <Workflow className="w-3 h-3 text-blue-600" />
                              <span>Request Flow</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {msg.telemetry && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`font-semibold ${
                          msg.telemetry.guardrailStatus === 'BLOCKED'
                            ? 'text-rose-600'
                            : 'text-emerald-600'
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
                          <span className="text-emerald-600 font-bold">Vector Cache Hit</span>
                        </>
                      )}
                      <span className="ml-auto opacity-60 text-[9px]">{msg.timestamp}</span>
                    </div>
                  )}

                  {msg.telemetry?.autoRouted && msg.telemetry.model && (
                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                      <span
                        data-routed-model={msg.telemetry.model}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-purple-200 bg-purple-50 text-purple-700 font-sans font-semibold text-[9px]"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span className="uppercase tracking-wide opacity-70">Routed to</span>
                        <span className="font-mono">{msg.telemetry.model}</span>
                      </span>
                    </div>
                  )}

                  {msg.telemetry?.overrideApplied && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 font-sans font-semibold text-[9px]">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Gateway Model Override:</span>
                        <span className="font-mono line-through text-rose-600">{msg.telemetry.requestedModel}</span>
                        <span>→</span>
                        <span className="font-mono text-emerald-700 font-bold">{msg.telemetry.model}</span>
                      </span>
                      {msg.telemetry.vertexTenancy && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 font-mono text-[9px]">
                          Tenancy: {msg.telemetry.vertexTenancy}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                  </>
                );

                if (!selectable) {
                  return <div className={bubbleClass}>{body}</div>;
                }
                return (
                  <div
                    onClick={() => setActiveTelemetry(msg.telemetry!)}
                    className={bubbleClass}
                  >
                    {body}
                  </div>
                );
              })()}

              {msg.sender === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5 text-slate-700">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))}

          {/* Interactive Claude Code CLI Cost-Guardrail Confirmation Terminal Window */}
          {pendingConfirmIntercept && (
            <div className="rounded-2xl overflow-hidden border-2 border-amber-500/70 bg-slate-950 text-slate-100 shadow-xl font-mono text-xs">
              {/* macOS Terminal Header Bar */}
              <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  <span className="ml-2 text-[11px] font-bold text-amber-400">
                    ✻ Claude Code CLI v2.1.19 — ANTHROPIC_BASE_URL=https://bap.api.136.81.199.107.nip.io/ai/v1
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold">
                  SGX-Interactive-Model-Downgrade-Confirm
                </span>
              </div>

              {/* Terminal Body */}
              <div className="p-4 space-y-3">
                <div className="text-slate-300">
                  <span className="text-amber-400 font-bold">claude ({pendingConfirmIntercept.requestedModel}) &gt; </span>
                  <span className="text-white">{pendingConfirmIntercept.prompt}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/40 space-y-1.5 text-[11px]">
                  <div className="text-amber-400 font-bold">
                    ⚡ APIGEE AI GATEWAY — COST &amp; MODEL ROUTING GUARDRAIL (SGX TENANCY)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-slate-300 pt-1">
                    <div>
                      • Client Source: <span className="text-white font-semibold">{pendingConfirmIntercept.clientSource}</span>
                    </div>
                    <div>
                      • Complexity Score: <span className="text-emerald-400 font-semibold">0.12 (Low / Simple Lookup)</span>
                    </div>
                    <div>
                      • Requested Model: <span className="text-rose-400 font-semibold">{pendingConfirmIntercept.requestedModel}</span> ($15.00 / $75.00 per 1M)
                    </div>
                    <div>
                      • Recommended: <span className="text-emerald-400 font-semibold">gemini-3.1-flash-lite</span> ($0.075 / 1M • 99.5% Saved)
                    </div>
                  </div>
                </div>

                <div className="text-amber-200/90 text-[11px]">
                  ? Apigee AI Gateway paused this expensive Opus 4.5 call. Select how Claude Code CLI should route this request:
                </div>

                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleConfirmInterceptDecision('gemini-3.1-flash-lite', 'confirmed-switch')}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition cursor-pointer shadow-xs text-left"
                  >
                    [1] Switch to gemini-3.1-flash-lite ($0.075/1M • Save 99.5%)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmInterceptDecision('deepseek-v4', 'confirmed-switch')}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition cursor-pointer shadow-xs text-left"
                  >
                    [2] Switch to deepseek-v4 (Vertex SGX Tenancy • Save 98.2%)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmInterceptDecision(pendingConfirmIntercept.requestedModel, 'confirmed-keep')}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-medium text-xs transition cursor-pointer text-left"
                  >
                    [3] Keep {pendingConfirmIntercept.requestedModel} ($15/$75 • Audit Log)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quota Approval Success Banner */}
          {quotaSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">✅</span>
                <span className="font-semibold">{quotaSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setQuotaSuccessMsg(null)}
                className="text-[11px] underline text-emerald-700 hover:text-emerald-900 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Prominent Loading / Sending Indicator with Target URL */}
          {loading && (
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs space-y-2 animate-pulse shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-blue-700 font-semibold">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping" />
                  <span>Sending prompt to AI Gateway ({settings.environment.toUpperCase()})...</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 uppercase font-bold">
                  POST
                </span>
              </div>
              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-blue-200/80 font-mono text-[11px] text-slate-800 break-all select-all">
                <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="text-blue-700 font-semibold shrink-0">Request URL:</span>
                <span className="truncate text-slate-900 font-medium">
                  {activeSendingUrl || getGatewayTargetUrl(settings, settings.model)}
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input & Quick Chips */}
        <div className="p-3 sm:p-3.5 bg-white/90 border-t border-slate-200 shrink-0 backdrop-blur">
          <div
            data-tour-id="scenario-presets"
            className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-2.5 no-scrollbar w-full"
          >
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider shrink-0 mr-1">Scenarios:</span>
            {sampleChips.map((chip) => (
              <button
                key={chip.promptId}
                type="button"
                onClick={() => handleChipClick(chip)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium bg-slate-100 border border-slate-200 text-slate-700 whitespace-nowrap transition cursor-pointer min-h-[32px] hover:bg-slate-200/70 shrink-0 ${chip.color}`}
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
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[44px]"
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={loading || !inputText.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-medium shadow-xs transition flex items-center justify-center gap-1.5 text-xs sm:text-sm shrink-0 min-h-[44px] cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>

            {/* Reset Button next to Send */}
            <button
              type="button"
              onClick={handleReset}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl font-medium shadow-xs transition flex items-center justify-center gap-1.5 text-xs sm:text-sm shrink-0 min-h-[44px] cursor-pointer"
              title="Clear Chat & Reset Session"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </form>

          {/* Active Status Footer */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mt-2 text-[10px] text-slate-500 font-mono">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span>Gateway: <strong className="text-blue-600 uppercase font-semibold">{settings.environment}</strong></span>
              <span>•</span>
              <span>SSO: <strong className="text-slate-700 font-semibold">{ssoUser.name}</strong> <span className="text-slate-400">({effectiveEmail})</span></span>
              <span>•</span>
              <span>Tier: <strong className="text-slate-700 font-semibold">{activeUser.name}</strong></span>
              <span>•</span>
              <span>Model: <strong className="text-purple-600 font-semibold">{settings.model === 'auto' ? 'Auto (Intelligent Routing)' : settings.model}</strong></span>
              {settings.omitEmailHeader && (
                <>
                  <span>•</span>
                  <span className="bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200 flex items-center gap-1 font-medium">
                    <span>⚠️ Missing Authorization</span>
                    <button
                      type="button"
                      onClick={() => setSettings((prev) => ({ ...prev, omitEmailHeader: false }))}
                      className="underline text-rose-700 ml-0.5 hover:text-rose-900 cursor-pointer font-bold"
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
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-200/70'
              }`}
              title={`Semantic Vector Cache is currently ${settings.useCache ? 'ENABLED (use-cache: true)' : 'OFF (live inference)'}. Click to toggle.`}
            >
              <Zap className={`w-3 h-3 ${settings.useCache ? 'text-emerald-600 fill-emerald-500/30' : 'text-slate-400'}`} />
              <span>Cache:</span>
              <strong className={settings.useCache ? 'text-emerald-700 font-bold' : 'text-slate-500 font-normal'}>
                {settings.useCache ? 'ENABLED' : 'OFF'}
              </strong>
            </button>
          </div>
        </div>
      </div>

      {/* Right Column: Clean Telemetry Inspector */}
      <div
        className={`w-full md:w-80 lg:w-96 surface-telemetry border-l border-slate-200 h-full overflow-hidden flex-col shrink-0 ${
          mobileTab === 'trace' ? 'flex flex-1' : 'hidden md:flex'
        }`}
      >
        <GatewayTraceViewer
          telemetry={activeTelemetry}
          settings={settings}
          isHistorical={isViewingHistoricalCall}
          onReturnToLatest={() => {
            const latest = messages.find((m) => m.id === latestTelemetryMessageId);
            if (latest?.telemetry) setActiveTelemetry(latest.telemetry);
          }}
          onToggleCache={() =>
            setSettings((prev) => ({ ...prev, useCache: !prev.useCache }))
          }
          onRequestQuotaIncrease={() => setShowQuotaModal(true)}
        />
      </div>

      {/* Inbuilt Quota Increase Request Modal (Person / Team) */}
      {showQuotaModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-mono text-[10px] font-bold uppercase">
                  SGX Self-Service Governance
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  Request Token Quota Increase (Person / Team)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Submit an inbuilt quota elevation request directly through the AI Gateway.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQuotaModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1 font-mono text-[11px]">
                <div>Requester: <strong className="text-slate-900">{effectiveEmail}</strong></div>
                <div>Target Model: <strong className="text-purple-700">{settings.model}</strong></div>
                <div>Current Enforced Limit: <strong className="text-rose-600">50 tokens / min (Demo Strict Cap)</strong></div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Quota Scope (Person vs Team)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setQuotaScope('Person')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      quotaScope === 'Person'
                        ? 'bg-blue-50 border-blue-400 text-blue-700'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    👤 By Person ({ssoUser.name.split(' ')[0]})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuotaScope('Team')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      quotaScope === 'Team'
                        ? 'bg-blue-50 border-blue-400 text-blue-700'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    👥 By Team (SGX Quantitative Engineering)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Requested New Limit (Tokens / Minute)
                </label>
                <select
                  value={quotaNewTokens}
                  onChange={(e) => setQuotaNewTokens(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-900"
                >
                  <option value={5000}>5,000 tokens / min (Standard Developer)</option>
                  <option value={10000}>10,000 tokens / min (Power Claude Code CLI User)</option>
                  <option value={50000}>50,000 tokens / min (Team Unattended Agent Pool)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Business Justification
                </label>
                <textarea
                  rows={2}
                  value={quotaReason}
                  onChange={(e) => setQuotaReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowQuotaModal(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={quotaSubmitting}
                onClick={handleSubmitQuotaIncrease}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition cursor-pointer shadow-xs"
              >
                {quotaSubmitting ? 'Approving & Syncing KVM...' : '⚡ Submit & Auto-Approve (Demo)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
