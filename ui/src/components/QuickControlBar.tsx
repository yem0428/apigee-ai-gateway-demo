import React from 'react';
import { GatewaySettings, GatewayEnvironment, KeyTier } from '../types';
import { KEY_TIERS, ENVIRONMENTS, AVAILABLE_MODELS } from '../services/defaultSettings';
import { Server, Key, Sparkles, Database, Settings2 } from 'lucide-react';

interface QuickControlBarProps {
  settings: GatewaySettings;
  setSettings: React.Dispatch<React.SetStateAction<GatewaySettings>>;
  onOpenSettings: () => void;
}

export const QuickControlBar: React.FC<QuickControlBarProps> = ({
  settings,
  setSettings,
  onOpenSettings,
}) => {
  const handleEnvChange = (env: GatewayEnvironment) => {
    setSettings((prev) => ({
      ...prev,
      environment: env,
    }));
  };

  const handleKeyTierChange = (tier: KeyTier) => {
    setSettings((prev) => ({
      ...prev,
      keyTier: tier,
      apiKey: tier === 'custom' ? prev.apiKey : KEY_TIERS[tier].key,
    }));
  };

  const handleModelChange = (modelId: string) => {
    setSettings((prev) => ({
      ...prev,
      model: modelId,
    }));
  };

  const handleToggleCache = () => {
    setSettings((prev) => ({
      ...prev,
      useCache: !prev.useCache,
    }));
  };

  return (
    <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        {/* Environment Selector */}
        <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60">
          <Server className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="text-slate-400 font-medium mr-1">Gateway:</span>
          <button
            onClick={() => handleEnvChange('dev')}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
              settings.environment === 'dev'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
            title={ENVIRONMENTS.dev.upstreamUrl}
          >
            Dev
          </button>
          <button
            onClick={() => handleEnvChange('prod')}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
              settings.environment === 'prod'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
            title={ENVIRONMENTS.prod.upstreamUrl}
          >
            Prod
          </button>
          {settings.environment === 'custom' && (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-600/30 text-amber-300 border border-amber-500/40">
              Custom URL
            </span>
          )}
        </div>

        {/* Key Tier Selector */}
        <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60">
          <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-slate-400 font-medium mr-1">Key Tier:</span>
          <button
            onClick={() => handleKeyTierChange('bronze')}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
              settings.keyTier === 'bronze'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            Bronze
          </button>
          <button
            onClick={() => handleKeyTierChange('silver')}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
              settings.keyTier === 'silver'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            Silver
          </button>
          {settings.keyTier === 'custom' && (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-600/30 text-emerald-300 border border-emerald-500/40">
              Custom Key
            </span>
          )}
        </div>

        {/* Model Selector */}
        <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-slate-400 font-medium mr-1">Model:</span>
          <select
            value={settings.model}
            onChange={(e) => handleModelChange(e.target.value)}
            className="bg-slate-900 text-slate-200 text-[11px] font-mono rounded px-2 py-0.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Semantic Cache Toggle */}
        <button
          onClick={handleToggleCache}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition ${
            settings.useCache
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 shadow-sm'
              : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-slate-300'
          }`}
          title="Sends header: use-cache: true to trigger Apigee SCL-Semantic-Cache-Lookup"
        >
          <Database className={`w-3.5 h-3.5 ${settings.useCache ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span>Semantic Cache:</span>
          <strong className={settings.useCache ? 'text-emerald-300' : 'text-slate-400'}>
            {settings.useCache ? 'ENABLED' : 'DISABLED'}
          </strong>
        </button>
      </div>

      {/* Advanced Settings Trigger */}
      <button
        onClick={onOpenSettings}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-300 transition text-[11px]"
      >
        <Settings2 className="w-3.5 h-3.5 text-slate-400" />
        <span>Config & Headers</span>
      </button>
    </div>
  );
};
