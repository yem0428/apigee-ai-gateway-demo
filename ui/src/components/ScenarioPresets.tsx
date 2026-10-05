import React from 'react';
import { ScenarioPreset, GatewaySettings } from '../types';
import { SCENARIO_PRESETS } from '../services/defaultSettings';
import { Play, ArrowUpRight, ShieldAlert, Sparkles, Database, Zap, KeyRound } from 'lucide-react';

interface ScenarioPresetsProps {
  onSelectPreset: (preset: ScenarioPreset, autoRun?: boolean) => void;
  activeSettings: GatewaySettings;
}

export const ScenarioPresets: React.FC<ScenarioPresetsProps> = ({
  onSelectPreset,
}) => {
  const getBadgeStyle = (color: string) => {
    switch (color) {
      case 'red':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'rose':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'purple':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'emerald':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'amber':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'cyan':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      case 'orange':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Security':
        return <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />;
      case 'Performance':
        return <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'Routing':
        return <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case 'Governance':
        return <KeyRound className="w-3.5 h-3.5 text-orange-400 shrink-0" />;
      default:
        return <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
    }
  };

  return (
    <div className="p-3 bg-slate-50 border-b border-slate-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
          <span>AI Demo Presets:</span>
          <span className="text-[10px] text-slate-500 font-normal ml-1">
            Click block to load, or click ▶ to test immediately
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {SCENARIO_PRESETS.map((preset) => (
          <div
            key={preset.id}
            className="group relative bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-400 rounded-xl p-3 transition flex flex-col justify-between cursor-pointer shadow-xs hover:shadow-sm"
            onClick={() => onSelectPreset(preset, false)}
          >
            <div>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <div className="flex items-center gap-1.5">
                  {getCategoryIcon(preset.category)}
                  <span className="text-xs font-semibold text-slate-900 group-hover:text-blue-600 transition line-clamp-1">
                    {preset.title}
                  </span>
                </div>
                <span
                  className={`text-[9px] font-mono font-medium px-2 py-0.5 rounded-full border ${getBadgeStyle(
                    preset.badgeColor
                  )}`}
                >
                  {preset.badgeText}
                </span>
              </div>

              <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                "{preset.prompt}"
              </p>
            </div>

            <div className="mt-2.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
              <span className="text-slate-500 group-hover:text-slate-700 flex items-center gap-0.5">
                <ArrowUpRight className="w-3 h-3" /> Load prompt
              </span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPreset(preset, true);
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-xs transition"
                title="Send immediately to the Gateway"
              >
                <Play className="w-2.5 h-2.5 fill-current" />
                <span>Run</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
