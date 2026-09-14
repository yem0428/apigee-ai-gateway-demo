import { useState, useEffect, useRef } from 'react';
import { Settings2 } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { ChatPlayground } from './components/ChatPlayground';
import { McpPlayground } from './components/McpPlayground';
import { MonetizationManager } from './components/MonetizationManager';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { GatewaySettingsModal } from './components/GatewaySettingsModal';
import { ThemeSelector } from './components/ThemeSelector';
import { GatewaySettings, ChatMessage, GatewayTelemetry, UserPersona, AppTab, AppTheme } from './types';
import { DEFAULT_SETTINGS, USERS, createSsoUserFromEmail } from './services/defaultSettings';

export function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('settings') === 'open';
    }
    return false;
  });
  const [theme, setTheme] = useState<AppTheme>(() => {
    if (typeof window !== 'undefined') {
      const urlParam = new URLSearchParams(window.location.search).get('theme') as AppTheme;
      if (urlParam && ['midnight', 'sunset', 'cyber', 'light'].includes(urlParam)) {
        return urlParam;
      }
    }
    return (localStorage.getItem('apigee_ui_theme') as AppTheme) || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
    localStorage.setItem('apigee_ui_theme', theme);
  }, [theme]);

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
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await res.json();
            let email = (data.email || '').trim();
            const idToken = (data.token || '').trim();
            const apiKey = (data.apiKey || '').trim();

            if (email.startsWith('accounts.google.com:')) {
              email = email.replace(/^accounts\.google\.com:/, '').trim();
            }
            if (email) {
              const provider = data.provider || (idToken ? 'Google Cloud Identity SSO (gcloud)' : 'Google Cloud Identity SSO (IAP)');
              const authUser = createSsoUserFromEmail(email, provider, idToken);

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
                apiKey: apiKeys[prev.activeUser] || apiKeys.admin || apiKey || prev.apiKey,
              }));
            }
          }
        }
      } catch (err) {
        console.debug('No active session detected on /api/me, using runtime defaults.');
      }
    }

    syncAuthenticatedUser();
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
          text: 'What are 3 benefits of an API gateway? Give a brief summary.',
          timestamp: '21:50',
        },
        {
          id: 'sample-agent-1',
          sender: 'agent',
          text: '1. Centralized Governance & Security (OAuth2, rate limiting, and Model Armor guardrails)\n2. Performance Acceleration (Semantic Vector Caching)\n3. Enterprise Cost Control & Auto-Routing (Token quotas and wallet metering)',
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
          },
        },
      ];
    }
    return [];
  });

  const [activeTelemetry, setActiveTelemetry] = useState<GatewayTelemetry | null>(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sample') === 'true') {
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

  // Analytics Dashboard Controls State (hoisted to Navbar)
  const [analyticsViewMode, setAnalyticsViewMode] = useState<'admin' | 'user'>(() => {
    if (typeof window !== 'undefined') {
      const v = new URLSearchParams(window.location.search).get('view');
      if (v === 'admin' || v === 'user') return v;
    }
    return 'admin';
  });
  const [analyticsTimeRange, setAnalyticsTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
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
        onResetChat={handleResetChat}
        theme={theme}
        onThemeChange={setTheme}
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
          />
        ) : activeTab === 'mcp-gateway' ? (
          <McpPlayground settings={settings} />
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

      {/* Floating Bottom-Right Corner Controls: Themes & Gateway Settings */}
      <div className="fixed bottom-3 right-4 z-40 flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl">
        <ThemeSelector theme={theme} onThemeChange={setTheme} direction="up" />
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer shadow-xs"
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
    </div>
  );
}

export default App;
