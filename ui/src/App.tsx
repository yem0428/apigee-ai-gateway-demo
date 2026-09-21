import { useState, useEffect, useRef } from 'react';
import { Settings2 } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { ChatPlayground } from './components/ChatPlayground';
import { McpPlayground } from './components/McpPlayground';
import { MonetizationManager } from './components/MonetizationManager';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { GatewaySettingsModal } from './components/GatewaySettingsModal';
import { ArchitectureBlueprintModal } from './components/ArchitectureBlueprintModal';
import { DeveloperOnboardingModal, DeveloperOnboardingResult } from './components/DeveloperOnboardingModal';
import { GatewaySettings, ChatMessage, GatewayTelemetry, McpTelemetry, UserPersona, AppTab, AppTheme, AVAILABLE_THEMES } from './types';
import { DEFAULT_SETTINGS, USERS, createSsoUserFromEmail } from './services/defaultSettings';
import { isSessionExpiredResponse, recoverExpiredSession, markSessionHealthy } from './services/session';

export function App() {
  const [onboardingModal, setOnboardingModal] = useState<{
    isOpen: boolean;
    email: string;
    suggestedFirstName: string;
    suggestedLastName: string;
    isEditMode?: boolean;
  } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('settings') === 'open';
    }
    return false;
  });
  const [isArchitectureOpen, setIsArchitectureOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('arch') === 'open';
    }
    return false;
  });
  const [archInitialTab, setArchInitialTab] = useState<'ai-gateway' | 'mcp-gateway' | 'dual-pattern'>(() => {
    if (typeof window !== 'undefined') {
      const flow = new URLSearchParams(window.location.search).get('flow');
      if (flow === 'mcp-gateway' || flow === 'dual-pattern') return flow;
    }
    return 'ai-gateway';
  });
  const [archInitialMode, setArchInitialMode] = useState<'request-flow' | 'full-blueprint'>(() => {
    if (typeof window !== 'undefined') {
      const mode = new URLSearchParams(window.location.search).get('mode');
      if (mode === 'request-flow' || mode === 'full-blueprint') return mode;
    }
    return 'full-blueprint';
  });
  // Theme is resolved once from the URL and never changes at runtime, so it is
  // deliberately not state. `light` is the only stylesheet that exists today;
  // customer-branded themes are added to AVAILABLE_THEMES plus a matching
  // `html[data-theme="…"]` block in index.css, then demoed via `?theme=<name>`.
  //
  // The `dark` class is never applied. Tailwind's `dark:` variants have been
  // stripped from the components; the light theme is an override layer over
  // dark-toned base classes, so toggling `dark` would not produce a dark UI.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('theme');
    const theme: AppTheme = (AVAILABLE_THEMES as readonly string[]).includes(requested ?? '')
      ? (requested as AppTheme)
      : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.remove('dark');
  }, []);

  // Initialize settings with localStorage persistence and sanitization
  const [settings, setSettings] = useState<GatewaySettings>(() => {
    const base: GatewaySettings = {
      ...DEFAULT_SETTINGS,
      activeUser: 'admin',
      keyTier: 'admin',
      apiKey: USERS.admin.apiKey,
      model: 'auto',
      environment: 'prod',
      omitEmailHeader: false,
    };

    try {
      const saved = localStorage.getItem('apigee_ai_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        parsed.environment = 'prod';
        
        // On reload, respect explicit URL query parameters if present, otherwise default to Admin persona & Auto model
        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const queryUser = urlParams?.get('user') as UserPersona;
        const activeUser: UserPersona = (queryUser && ['admin', 'sales_agent', 'loans_agent'].includes(queryUser))
          ? queryUser
          : 'admin';

        const userInfo = USERS[activeUser] || USERS.admin;

        // Sanitize any invalid or stale session/key from localStorage
        delete parsed.apiKey;
        if (!parsed.ssoUser?.isAuthenticated || !parsed.userEmail) {
          delete parsed.ssoUser;
          delete parsed.userEmail;
        } else if (parsed.ssoUser && parsed.userEmail) {
          // Ensure any stale single-word handle name in localStorage is refreshed
          const refreshedSso = createSsoUserFromEmail(
            parsed.userEmail,
            parsed.ssoUser.provider,
            parsed.ssoUser.idToken,
            parsed.ssoUser.name
          );
          parsed.ssoUser = refreshedSso;
        }

        return {
          ...base,
          ...parsed,
          activeUser,
          keyTier: activeUser,
          apiKey: userInfo.apiKey || base.apiKey,
          model: parsed.model || 'auto',
          environment: 'prod',
          omitEmailHeader: false,
        };
      }
    } catch (e) {
      console.error('Failed to load settings from localStorage', e);
    }
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const queryUser = urlParams?.get('user') as UserPersona;
    if (queryUser && ['admin', 'sales_agent', 'loans_agent'].includes(queryUser)) {
      return {
        ...base,
        activeUser: queryUser,
        keyTier: queryUser,
        apiKey: USERS[queryUser]?.apiKey || base.apiKey,
      };
    }
    return base;
  });

  // Synchronize authenticated user identity & provisioned credentials from backend (/api/me)
  useEffect(() => {
    async function syncAuthenticatedUser() {
      try {
        const res = await fetch('/api/me');

        // An expired IAP session does not arrive as an error -- it arrives as a
        // 200 HTML sign-in page. Detect that explicitly and reload, otherwise
        // the app renders signed-in-looking but with no key and every call
        // fails silently.
        if (isSessionExpiredResponse(res)) {
          if (recoverExpiredSession(`GET /api/me -> ${res.status} ${res.headers.get('content-type') || 'no content-type'}`)) {
            return;
          }
          return;
        }

        markSessionHealthy();

        const data = await res.json();
        let email = (data.email || '').trim();
        const idToken = (data.token || '').trim();
        const apiKey = (data.apiKey || '').trim();
        const fullName = (data.name || '').trim();

        if (email.startsWith('accounts.google.com:')) {
          email = email.replace(/^accounts\.google\.com:/, '').trim();
        }
        if (email) {
          const provider = data.provider || (idToken ? 'Google Cloud Identity SSO (gcloud)' : 'Google Cloud Identity SSO (IAP)');
          const authUser = createSsoUserFromEmail(email, provider, idToken, fullName);

          if (data.needsOnboarding) {
            setOnboardingModal({
              isOpen: true,
              email,
              suggestedFirstName: data.suggestedFirstName || '',
              suggestedLastName: data.suggestedLastName || '',
              isEditMode: false,
            });
            setSettings((prev) => ({
              ...prev,
              userEmail: email,
              ssoUser: authUser,
              idToken: idToken || undefined,
            }));
            return;
          }

          const apiKeys = data.apiKeys || {};

          if (apiKeys.admin || apiKey) {
            USERS.admin.apiKey = apiKeys.admin || apiKey;
          }
          if (apiKeys.sales_agent) {
            USERS.sales_agent.apiKey = apiKeys.sales_agent;
          }
          if (apiKeys.loans_agent) {
            USERS.loans_agent.apiKey = apiKeys.loans_agent;
          }

          setSettings((prev) => ({
            ...prev,
            userEmail: email,
            ssoUser: authUser,
            idToken: idToken || undefined,
            // Resolve within the active persona only. Falling back to
            // apiKeys.admin here would store Enterprise credentials on
            // state for a non-admin persona.
            apiKey: apiKeys[prev.activeUser] || USERS[prev.activeUser]?.apiKey || '',
          }));
        }
      } catch (err) {
        // A cross-origin block on the IdP redirect also lands here.
        console.debug('No active session detected on /api/me, using runtime defaults.', err);
      }
    }

    syncAuthenticatedUser();

    // The IAP session outlives most sittings but not an overnight one. Re-check
    // whenever the tab is brought back to the foreground -- that is exactly the
    // moment a demo machine resumes from sleep with a dead cookie. Throttled so
    // ordinary tab switching does not hammer /api/me, which does provisioning
    // work server-side.
    let lastCheck = Date.now();
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheck < 60_000) return;
      lastCheck = Date.now();
      try {
        const res = await fetch('/api/me');
        if (isSessionExpiredResponse(res)) {
          recoverExpiredSession('tab refocus');
        } else {
          markSessionHealthy();
        }
      } catch {
        recoverExpiredSession('tab refocus (network/CORS block)');
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Save settings changes to localStorage (excluding temporary simulation flags and dynamic API keys)
  useEffect(() => {
    try {
      const toSave = { ...settings, environment: 'prod', omitEmailHeader: false };
      delete (toSave as any).apiKey;
      localStorage.setItem('apigee_ai_settings', JSON.stringify(toSave));
    } catch (e) {
      console.error('Failed to save settings to localStorage', e);
    }
  }, [settings]);

  // Ensure persistent state never holds omitEmailHeader as true
  useEffect(() => {
    if (settings.omitEmailHeader) {
      setSettings((prev) => ({ ...prev, omitEmailHeader: false }));
    }
  }, [settings.omitEmailHeader]);

  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('tab') as AppTab;
      if (p && ['ai-gateway', 'mcp-gateway', 'monetization', 'kvm-pricing', 'analytics'].includes(p)) {
        return p;
      }
    }
    return 'ai-gateway';
  });
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sample') === 'true') {
      return [
        {
          id: 'sample-user-1',
          sender: 'user',
          text: 'What does the acronym API stand for?',
          timestamp: '21:50',
        },
        {
          id: 'sample-agent-1',
          sender: 'agent',
          text: 'API stands for Application Programming Interface — a defined contract that lets one piece of software request services or data from another.',
          timestamp: '21:50',
          model: 'gemini-3.1-flash-lite',
          targetUrl: 'https://api.maloosatyam.demo.altostrat.com/ai/v1/models/gemini-3.1-flash-lite:generateContent',
          telemetry: {
            status: 200,
            statusText: 'OK',
            latencyMs: 184,
            endpointUrl: 'https://api.maloosatyam.demo.altostrat.com/ai/v1/models/gemini-3.1-flash-lite:generateContent',
            environment: 'prod',
            model: 'gemini-3.1-flash-lite',
            provider: 'Google',
            costTier: 'low',
            costUsd: '0.000596',
            promptTokens: 9,
            candidatesTokens: 28,
            totalTokens: 37,
            autoRouted: true,
            intent: 'Simple / Fast',
            cacheStatus: 'HIT',
            guardrailStatus: 'PASSED',
            headersSent: {},
            headersReceived: {
              'x-gateway-model': 'gemini-3.1-flash-lite',
              'x-gateway-prepaid-balance': '109.988770',
              'x-gateway-balance-remaining': '109.988174',
            },
            rawRequest: {},
            rawResponse: { candidates: [{ content: { parts: [{ text: '1. Centralized Governance...' }] } }] },
          },
        },
      ];
    }
    return [];
  });

  const [activeTelemetry, setActiveTelemetry] = useState<GatewayTelemetry | null>((): GatewayTelemetry | null => {
    const sampleParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('sample') : null;
    if (sampleParam === 'armor') {
      return {
        status: 400,
        statusText: 'Bad Request',
        latencyMs: 92,
        endpointUrl: 'https://api.maloosatyam.demo.altostrat.com/ai/v1/auto',
        environment: 'prod',
        model: 'auto',
        provider: 'Google',
        costTier: 'low',
        costUsd: '0.000000',
        promptTokens: 0,
        candidatesTokens: 0,
        totalTokens: 0,
        autoRouted: false,
        intent: 'Blocked at Perimeter',
        cacheStatus: 'DISABLED',
        guardrailStatus: 'BLOCKED',
        guardrailMessage: 'Model Armor Policy Violation (SUP-UserPrompt): Destructive system command & prompt injection attempt blocked at perimeter.',
        headersSent: {},
        headersReceived: {},
        rawRequest: {},
        rawResponse: { error: { code: 400, message: 'Blocked by Model Armor' } },
      };
    }
    if (sampleParam === 'true') {
      return {
        status: 200,
        statusText: 'OK',
        latencyMs: 184,
        endpointUrl: 'https://api.maloosatyam.demo.altostrat.com/ai/v1/models/gemini-3.1-flash-lite:generateContent',
        environment: 'prod',
        model: 'gemini-3.1-flash-lite',
        provider: 'Google',
        costTier: 'low',
        costUsd: '0.000596',
        promptTokens: 14,
        candidatesTokens: 42,
        totalTokens: 56,
        autoRouted: true,
        intent: 'General / Fast',
        cacheStatus: 'HIT',
        guardrailStatus: 'PASSED',
        headersSent: {},
        headersReceived: {
          'x-gateway-model': 'gemini-3.1-flash-lite',
          'x-gateway-prepaid-balance': '109.988770',
          'x-gateway-balance-remaining': '109.988174',
        },
        rawRequest: {},
        rawResponse: { candidates: [{ content: { parts: [{ text: '1. Centralized Governance...' }] } }] },
      };
    }
    return null;
  });
  const [activeMcpTelemetry, setActiveMcpTelemetry] = useState<McpTelemetry | null>(null);

  // Analytics Dashboard Controls State (hoisted to Navbar)
  const [analyticsViewMode, setAnalyticsViewMode] = useState<'admin' | 'user'>(() => {
    if (typeof window !== 'undefined') {
      const v = new URLSearchParams(window.location.search).get('view');
      if (v === 'admin' || v === 'user') return v;
    }
    return 'user';
  });
  const [analyticsTimeRange, setAnalyticsTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsUserFilter, setAnalyticsUserFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const u = new URLSearchParams(window.location.search).get('userFilter');
      if (u) return u;
    }
    return 'all';
  });
  const [analyticsUserList, setAnalyticsUserList] = useState<{ email: string; name?: string }[]>([]);
  const analyticsRefreshRef = useRef<() => void>(() => {});

  const handleResetChat = () => {
    setMessages([]);
    setActiveTelemetry(null);
    setActiveTab('ai-gateway');
    setSettings((prev) => ({
      ...prev,
      activeUser: 'admin',
      keyTier: 'admin',
      apiKey: USERS.admin.apiKey || prev.apiKey,
      model: 'auto',
      omitEmailHeader: false,
    }));
  };

  // Monetization tab is strictly accessible only in Admin view
  useEffect(() => {
    const isAdmin = activeTab === 'analytics'
      ? analyticsViewMode === 'admin'
      : settings.activeUser === 'admin';
    if (!isAdmin && (activeTab === 'monetization' || activeTab === 'kvm-pricing' || activeTab === 'rate-cards')) {
      setActiveTab('ai-gateway');
    }
  }, [activeTab, analyticsViewMode, settings.activeUser]);

  return (
    <div className="h-screen bg-slate-950 flex flex-col text-slate-100 font-sans selection:bg-blue-600 selection:text-white overflow-hidden">
      {/* Sleek Top Navbar */}
      <Navbar
        settings={settings}
        setSettings={setSettings}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenArchitecture={() => {
          setArchInitialTab(activeTab === 'mcp-gateway' ? 'mcp-gateway' : 'ai-gateway');
          setArchInitialMode('full-blueprint');
          setIsArchitectureOpen(true);
        }}
        onResetChat={handleResetChat}
        onEditProfileName={(email, currentFullName) => {
          const parts = (currentFullName || '').split(/\s+/).filter(Boolean);
          const firstName = parts[0] || '';
          const lastName = parts.slice(1).join(' ');
          setOnboardingModal({
            isOpen: true,
            email,
            suggestedFirstName: firstName,
            suggestedLastName: lastName,
            isEditMode: true,
          });
        }}
        analyticsControls={{
          viewMode: analyticsViewMode,
          setViewMode: (mode) => {
            setAnalyticsViewMode(mode);
            if (mode === 'user') {
              setAnalyticsUserFilter('all');
            }
          },
          timeRange: analyticsTimeRange,
          setTimeRange: setAnalyticsTimeRange,
          loading: analyticsLoading,
          onRefresh: () => {
            if (analyticsRefreshRef.current) {
              analyticsRefreshRef.current();
            }
          },
          userFilter: analyticsUserFilter,
          setUserFilter: setAnalyticsUserFilter,
          userList: analyticsUserList,
        }}
      />

      {/* Main Dual-Pane Studio Body */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'ai-gateway' ? (
          <ChatPlayground
            settings={settings}
            setSettings={setSettings}
            messages={messages}
            setMessages={setMessages}
            activeTelemetry={activeTelemetry}
            setActiveTelemetry={setActiveTelemetry}
            onResetChat={handleResetChat}
            onOpenRequestFlow={(telemetry) => {
              setActiveTelemetry(telemetry);
              setArchInitialTab('ai-gateway');
              setArchInitialMode('request-flow');
              setIsArchitectureOpen(true);
            }}
          />
        ) : activeTab === 'mcp-gateway' ? (
          <McpPlayground
            settings={settings}
            onTelemetryChange={setActiveMcpTelemetry}
            onOpenRequestFlow={(telemetry) => {
              setActiveMcpTelemetry(telemetry);
              setArchInitialTab('mcp-gateway');
              setArchInitialMode('request-flow');
              setIsArchitectureOpen(true);
            }}
          />
        ) : activeTab === 'monetization' || activeTab === 'kvm-pricing' || activeTab === 'rate-cards' ? (
          <MonetizationManager currentEnv="prod" settings={settings} />
        ) : (
          <AnalyticsDashboard
            settings={settings}
            viewMode={analyticsViewMode}
            timeRange={analyticsTimeRange}
            setLoading={setAnalyticsLoading}
            registerRefresh={(fn) => {
              analyticsRefreshRef.current = fn;
            }}
            userFilter={analyticsUserFilter}
            onUserFilterChange={setAnalyticsUserFilter}
            onUserListChange={setAnalyticsUserList}
          />
        )}
      </main>

      {/* Floating Bottom-Right Corner Control: Gateway Settings */}
      <div className="fixed bottom-3 right-4 z-40 flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-slate-200 shadow-xl">
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200/80 text-slate-600 hover:text-blue-600 transition cursor-pointer shadow-xs"
          title="Gateway Configuration Settings"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </div>

      {/* Gateway Configuration Drawer / Modal */}
      <GatewaySettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={(newSettings) => setSettings(newSettings)}
      />

      {/* Interactive Architecture Blueprint Modal */}
      <ArchitectureBlueprintModal
        isOpen={isArchitectureOpen}
        onClose={() => setIsArchitectureOpen(false)}
        initialTab={archInitialTab}
        initialMode={archInitialMode}
        aiTelemetry={activeTelemetry}
        mcpTelemetry={activeMcpTelemetry}
      />

      {/* First-Time Developer Onboarding / Name Validation Modal */}
      {onboardingModal && (
        <DeveloperOnboardingModal
          isOpen={onboardingModal.isOpen}
          email={onboardingModal.email}
          suggestedFirstName={onboardingModal.suggestedFirstName}
          suggestedLastName={onboardingModal.suggestedLastName}
          isEditMode={onboardingModal.isEditMode}
          onCancel={() => setOnboardingModal(null)}
          onComplete={(result: DeveloperOnboardingResult) => {
            const apiKeys = result.apiKeys || {};
            if (apiKeys.admin || result.apiKey) {
              USERS.admin.apiKey = apiKeys.admin || result.apiKey;
            }
            if (apiKeys.sales_agent) {
              USERS.sales_agent.apiKey = apiKeys.sales_agent;
            }
            if (apiKeys.loans_agent) {
              USERS.loans_agent.apiKey = apiKeys.loans_agent;
            }
            const updatedSso = createSsoUserFromEmail(
              result.email,
              settings.ssoUser?.provider || 'Google Cloud Identity SSO (IAP)',
              settings.idToken,
              result.name
            );
            setSettings((prev) => ({
              ...prev,
              userEmail: result.email,
              ssoUser: updatedSso,
              apiKey: apiKeys[prev.activeUser] || USERS[prev.activeUser]?.apiKey || prev.apiKey,
            }));
            setOnboardingModal(null);
            if (analyticsRefreshRef.current) {
              analyticsRefreshRef.current();
            }
          }}
        />
      )}
    </div>
  );
}

export default App;
