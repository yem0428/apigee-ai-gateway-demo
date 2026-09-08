import React from 'react';
import { ShieldCheck, RotateCcw, Settings2, Sparkles, User } from 'lucide-react';
import { GatewaySettings, GatewayEnvironment, UserPersona } from '../types';
import { USERS, AVAILABLE_MODELS } from '../services/defaultSettings';

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
  const handleEnvChange = (env: GatewayEnvironment) => {
    setSettings((prev) => ({ ...prev, environment: env }));
  };

  const handleUserChange = (userPersona: UserPersona) => {
    const user = USERS[userPersona];
    setSettings((prev) => ({
      ...prev,
      activeUser: userPersona,
      userEmail: user.email,
      apiKey: user.apiKey,
    }));
  };

  const handleModelChange = (modelId: string) => {
    setSettings((prev) => ({ ...prev, model: modelId }));
  };

  const isDev = settings.environment === 'dev' || (settings.environment as string) === 'bap';
  const isProd = settings.environment === 'prod';

  return (
    <header className="bg-slate-950/95 border-b border-slate-800 sticky top-0 z-40 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-md shadow-blue-500/25">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-white tracking-tight">Apigee AI Gateway</span>
              <span className="text-[10px] bg-blue-500/15 text-blue-400 font-mono font-medium px-1.5 py-0.5 rounded border border-blue-500/25">
                Studio
              </span>
            </div>
          </div>
        </div>

        {/* Center: Always Visible Segmented Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
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

          {/* User Persona Segmented Control */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => handleUserChange('bronze_user')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                settings.activeUser === 'bronze_user'
                  ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-400/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Bronze User: bronze.user@example.com"
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
              title="Silver User: silver.user@example.com"
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
              title="Sales Agent: sales.agent@example.com"
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

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* New Chat / Reset */}
          <button
            type="button"
            onClick={onResetChat}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition text-xs cursor-pointer"
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
        </div>
      </div>
    </header>
  );
};
