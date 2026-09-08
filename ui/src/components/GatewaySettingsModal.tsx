import React, { useState } from 'react';
import { GatewaySettings, GatewayEnvironment, UserPersona } from '../types';
import { DEFAULT_SETTINGS, USERS, DEFAULT_SSO_USER } from '../services/defaultSettings';
import { X, Save, RotateCcw, ShieldCheck, Server, User, AlertTriangle, Mail } from 'lucide-react';

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

  const handleEnvSelect = (env: GatewayEnvironment) => {
    setForm((prev) => ({
      ...prev,
      environment: env,
    }));
  };

  const handleUserSelect = (userPersona: UserPersona) => {
    const user = USERS[userPersona];
    setForm((prev) => ({
      ...prev,
      activeUser: userPersona,
      apiKey: user.apiKey,
    }));
  };

  const handleEmailChange = (newEmail: string) => {
    const cleanEmail = newEmail.trim() || DEFAULT_SSO_USER.email;
    setForm((prev) => ({
      ...prev,
      userEmail: cleanEmail,
      ssoUser: {
        ...(prev.ssoUser || DEFAULT_SSO_USER),
        email: cleanEmail,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white">Apigee Gateway Configuration</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs">
          {/* Environment Selection */}
          <div className="space-y-2">
            <label className="text-slate-300 font-semibold flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-blue-400" />
              <span>Target Gateway Environment</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleEnvSelect('dev')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  form.environment === 'dev'
                    ? 'bg-blue-950/60 border-blue-500 text-white'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-xs">Dev</div>
                <div className="text-[10px] opacity-75 mt-0.5 truncate">bap.api...altostrat.com</div>
              </button>

              <button
                type="button"
                onClick={() => handleEnvSelect('prod')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  form.environment === 'prod'
                    ? 'bg-purple-950/60 border-purple-500 text-white'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-xs">Production</div>
                <div className="text-[10px] opacity-75 mt-0.5 truncate">api...altostrat.com</div>
              </button>

              <button
                type="button"
                onClick={() => handleEnvSelect('custom')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  form.environment === 'custom'
                    ? 'bg-amber-950/60 border-amber-500 text-white'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-xs">Custom Base URL</div>
                <div className="text-[10px] opacity-75 mt-0.5">Manual endpoint</div>
              </button>
            </div>

            {form.environment === 'custom' && (
              <div className="mt-2">
                <input
                  type="text"
                  value={form.customBaseUrl}
                  onChange={(e) => setForm({ ...form, customBaseUrl: e.target.value })}
                  placeholder="https://your-apigee-host.com/vertexai/v1"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {/* SSO Caller Identity Section */}
          <div className="space-y-2">
            <label className="text-slate-300 font-semibold flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-emerald-400" />
              <span>Enterprise SSO User Identity (<code className="font-mono text-emerald-400 text-[11px]">X-User-Email</code>)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={ssoEmail}
                onChange={(e) => handleEmailChange(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="user@google.com"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/me');
                    if (res.ok) {
                      const data = await res.json();
                      const clean = (data.email || '').replace(/^accounts\.google\.com:/, '').trim();
                      if (clean) {
                        handleEmailChange(clean);
                        return;
                      }
                    }
                  } catch {
                    // ignore fetch errors
                  }
                  handleEmailChange(DEFAULT_SSO_USER.email);
                }}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition cursor-pointer"
                title="Re-sync from active SSO session"
              >
                Re-sync
              </button>
            </div>
          </div>

          {/* Entitlement Tier Selection */}
          <div className="space-y-2">
            <label className="text-slate-300 font-semibold flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-amber-400" />
              <span>API Entitlement Tier (<code className="font-mono text-amber-400 text-[11px]">x-apikey</code>)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleUserSelect('bronze_user')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  form.activeUser === 'bronze_user'
                    ? 'bg-amber-950/60 border-amber-500 text-white ring-1 ring-amber-400/30'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-xs text-amber-300">Bronze Tier</div>
                <div className="text-[10px] opacity-80 mt-0.5">Standard Dev Quota</div>
                <div className="text-[9px] font-mono text-slate-500 mt-1 truncate">Key: {USERS.bronze_user.apiKey.slice(0, 8)}...</div>
              </button>

              <button
                type="button"
                onClick={() => handleUserSelect('silver_user')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  form.activeUser === 'silver_user'
                    ? 'bg-cyan-950/60 border-cyan-500 text-white ring-1 ring-cyan-400/30'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-xs text-cyan-300">Silver Tier</div>
                <div className="text-[10px] opacity-80 mt-0.5">401 Product Boundary</div>
                <div className="text-[9px] font-mono text-slate-500 mt-1 truncate">Key: {USERS.silver_user.apiKey.slice(0, 8)}...</div>
              </button>

              <button
                type="button"
                onClick={() => handleUserSelect('sales_agent')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  form.activeUser === 'sales_agent'
                    ? 'bg-indigo-950/60 border-indigo-500 text-white ring-1 ring-indigo-400/30'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-xs text-indigo-300">Sales Agent</div>
                <div className="text-[10px] opacity-80 mt-0.5">Enterprise Agent Tier</div>
                <div className="text-[9px] font-mono text-slate-500 mt-1 truncate">Key: {USERS.sales_agent.apiKey.slice(0, 8)}...</div>
              </button>
            </div>

            {/* Injected Headers Preview */}
            <div className="mt-3 p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">X-User-Email:</span>
                <span className={form.omitEmailHeader ? 'text-rose-400 line-through' : 'text-emerald-400'}>
                  {form.omitEmailHeader ? '(Header Omitted for Testing)' : ssoEmail}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">x-apikey:</span>
                <span className="text-amber-400">{form.apiKey ? `${form.apiKey.slice(0, 10)}...${form.apiKey.slice(-6)}` : '—'}</span>
              </div>
            </div>

            <label className="flex items-center gap-2 p-2 mt-2 rounded-lg bg-orange-950/20 border border-orange-500/30 text-orange-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.omitEmailHeader}
                onChange={(e) => setForm({ ...form, omitEmailHeader: e.target.checked })}
                className="rounded bg-slate-800 border-slate-600 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-orange-400" />
                Simulate Missing Email (Tests Apigee <code className="font-mono">RF-MissingUserEmail</code> 401 rejection)
              </span>
            </label>
          </div>

          {/* Project & Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 text-[11px] block mb-1">GCP Project ID:</label>
              <input
                type="text"
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-[11px]"
              />
            </div>
            <div>
              <label className="text-slate-400 text-[11px] block mb-1">Vertex AI Location:</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-[11px]"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg shadow-blue-600/25 transition"
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
