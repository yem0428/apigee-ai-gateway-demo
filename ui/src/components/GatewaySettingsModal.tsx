import React, { useState } from 'react';
import { GatewaySettings, UserPersona } from '../types';
import { DEFAULT_SETTINGS, USERS, DEFAULT_SSO_USER } from '../services/defaultSettings';
import { X, Save, RotateCcw, ShieldCheck, Server, User, AlertTriangle, Mail, Key, Zap } from 'lucide-react';

interface GatewaySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GatewaySettings;
  onSave: (newSettings: GatewaySettings) => void;
}

export const GatewaySettingsModal: React.FC<GatewaySettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [form, setForm] = useState<GatewaySettings>({ ...settings });

  if (!isOpen) return null;

  const handleUserSelect = (userPersona: UserPersona) => {
    const user = USERS[userPersona];
    setForm((prev) => ({
      ...prev,
      activeUser: userPersona,
      apiKey: user.apiKey,
    }));
  };

  const handleEmailChange = (email: string, idToken?: string) => {
    const cleanEmail = email.trim() || DEFAULT_SSO_USER.email;
    setForm((prev) => ({
      ...prev,
      userEmail: cleanEmail,
      idToken: idToken !== undefined ? idToken : prev.idToken,
      ssoUser: {
        ...(prev.ssoUser || DEFAULT_SSO_USER),
        email: cleanEmail,
        idToken: idToken !== undefined ? idToken : prev.ssoUser?.idToken,
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    onClose();
  };

  const handleReset = () => {
    setForm({ ...DEFAULT_SETTINGS });
  };

  const ssoEmail = form.ssoUser?.email || form.userEmail || DEFAULT_SSO_USER.email;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Gateway Configuration</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs">
          {/* Environment Status (Production Only) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Target Gateway Environment</span>
              </label>
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-500/30 text-[10px] font-mono font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Production (Global)
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              Base URL: <span className="text-slate-900 dark:text-slate-200 font-semibold">https://api.maloosatyam.demo.altostrat.com</span>
            </div>
          </div>

          {/* SSO Caller Identity Section */}
          <div className="space-y-2">
            <label className="text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Enterprise SSO User Identity (<code className="font-mono text-emerald-700 dark:text-emerald-400 text-[11px]">Authorization Bearer</code>)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={ssoEmail}
                onChange={(e) => handleEmailChange(e.target.value)}
                className="flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs"
                placeholder="user@google.com"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/me?refresh=true');
                    if (res.ok) {
                      const data = await res.json();
                      const clean = (data.email || '').replace(/^accounts\.google\.com:/, '').trim();
                      if (clean) {
                        handleEmailChange(clean, data.token);
                        return;
                      }
                    }
                  } catch {
                    // ignore fetch errors
                  }
                  handleEmailChange(DEFAULT_SSO_USER.email);
                }}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
                title="Re-generate and sync SSO token from gcloud"
              >
                Re-sync
              </button>
            </div>
            {form.ssoUser?.idToken ? (
              <div className="flex items-center justify-between px-3 py-2 bg-emerald-50/70 dark:bg-slate-950/80 border border-emerald-200 dark:border-slate-800 rounded-xl text-[11px] font-mono">
                <span className="text-emerald-900 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <Key className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>gcloud SSO Token Active</span>
                </span>
                <span className="text-emerald-700 dark:text-emerald-400 font-bold truncate max-w-[220px]" title={form.ssoUser.idToken}>
                  Bearer {form.ssoUser.idToken.slice(0, 10)}...{form.ssoUser.idToken.slice(-6)}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between px-3 py-2 bg-slate-100/70 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] font-mono text-slate-500">
                <span>Identity Mode: Header Fallback</span>
                <span>gcloud token not attached</span>
              </div>
            )}
          </div>

          {/* Entitlement Tier Selection */}
          <div className="space-y-2">
            <label className="text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>API Entitlement Tier (<code className="font-mono text-amber-700 dark:text-amber-400 text-[11px]">x-apikey</code>)</span>
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => handleUserSelect('admin')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer shadow-2xs ${form.activeUser === 'admin'
                    ? 'bg-purple-50 border-purple-300 text-purple-900 ring-2 ring-purple-500/20 dark:bg-purple-950/60 dark:border-purple-500 dark:text-white dark:ring-purple-400/30'
                    : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <div className={`font-bold text-xs ${form.activeUser === 'admin' ? 'text-purple-700 dark:text-purple-300' : 'text-slate-800 dark:text-slate-200'}`}>Admin</div>
                <div className={`text-[10px] mt-0.5 ${form.activeUser === 'admin' ? 'text-purple-700/80 dark:text-purple-200/80' : 'text-slate-500 dark:text-slate-400'}`}>All Models & MCP</div>
                <div className="text-[9px] font-mono text-slate-400 dark:text-slate-500 mt-1 truncate">Key: {USERS.admin.apiKey ? `${USERS.admin.apiKey.slice(0, 8)}...` : 'Not Set'}</div>
              </button>

              <button
                type="button"
                onClick={() => handleUserSelect('sales_agent')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer shadow-2xs ${form.activeUser === 'sales_agent'
                    ? 'bg-blue-50 border-blue-300 text-blue-900 ring-2 ring-blue-500/20 dark:bg-indigo-950/60 dark:border-indigo-500 dark:text-white dark:ring-indigo-400/30'
                    : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <div className={`font-bold text-xs ${form.activeUser === 'sales_agent' ? 'text-blue-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'}`}>Sales Agent</div>
                <div className={`text-[10px] mt-0.5 ${form.activeUser === 'sales_agent' ? 'text-blue-700/80 dark:text-indigo-200/80' : 'text-slate-500 dark:text-slate-400'}`}>Flash + Sales Tools</div>
                <div className="text-[9px] font-mono text-slate-400 dark:text-slate-500 mt-1 truncate">Key: {USERS.sales_agent.apiKey ? `${USERS.sales_agent.apiKey.slice(0, 8)}...` : 'Not Set'}</div>
              </button>

              <button
                type="button"
                onClick={() => handleUserSelect('loans_agent')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer shadow-2xs ${form.activeUser === 'loans_agent'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 ring-2 ring-emerald-500/20 dark:bg-emerald-950/60 dark:border-emerald-500 dark:text-white dark:ring-emerald-400/30'
                    : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-slate-700 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <div className={`font-bold text-xs ${form.activeUser === 'loans_agent' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-200'}`}>Loans Agent</div>
                <div className={`text-[10px] mt-0.5 ${form.activeUser === 'loans_agent' ? 'text-emerald-700/80 dark:text-emerald-200/80' : 'text-slate-500 dark:text-slate-400'}`}>Flash + Loans Tools</div>
                <div className="text-[9px] font-mono text-slate-400 dark:text-slate-500 mt-1 truncate">Key: {USERS.loans_agent.apiKey ? `${USERS.loans_agent.apiKey.slice(0, 8)}...` : 'Not Set'}</div>
              </button>
            </div>

            {/* Injected Headers Preview */}
            <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-950/70 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Authorization:</span>
                <span className={form.omitEmailHeader ? 'text-rose-600 dark:text-rose-400 line-through font-semibold' : 'text-emerald-700 dark:text-emerald-400 font-semibold'}>
                  {form.omitEmailHeader ? '(Authorization Bearer Omitted for Testing)' : `Bearer ya29... (${ssoEmail})`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">x-apikey:</span>
                <span className="text-amber-700 dark:text-amber-400 font-semibold">{form.apiKey ? `${form.apiKey.slice(0, 10)}...${form.apiKey.slice(-6)}` : '—'}</span>
              </div>
            </div>

            {/* Semantic Cache Toggle */}
            <label className="flex items-center justify-between p-2.5 mt-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-850 transition">
              <div className="flex items-center gap-2">
                <Zap className={`w-4 h-4 ${form.useCache ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">Semantic Vector Cache</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Attaches <code className="text-emerald-700 dark:text-emerald-400 font-mono">use-cache: true</code> header cache hits</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.useCache}
                onChange={(e) => setForm({ ...form, useCache: e.target.checked })}
                className="w-4 h-4 rounded bg-white border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
            </label>

            {/* Simulate Missing Authorization */}
            <label className="flex items-center gap-2.5 p-2.5 mt-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-500/30 dark:text-amber-300 cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-950/40 transition">
              <input
                type="checkbox"
                checked={form.omitEmailHeader}
                onChange={(e) => setForm({ ...form, omitEmailHeader: e.target.checked })}
                className="w-4 h-4 rounded bg-white border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <span className="text-[11px] font-medium flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Simulate Missing Authorization (Tests 401 Unauthorized rejection)</span>
              </span>
            </label>
          </div>

          {/* Project & Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-[11px] block mb-1 font-medium">GCP Project ID:</label>
              <input
                type="text"
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-200 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs"
              />
            </div>
            <div>
              <label className="text-slate-600 dark:text-slate-400 text-[11px] block mb-1 font-medium">Vertex AI Location:</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-200 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-300 transition font-medium cursor-pointer shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white transition font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md shadow-blue-600/20 transition cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Settings</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
