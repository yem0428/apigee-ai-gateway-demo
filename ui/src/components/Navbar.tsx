import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  RotateCcw,
  Settings2,
  Sparkles,
  User,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Check,
  Building2,
  Mail,
  Shield,
  X,
} from 'lucide-react';
import { GatewaySettings, GatewayEnvironment, UserPersona } from '../types';
import { USERS, AVAILABLE_MODELS, DEFAULT_SSO_USER } from '../services/defaultSettings';

interface NavbarProps {
  settings: GatewaySettings;
  setSettings: React.Dispatch<React.SetStateAction<GatewaySettings>>;
  onOpenSettings: () => void;
  onResetChat: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  settings,
  setSettings,
  onOpenSettings,
  onResetChat,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [ssoPopoverOpen, setSsoPopoverOpen] = useState(false);
  const ssoPopoverRef = useRef<HTMLDivElement>(null);

  const ssoUser = settings.ssoUser || DEFAULT_SSO_USER;
  const activeUser = USERS[settings.activeUser] || USERS.bronze_user;

  // Close SSO popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ssoPopoverRef.current && !ssoPopoverRef.current.contains(e.target as Node)) {
        setSsoPopoverOpen(false);
      }
    };
    if (ssoPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [ssoPopoverOpen]);

  const handleEnvChange = (env: GatewayEnvironment) => {
    setSettings((prev) => ({ ...prev, environment: env }));
  };

  const handleUserChange = (userPersona: UserPersona) => {
    const user = USERS[userPersona];
    setSettings((prev) => ({
      ...prev,
      activeUser: userPersona,
      apiKey: user.apiKey,
    }));
  };

  const handleModelChange = (modelId: string) => {
    setSettings((prev) => ({ ...prev, model: modelId }));
  };

  const handleEmailUpdate = (newEmail: string) => {
    const cleanEmail = newEmail.trim() || DEFAULT_SSO_USER.email;
    setSettings((prev) => ({
      ...prev,
      userEmail: cleanEmail,
      ssoUser: {
        ...(prev.ssoUser || DEFAULT_SSO_USER),
        email: cleanEmail,
      },
    }));
  };

  const isDev = settings.environment === 'dev' || (settings.environment as string) === 'bap';
  const isProd = settings.environment === 'prod';

  return (
    <header className="bg-slate-950/95 border-b border-slate-800 sticky top-0 z-40 backdrop-blur">
      {/* Primary Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center justify-between gap-2">
        {/* Left: Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-md shadow-blue-500/25">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm text-white tracking-tight">Apigee AI Gateway</span>
            <span className="text-[10px] bg-blue-500/15 text-blue-400 font-mono font-medium px-1.5 py-0.5 rounded border border-blue-500/25 hidden sm:inline-block">
              Studio
            </span>
          </div>
        </div>

        {/* Mobile Quick Config Toggle (< md) */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex md:hidden items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs font-medium cursor-pointer hover:bg-slate-850"
          title="Toggle Gateway Controls"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-mono text-[11px] text-slate-200">
            {settings.environment.toUpperCase()} • {activeUser.badge}
          </span>
          {mobileMenuOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {/* Desktop Controls (md: and above) */}
        <div className="hidden md:flex items-center gap-2 text-xs">
          {/* Environment Segmented Control */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => handleEnvChange('dev')}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                isDev
                  ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Dev
            </button>
            <button
              type="button"
              onClick={() => handleEnvChange('prod')}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                isProd
                  ? 'bg-purple-600 text-white shadow-sm ring-1 ring-purple-400/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Prod
            </button>
          </div>

          {/* User Persona / Entitlement Tier Segmented Control */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => handleUserChange('bronze_user')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                settings.activeUser === 'bronze_user'
                  ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-400/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Bronze Quota Tier (Standard Developer Key)"
            >
              <User className="w-3 h-3" />
              <span>Bronze User</span>
            </button>
            <button
              type="button"
              onClick={() => handleUserChange('silver_user')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                settings.activeUser === 'silver_user'
                  ? 'bg-cyan-600 text-white shadow-sm ring-1 ring-cyan-400/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Silver Quota Tier (Demonstrates 401 Product Boundary)"
            >
              <User className="w-3 h-3" />
              <span>Silver User</span>
            </button>
            <button
              type="button"
              onClick={() => handleUserChange('sales_agent')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                settings.activeUser === 'sales_agent'
                  ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Sales Agent Quota Tier"
            >
              <User className="w-3 h-3" />
              <span>Sales Agent</span>
            </button>
          </div>

          {/* Model Selector Pill / Dropdown */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            <div className="flex items-center gap-1 pl-2 pr-1 text-slate-400 text-[11px]">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>Model:</span>
            </div>
            <select
              value={settings.model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="bg-slate-800 text-slate-100 text-[11px] font-medium rounded-md px-2 py-1 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Actions & Top-Right SSO Profile */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* New Chat / Reset */}
          <button
            type="button"
            onClick={onResetChat}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition text-xs cursor-pointer"
            title="Clear Chat & Reset Session"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          {/* Settings Modal */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-blue-400 transition cursor-pointer"
            title="Gateway Configuration"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          {/* TOP-RIGHT LOGGED IN SSO USER CHIP */}
          <div className="relative" ref={ssoPopoverRef}>
            <button
              type="button"
              onClick={() => setSsoPopoverOpen(!ssoPopoverOpen)}
              className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 transition cursor-pointer text-left group"
              title={`Logged in as ${ssoUser.name} (${ssoUser.email}) via SSO`}
            >
              {/* Avatar Circle with Status Indicator */}
              <div className="relative">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-bold text-xs shadow-sm ring-1 ring-emerald-400/50">
                  {ssoUser.avatarText || 'SM'}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-slate-950 rounded-full animate-pulse" />
              </div>

              {/* User Identity Info (Hidden on mobile, visible on lg+) */}
              <div className="hidden lg:flex flex-col leading-tight pr-1">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold text-slate-200 group-hover:text-white truncate max-w-[110px]">
                    {ssoUser.name}
                  </span>
                  <span className="text-[9px] bg-emerald-950 text-emerald-300 font-mono font-bold px-1 rounded border border-emerald-500/30">
                    SSO
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono truncate max-w-[130px]">
                  {ssoUser.email}
                </span>
              </div>

              <ChevronDown className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition hidden sm:block" />
            </button>

            {/* SSO Profile Popover */}
            {ssoPopoverOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 text-xs z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-start justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-bold text-sm ring-2 ring-emerald-400/50">
                      {ssoUser.avatarText || 'SM'}
                    </div>
                    <div>
                      <div className="font-bold text-slate-100 text-sm">{ssoUser.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{ssoUser.email}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSsoPopoverOpen(false)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="py-3 space-y-2 border-b border-slate-800 text-[11px]">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-blue-400" />
                      SSO Provider:
                    </span>
                    <span className="text-slate-200 font-medium">{ssoUser.provider}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-purple-400" />
                      Domain:
                    </span>
                    <span className="text-slate-200 font-mono">{ssoUser.organization}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Session Status:</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Active / Authenticated
                    </span>
                  </div>
                </div>

                <div className="pt-3">
                  <div className="text-[10px] text-slate-400 mb-1.5">
                    Attribution Header (<code className="font-mono text-emerald-400">X-User-Email</code>):
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="email"
                      defaultValue={ssoUser.email}
                      onBlur={(e) => handleEmailUpdate(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleEmailUpdate((e.target as HTMLInputElement).value);
                          setSsoPopoverOpen(false);
                        }
                      }}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      placeholder="user@domain.com"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        handleEmailUpdate('maloosatyam@google.com');
                        setSsoPopoverOpen(false);
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] transition cursor-pointer"
                      title="Reset to default SSO user"
                    >
                      Default
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                    This email is dynamically passed in the <code className="font-mono text-slate-400">X-User-Email</code> header to Apigee on every request for custom label attribution.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Collapsible Mobile Controls Drawer (< md) */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800/80 bg-slate-900/95 px-4 py-3 space-y-3 animate-in slide-in-from-top-2 duration-150">
          {/* Target Environment */}
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Gateway Environment</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  handleEnvChange('dev');
                  setMobileMenuOpen(false);
                }}
                className={`py-1.5 rounded-lg text-xs font-semibold transition ${
                  isDev ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-800 text-slate-300'
                }`}
              >
                Dev Gateway
              </button>
              <button
                type="button"
                onClick={() => {
                  handleEnvChange('prod');
                  setMobileMenuOpen(false);
                }}
                className={`py-1.5 rounded-lg text-xs font-semibold transition ${
                  isProd ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-800 text-slate-300'
                }`}
              >
                Prod Gateway
              </button>
            </div>
          </div>

          {/* Entitlement Tiers */}
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Entitlement Tier (API Key)</div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  handleUserChange('bronze_user');
                  setMobileMenuOpen(false);
                }}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition truncate ${
                  settings.activeUser === 'bronze_user'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                Bronze Tier
              </button>
              <button
                type="button"
                onClick={() => {
                  handleUserChange('silver_user');
                  setMobileMenuOpen(false);
                }}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition truncate ${
                  settings.activeUser === 'silver_user'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                Silver Tier
              </button>
              <button
                type="button"
                onClick={() => {
                  handleUserChange('sales_agent');
                  setMobileMenuOpen(false);
                }}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition truncate ${
                  settings.activeUser === 'sales_agent'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                Sales Agent
              </button>
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Vertex AI Model</div>
            <select
              value={settings.model}
              onChange={(e) => {
                handleModelChange(e.target.value);
                setMobileMenuOpen(false);
              }}
              className="w-full bg-slate-800 text-slate-100 text-xs font-medium rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.tag})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </header>
  );
};
