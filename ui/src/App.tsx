import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ChatPlayground } from './components/ChatPlayground';
import { McpPlayground } from './components/McpPlayground';
import { GatewaySettingsModal } from './components/GatewaySettingsModal';
import { GatewaySettings, ChatMessage, GatewayTelemetry, UserPersona, AppTab } from './types';
import { DEFAULT_SETTINGS, USERS, DEFAULT_SSO_USER, createSsoUserFromEmail } from './services/defaultSettings';

export function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Initialize settings with localStorage persistence and sanitization
  const [settings, setSettings] = useState<GatewaySettings>(() => {
    try {
      const saved = localStorage.getItem('apigee_ai_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Normalize outdated 'bap' environment to 'dev'
        if (parsed.environment === 'bap' || !['dev', 'prod', 'custom'].includes(parsed.environment)) {
          parsed.environment = 'dev';
        }
        const validUsers: UserPersona[] = ['bronze_user', 'silver_user', 'sales_agent'];
        if (!validUsers.includes(parsed.activeUser)) {
          parsed.activeUser = 'bronze_user';
        }
        const userInfo = USERS[parsed.activeUser as UserPersona] || USERS.bronze_user;
        parsed.apiKey = userInfo.apiKey;

        // Sanitize any invalid or empty session from localStorage
        if (!parsed.ssoUser?.isAuthenticated || !parsed.userEmail) {
          delete parsed.ssoUser;
          delete parsed.userEmail;
        }
        parsed.ssoUser = parsed.ssoUser || DEFAULT_SSO_USER;
        parsed.userEmail = parsed.ssoUser?.email || DEFAULT_SSO_USER.email;

        const validModels = ['gemini-3.1-flash-lite', 'gemini-3-flash', 'gemini-3.1-pro-preview', 'auto'];
        if (!validModels.includes(parsed.model)) {
          parsed.model = 'gemini-3.1-flash-lite';
        }
        parsed.omitEmailHeader = false;
        return { ...DEFAULT_SETTINGS, ...parsed, omitEmailHeader: false };
      }
    } catch (e) {
      console.error('Failed to load settings from localStorage', e);
    }
    return DEFAULT_SETTINGS;
  });

  // Synchronize authenticated user identity from Google IAP / backend (/api/me)
  useEffect(() => {
    async function syncAuthenticatedUser() {
      try {
        const res = await fetch('/api/me');
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await res.json();
            let email = (data.email || '').trim();
            if (email.startsWith('accounts.google.com:')) {
              email = email.replace(/^accounts\.google\.com:/, '').trim();
            }
            if (email) {
              const authUser = createSsoUserFromEmail(email, 'Google Cloud Identity SSO (IAP)');
              setSettings((prev) => ({
                ...prev,
                userEmail: email,
                ssoUser: authUser,
              }));
            }
          }
        }
      } catch (err) {
        console.debug('No active IAP session detected on /api/me, using runtime defaults.');
      }
    }

    syncAuthenticatedUser();
  }, []);

  // Save settings changes to localStorage (excluding temporary simulation flags)
  useEffect(() => {
    try {
      const toSave = { ...settings, omitEmailHeader: false };
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

  const [activeTab, setActiveTab] = useState<AppTab>('ai-gateway');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTelemetry, setActiveTelemetry] = useState<GatewayTelemetry | null>(null);

  const handleResetChat = () => {
    setMessages([]);
    setActiveTelemetry(null);
  };

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
          />
        ) : (
          <McpPlayground
            settings={settings}
          />
        )}
      </main>

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
