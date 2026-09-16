import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Check,
  Building2,
  Mail,
  Shield,
  ShieldCheck,
  X,
  Terminal,
  Coins,
  BarChart3,
  Key,
  Users,
  User,
  RotateCcw,
  Loader2,
  Layers,
} from 'lucide-react';
import { GatewaySettings, UserPersona, AppTab, AppTheme } from '../types';
import { USERS, AVAILABLE_MODELS, DEFAULT_SSO_USER, createSsoUserFromEmail } from '../services/defaultSettings';
import { ApigeeLogo } from './ApigeeLogo';

export interface AnalyticsNavControls {
  viewMode: 'admin' | 'user';
  setViewMode: (mode: 'admin' | 'user') => void;
  timeRange: '24h' | '7d' | '30d';
  setTimeRange: (range: '24h' | '7d' | '30d') => void;
  loading: boolean;
  onRefresh: () => void;
  userFilter?: string;
  setUserFilter?: (user: string) => void;
  userList?: { email: string; name?: string }[];
}

interface NavbarProps {
  settings: GatewaySettings;
  setSettings: React.Dispatch<React.SetStateAction<GatewaySettings>>;
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onOpenSettings?: () => void;
  onOpenArchitecture?: () => void;
  onResetChat?: () => void;
  theme?: AppTheme;
  onThemeChange?: (theme: AppTheme) => void;
  analyticsControls?: AnalyticsNavControls;
}

export const Navbar: React.FC<NavbarProps> = ({
  settings,
  setSettings,
  activeTab,
  onTabChange,
  onOpenArchitecture,
  analyticsControls,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [ssoPopoverOpen, setSsoPopoverOpen] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);
  const ssoPopoverRef = useRef<HTMLDivElement>(null);

  const ssoUser = settings.ssoUser || DEFAULT_SSO_USER;
  const activeUser = USERS[settings.activeUser] || USERS.admin;
  const effectiveEmail = ssoUser.email || settings.userEmail || DEFAULT_SSO_USER.email;

  useEffect(() => {
    if (ssoUser.name) {
      setProfileNameInput(ssoUser.name);
    }
  }, [ssoUser.name]);

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

  const handleEmailUpdate = async (newEmail: string, newIdToken?: string, refresh?: boolean) => {
    const cleanEmail = newEmail.trim() || DEFAULT_SSO_USER.email;
    try {
      const url = `/api/me?email=${encodeURIComponent(cleanEmail)}${refresh ? '&refresh=true' : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const resolvedEmail = (data.email || cleanEmail).replace(/^accounts\.google\.com:/, '').trim();
        const resolvedName = (data.name || '').trim();
        const token = data.token || newIdToken || ssoUser.idToken;
        const apiKeys = data.apiKeys || {};

        if (apiKeys.admin || data.apiKey) {
          USERS.admin.apiKey = apiKeys.admin || data.apiKey;
        }
        if (apiKeys.sales_agent) {
          USERS.sales_agent.apiKey = apiKeys.sales_agent;
        }
        if (apiKeys.loans_agent) {
          USERS.loans_agent.apiKey = apiKeys.loans_agent;
        }

        const updatedSso = createSsoUserFromEmail(resolvedEmail, ssoUser.provider, token, resolvedName);
        setSettings((prev) => ({
          ...prev,
          userEmail: resolvedEmail,
          idToken: token,
          ssoUser: updatedSso,
          apiKey: apiKeys[prev.activeUser] || USERS[prev.activeUser]?.apiKey || prev.apiKey,
        }));
        return;
      }
    } catch {
      // Fallback to client-side update if offline
    }

    const fallbackSso = createSsoUserFromEmail(cleanEmail, ssoUser.provider, newIdToken !== undefined ? newIdToken : ssoUser.idToken);
    setSettings((prev) => ({
      ...prev,
      userEmail: cleanEmail,
      idToken: newIdToken !== undefined ? newIdToken : prev.idToken,
      ssoUser: fallbackSso,
    }));
  };

  const handleProfileNameSave = async (customName?: string) => {
    const targetName = (customName ?? profileNameInput).trim();
    if (!targetName || !ssoUser.email) return;
    setIsSavingProfile(true);
    setProfileSaveSuccess(false);
    try {
      const res = await fetch('/api/me/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ssoUser.email, fullName: targetName }),
      });
      if (res.ok) {
        const data = await res.json();
        const savedFullName = data.fullName || targetName;
        const updatedSso = createSsoUserFromEmail(ssoUser.email, ssoUser.provider, ssoUser.idToken, savedFullName);
        setSettings((prev) => ({
          ...prev,
          ssoUser: updatedSso,
        }));
        setProfileSaveSuccess(true);
        setTimeout(() => setProfileSaveSuccess(false), 2500);
      }
    } catch (err) {
      console.error('Failed to update developer profile name:', err);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Monetization tab is strictly visible only in Admin view
  const isAdminView = activeTab === 'analytics'
    ? analyticsControls?.viewMode === 'admin'
    : settings.activeUser === 'admin';

  return (
    <header className="bg-white/95 dark:bg-slate-950/95 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 backdrop-blur w-full">
      {/* Primary Bar - Full viewport width */}
      <div className="w-full px-3 sm:px-6 py-2 flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: Official Apigee Brand & Gateway Tabs */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <ApigeeLogo />

          {/* Primary Gateway Tabs Switcher - Analytics is 3rd Tab */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => onTabChange('ai-gateway')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg font-semibold transition cursor-pointer text-xs ${
                activeTab === 'ai-gateway'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
              }`}
              title="AI Gateway (Model Routing, Guardrails, Cache & Auto-Routing)"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Gateway</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('mcp-gateway')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg font-semibold transition cursor-pointer text-xs ${
                activeTab === 'mcp-gateway'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
              }`}
              title="Native MCP Tools Server (/mcp)"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>MCP Gateway</span>
            </button>
            {/* 3rd Tab: Analytics & Cost */}
            <button
              type="button"
              onClick={() => onTabChange('analytics')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg font-semibold transition cursor-pointer text-xs ${
                activeTab === 'analytics'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
              }`}
              title="Enterprise Model Consumption & Cost Tracking Dashboard"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Analytics & Cost</span>
            </button>
            {/* 4th Tab: Monetization - Strictly visible ONLY in Admin view */}
            {isAdminView && (
              <button
                type="button"
                onClick={() => onTabChange('monetization')}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg font-semibold transition cursor-pointer text-xs ${
                  activeTab === 'monetization' || activeTab === 'kvm-pricing' || activeTab === 'rate-cards'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
                title="Native Monetization: Prepaid Wallets, Published Rate Plans, Subscriptions & KVM Token Rates"
              >
                <Coins className="w-3.5 h-3.5" />
                <span>Monetization</span>
              </button>
            )}
          </div>

          {/* Architecture Blueprint Button */}
          {onOpenArchitecture && (
            <button
              type="button"
              onClick={onOpenArchitecture}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800/80 text-blue-700 dark:text-blue-300 font-semibold text-xs transition cursor-pointer shadow-2xs shrink-0"
              title="Open Interactive AI Gateway & MCP Tools Gateway Architecture Blueprint"
            >
              <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">Architecture</span>
            </button>
          )}
        </div>

        {/* Mobile Quick Config Toggle (< lg) */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex lg:hidden items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-855 shrink-0"
          title="Toggle Gateway Controls"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-blue-500" />
          <span className="font-mono text-[11px] text-slate-700 dark:text-slate-200">
            {activeTab === 'analytics' ? (analyticsControls?.viewMode === 'admin' ? 'Admin View' : 'User View') : activeUser.badge}
          </span>
          {mobileMenuOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {/* Middle Desktop Controls (lg: and above) */}
        <div className="hidden lg:flex items-center gap-2 text-xs">
          {activeTab === 'analytics' && analyticsControls ? (
            <>
              {/* Analytics View Mode Toggle (Admin Fleet vs My User View) */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-300 dark:border-slate-700 shrink-0 shadow-xs">
                <button
                  type="button"
                  onClick={() => analyticsControls.setViewMode('admin')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    analyticsControls.viewMode === 'admin'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                  }`}
                  title="Admin Fleet View (Enterprise overview across all models & users)"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </button>
                <button
                  type="button"
                  onClick={() => analyticsControls.setViewMode('user')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    analyticsControls.viewMode === 'user'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                  }`}
                  title="My User View (Filter consumption records to active authenticated email)"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>User</span>
                </button>
              </div>

              {/* Time Range Selector (24H, 7D, 30D) - Ultra crisp contrast in light & dark */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-300 dark:border-slate-700 shrink-0 shadow-xs">
                {(['24h', '7d', '30d'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => analyticsControls.setTimeRange(r)}
                    className={`px-2.5 py-1 rounded transition cursor-pointer uppercase text-[11px] font-bold ${
                      analyticsControls.timeRange === r
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={analyticsControls.onRefresh}
                disabled={analyticsControls.loading}
                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-purple-600 transition cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
                title="Refresh live metrics from Management API"
              >
                {analyticsControls.loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
              </button>
            </>
          ) : activeTab === 'monetization' || activeTab === 'kvm-pricing' || activeTab === 'rate-cards' ? (
            /* Monetization is strictly Admin View */
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Admin Console
              </span>
            </div>
          ) : (
            <>
              {/* User Persona / Entitlement Tier Segmented Control (Only on AI & MCP Gateway) */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => handleUserChange('admin')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    settings.activeUser === 'admin'
                      ? 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Admin Persona (Enterprise Tier: All Models + All MCP Tools)"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${settings.activeUser === 'admin' ? 'bg-purple-500' : 'bg-slate-400'}`} />
                  <span>Admin</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUserChange('sales_agent')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    settings.activeUser === 'sales_agent'
                      ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Sales Agent Persona (Standard Tier: Flash Models + Sales MCP Tools)"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${settings.activeUser === 'sales_agent' ? 'bg-blue-500' : 'bg-slate-400'}`} />
                  <span>Sales</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUserChange('loans_agent')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    settings.activeUser === 'loans_agent'
                      ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Loans Agent Persona (Standard Tier: Flash Models + Loans MCP Tools)"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${settings.activeUser === 'loans_agent' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  <span>Loans</span>
                </button>
              </div>

              {/* Model Selector */}
              {activeTab === 'ai-gateway' && (
                <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
                  <div className="flex items-center gap-1.5 pl-2.5 pr-1.5 text-slate-600 dark:text-slate-400 text-xs font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                    <span className="font-semibold">Model:</span>
                  </div>
                  <select
                    value={settings.model}
                    onChange={(e) => handleModelChange(e.target.value)}
                    className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold rounded-lg px-2.5 py-1 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer shadow-xs min-w-[210px] max-w-[260px]"
                  >
                    {AVAILABLE_MODELS.map((m) => (
                      <option key={m.id} value={m.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                        {m.id === 'auto' ? 'Auto (Intelligent Routing)' : `${m.name} (${m.tag})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Top-Right SSO User Profile */}
        <div className="flex items-center shrink-0 ml-auto" ref={ssoPopoverRef}>
          <button
            type="button"
            onClick={() => setSsoPopoverOpen(!ssoPopoverOpen)}
            className="flex items-center gap-2 pl-2 pr-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200/80 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition cursor-pointer text-left group shadow-xs shrink-0"
            title={`Logged in via Google Cloud Identity SSO: ${effectiveEmail}`}
          >
            {/* Avatar Circle with Status Indicator */}
            <div className="relative shrink-0">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
                {ssoUser.avatarText || 'SSO'}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 border-2 border-white dark:border-slate-950 rounded-full animate-pulse" />
            </div>

            {/* User Identity Info */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white whitespace-nowrap">
                {ssoUser.name || 'SSO User'}
              </span>
              <span className="text-[9px] bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-mono font-bold px-1 rounded border border-blue-200 dark:border-blue-800 shrink-0">
                SSO
              </span>
            </div>

            <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition shrink-0 ml-1" />
          </button>

            {/* SSO Profile Popover */}
            {ssoPopoverOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 text-xs z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-start justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-bold text-sm ring-2 ring-emerald-400/50">
                      {ssoUser.avatarText || 'SSO'}
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
                    <span className="flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-amber-400" />
                      OIDC Identity Token:
                    </span>
                    <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                      ssoUser.idToken
                        ? 'text-emerald-400 bg-emerald-950/60 border-emerald-500/30'
                        : 'text-slate-400 bg-slate-900 border-slate-700'
                    }`}>
                      {ssoUser.idToken ? 'Bearer Active (gcloud)' : 'Header Fallback'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Session Status:</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Active / Authenticated
                    </span>
                  </div>
                </div>

                <div className="pt-3 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                      <span>Developer Profile Name (First &amp; Last):</span>
                      {profileSaveSuccess && (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <Check className="w-3 h-3" /> Saved to Gateway
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={profileNameInput}
                        onChange={(e) => setProfileNameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleProfileNameSave((e.target as HTMLInputElement).value);
                          }
                        }}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        placeholder="First Last"
                      />
                      <button
                        type="button"
                        disabled={isSavingProfile}
                        onClick={() => handleProfileNameSave()}
                        className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-[10px] font-semibold transition cursor-pointer"
                        title="Update Developer First & Last Name in Gateway"
                      >
                        {isSavingProfile ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-400 mb-1.5">
                      User Identity (<code className="font-mono text-emerald-400">Authorization: Bearer</code>):
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="email"
                        key={ssoUser.email}
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
                        onClick={async () => {
                          await handleEmailUpdate(ssoUser.email || DEFAULT_SSO_USER.email, undefined, true);
                          setSsoPopoverOpen(false);
                        }}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] transition cursor-pointer"
                        title="Re-generate and sync SSO token from gcloud"
                      >
                        Re-sync
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    {ssoUser.idToken
                      ? 'Authenticated via Google SSO Bearer token. Identity is validated by the gateway on every request for zero-trust governance.'
                      : 'Authenticated user email associated with the active session token.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

      {/* Collapsible Mobile Controls Drawer (< md) */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800/80 bg-slate-900/95 px-4 py-3 space-y-3 animate-in slide-in-from-top-2 duration-150">
          {/* Production Status */}
          <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs">
            <span className="flex items-center gap-2 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Gateway Environment
            </span>
            <span className="font-mono font-semibold">Production (Global)</span>
          </div>

          {/* Controls based on active tab */}
          {activeTab === 'analytics' && analyticsControls ? (
            <>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Analytics View</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      analyticsControls.setViewMode('admin');
                      setMobileMenuOpen(false);
                    }}
                    className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition ${
                      analyticsControls.viewMode === 'admin'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Admin Fleet View
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      analyticsControls.setViewMode('user');
                      setMobileMenuOpen(false);
                    }}
                    className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition ${
                      analyticsControls.viewMode === 'user'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    My User View
                  </button>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Time Range</div>
                <div className="grid grid-cols-3 gap-2">
                  {(['24h', '7d', '30d'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        analyticsControls.setTimeRange(r);
                        setMobileMenuOpen(false);
                      }}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold uppercase transition ${
                        analyticsControls.timeRange === r
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Entitlement Tiers */}
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Entitlement Tier (API Key)</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      handleUserChange('admin');
                      setMobileMenuOpen(false);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition truncate ${
                      settings.activeUser === 'admin'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Admin
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
                  <button
                    type="button"
                    onClick={() => {
                      handleUserChange('loans_agent');
                      setMobileMenuOpen(false);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition truncate ${
                      settings.activeUser === 'loans_agent'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Loans Agent
                  </button>
                </div>
              </div>

              {/* Model Selection */}
              {activeTab === 'ai-gateway' && (
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
                        {m.id === 'auto' ? 'Auto (Intelligent Routing)' : `${m.name} (${m.tag})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </header>
  );
};
