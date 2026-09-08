import React, { useState } from 'react';
import { GatewayTelemetry, GatewaySettings } from '../types';
import {
  Activity,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Database,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Code2,
  Send,
  User,
} from 'lucide-react';

interface GatewayTraceViewerProps {
  telemetry?: GatewayTelemetry | null;
  settings: GatewaySettings;
  onToggleCache: () => void;
}

export const GatewayTraceViewer: React.FC<GatewayTraceViewerProps> = ({
  telemetry,
  settings,
  onToggleCache,
}) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyJson = () => {
    if (!telemetry) return;
    navigator.clipboard.writeText(JSON.stringify(telemetry.rawResponse, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLatencyColor = (ms: number) => {
    if (ms < 200) return 'text-emerald-400';
    if (ms < 1000) return 'text-blue-400';
    if (ms < 2500) return 'text-amber-400';
    return 'text-rose-400';
  };

  if (!telemetry) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
        <Activity className="w-10 h-10 mb-3 text-slate-700 animate-pulse" />
        <p className="font-semibold text-slate-400 text-sm">Ready for Gateway Traffic</p>
        <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
          Select a sample prompt below or type your query to inspect live Apigee Model Armor, Semantic Cache, and Token metrics.
        </p>
      </div>
    );
  }

  const isBlocked = telemetry.guardrailStatus === 'BLOCKED';
  const isCacheHit = telemetry.cacheStatus === 'HIT';

  return (
    <div className="h-full flex flex-col bg-slate-950 font-sans text-xs overflow-y-auto">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/40">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="font-bold text-slate-200 text-xs tracking-wide uppercase">
            Gateway Telemetry
          </h2>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
            telemetry.status >= 200 && telemetry.status < 300
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
          }`}
        >
          HTTP {telemetry.status} {telemetry.statusText}
        </span>
      </div>

      {/* 4 Focused Summary Cards */}
      <div className="p-4 space-y-3.5">
        {/* Caller Identity & SSO Pill */}
        <div className="flex flex-col gap-1.5 p-2.5 bg-slate-900/90 rounded-xl border border-slate-800 text-[11px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-300 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>SSO Identity:</span>
              <span className="font-semibold text-white truncate max-w-[120px]">
                {telemetry.ssoUser?.name || settings.ssoUser?.name || 'Satyam Maloo'}
              </span>
            </div>
            <span
              className="font-mono text-[10px] text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/25 truncate max-w-[160px]"
              title={telemetry.userEmail || settings.ssoUser?.email || settings.userEmail}
            >
              {telemetry.userEmail || settings.ssoUser?.email || settings.userEmail}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3 text-amber-400 shrink-0" />
              Entitlement Tier:
            </span>
            <span className="font-semibold text-amber-300">{telemetry.user || 'Bronze User'}</span>
          </div>
        </div>

        {/* Card 1: Model Armor Guardrail */}
        <div
          className={`p-3.5 rounded-xl border transition-all ${
            isBlocked
              ? 'bg-rose-950/30 border-rose-500/50 shadow-lg shadow-rose-950/20'
              : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Model Armor
            </span>
            <span className="text-[10px] font-mono text-slate-500">SUP-UserPrompt</span>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isBlocked
                  ? 'bg-rose-500/20 border border-rose-500/40 text-rose-400'
                  : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
              }`}
            >
              {isBlocked ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>

            <div>
              <div
                className={`text-sm font-bold ${
                  isBlocked ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {isBlocked ? 'Violation Blocked' : 'Secured'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                {isBlocked
                  ? telemetry.guardrailMessage || 'オフOffending input intercepted before LLM'
                  : 'Zero safety anomalies detected'}
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Semantic Caching */}
        <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Semantic Caching
              </span>
            </div>

            <button
              onClick={onToggleCache}
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                settings.useCache
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {settings.useCache ? 'Cache: ON' : 'Cache: OFF'}
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <div
                className={`text-sm font-bold ${
                  isCacheHit ? 'text-emerald-400' : 'text-slate-300'
                }`}
              >
                {settings.useCache
                  ? isCacheHit
                    ? '⚡ Vector Cache Hit'
                    : 'Cache Miss (Seeded)'
                  : 'Cache Disabled'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {isCacheHit ? 'Sub-100ms response from Vertex DB' : 'Generated via live inference'}
              </div>
            </div>

            {isCacheHit && (
              <span className="text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-1 rounded-lg font-mono text-[11px] font-bold">
                ~90% Faster
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Response Latency */}
        <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Response Latency
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">End-to-End</span>
          </div>

          <div className="flex items-baseline justify-between">
            <div className={`text-2xl font-bold font-mono ${getLatencyColor(telemetry.latencyMs)}`}>
              {telemetry.latencyMs}{' '}
              <span className="text-xs font-sans text-slate-400 font-normal">ms</span>
            </div>

            <div className="text-[11px] text-slate-400 text-right">
              <div>Route: <strong className="text-slate-200">{telemetry.model}</strong></div>
              {telemetry.autoRouted && (
                <span className="text-[10px] text-blue-400 font-mono">Auto-routed</span>
              )}
            </div>
          </div>
        </div>

        {/* Card 4: Token Quota Accounting */}
        <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Token Quotas
              </span>
            </div>
            <span className="text-[10px] font-mono text-purple-400 bg-purple-950/50 px-1.5 py-0.5 rounded border border-purple-500/30">
              LTQ-TokenQuota
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center pt-1 font-mono">
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <div className="text-slate-500 text-[10px]">Prompt</div>
              <div className="text-xs font-bold text-slate-200 mt-0.5">
                {telemetry.promptTokens ?? (telemetry.status === 200 ? '—' : 0)}
              </div>
            </div>

            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <div className="text-slate-500 text-[10px]">Output</div>
              <div className="text-xs font-bold text-slate-200 mt-0.5">
                {telemetry.candidatesTokens ?? (telemetry.status === 200 ? '—' : 0)}
              </div>
            </div>

            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
              <div className="text-slate-500 text-[10px]">Total</div>
              <div className="text-xs font-bold text-emerald-400 mt-0.5">
                {telemetry.totalTokens ?? (telemetry.status === 200 ? '—' : 0)}
              </div>
            </div>
          </div>
        </div>

        {/* Accordion: Deep Technical Details (HTTP Headers & Raw JSON) */}
        <div className="pt-2">
          <button
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-200 transition text-xs"
          >
            <div className="flex items-center gap-2 font-medium">
              <Code2 className="w-3.5 h-3.5 text-blue-400" />
              <span>Inspect HTTP Headers & Raw JSON</span>
            </div>
            {showTechnicalDetails ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {showTechnicalDetails && (
            <div className="mt-3 space-y-3 font-mono text-[11px] animate-in fade-in duration-150">
              {/* Request Headers */}
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <div className="font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Send className="w-3 h-3 text-blue-400" />
                  Request Headers Sent:
                </div>
                <div className="space-y-1 divide-y divide-slate-800/60">
                  {Object.entries(telemetry.headersSent).map(([k, v]) => (
                    <div key={k} className="pt-1 flex items-start justify-between gap-2">
                      <span className="text-slate-500">{k}:</span>
                      <span className="text-slate-200 text-right break-all">
                        {k.toLowerCase().includes('apikey')
                          ? `${v.slice(0, 8)}...${v.slice(-6)}`
                          : v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Raw JSON */}
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-300">Raw JSON Response:</span>
                  <button
                    onClick={handleCopyJson}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="p-2.5 bg-slate-950 rounded-lg overflow-x-auto text-[10px] text-slate-300 leading-relaxed max-h-60">
                  {JSON.stringify(telemetry.rawResponse, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
