import React, { useState } from 'react';
import { GatewayTelemetry, GatewaySettings } from '../types';
import { GoogleLogo, AnthropicLogo } from './ProviderLogos';
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
  Coins,
  Zap,
  History,
} from 'lucide-react';

interface GatewayTraceViewerProps {
  telemetry?: GatewayTelemetry | null;
  settings: GatewaySettings;
  onToggleCache: () => void;
  /** True when the inspector is showing an earlier call rather than the most recent one. */
  isHistorical?: boolean;
  onReturnToLatest?: () => void;
  onRequestQuotaIncrease?: () => void;
}

export const GatewayTraceViewer: React.FC<GatewayTraceViewerProps> = ({
  telemetry,
  settings,
  onToggleCache,
  isHistorical = false,
  onReturnToLatest,
  onRequestQuotaIncrease,
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
    if (ms < 200) return 'text-emerald-600';
    if (ms < 1000) return 'text-blue-600';
    if (ms < 2500) return 'text-amber-600';
    return 'text-rose-600';
  };

  if (!telemetry) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
        <Activity className="w-10 h-10 mb-3 text-slate-700 animate-pulse" />
        <p className="font-semibold text-slate-400 text-sm">Ready for Gateway Traffic</p>
        <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
          Select a sample prompt below or type your query to inspect live Model Armor, Semantic Cache, and Token metrics.
        </p>
      </div>
    );
  }

  const isBlocked = telemetry.guardrailStatus === 'BLOCKED';
  const isCacheHit = telemetry.cacheStatus === 'HIT';

  return (
    <div className="h-full flex flex-col surface-telemetry font-sans text-xs overflow-y-auto">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="font-bold text-slate-800 text-xs tracking-wide uppercase">
            Gateway Telemetry
          </h2>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
            telemetry.status >= 200 && telemetry.status < 300
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}
        >
          HTTP {telemetry.status} {telemetry.statusText}
        </span>
      </div>

      {/*
        Viewing an earlier call. Without this the inspector silently stops tracking new
        responses after you click an old one, which reads as a bug rather than a mode.
      */}
      {isHistorical && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-800">
            <History className="w-3 h-3" />
            Viewing an earlier call
          </span>
          {onReturnToLatest && (
            <button
              type="button"
              onClick={onReturnToLatest}
              className="px-2 py-0.5 rounded-md bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 font-semibold text-[10px] transition cursor-pointer"
            >
              Back to latest
            </button>
          )}
        </div>
      )}

      {/* Focused Telemetry Cards Container */}
      <div className="p-3 space-y-2">
        {/*
          1. Model Routing
        */}
        <div
          data-tour-id="telemetry-model-routing"
          className={`p-2.5 border rounded-xl space-y-1.5 shadow-2xs transition ${
            telemetry.overrideApplied
              ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
              : telemetry.autoRouted
              ? 'bg-purple-50/70 border-purple-300 ring-1 ring-purple-200'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Model Routing
              </span>
            </div>
            {telemetry.overrideApplied ? (
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                Gateway Override
              </span>
            ) : telemetry.autoRouted ? (
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                Auto-Routed
              </span>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 font-mono truncate">
                {telemetry.model || (isCacheHit ? 'Served from cache' : 'No model reported')}
              </div>
              <div className="text-[10px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                {telemetry.model ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                    {telemetry.model.startsWith('claude') ? (
                      <AnthropicLogo className="w-3 h-3" />
                    ) : (
                      <GoogleLogo className="w-3 h-3" />
                    )}
                    <span>{telemetry.provider || (telemetry.model.startsWith('claude') ? 'Anthropic' : 'Google')}</span>
                  </span>
                ) : isCacheHit ? (
                  <span>No model invoked &middot; semantic cache</span>
                ) : (
                  <span>Request did not reach a model</span>
                )}
                {telemetry.costTier && (
                  <>
                    <span>•</span>
                    <span className="uppercase font-medium">{telemetry.costTier} Cost</span>
                  </>
                )}
                {telemetry.intent && (
                  <>
                    <span>•</span>
                    <span className="text-purple-600 font-semibold">{telemetry.intent}</span>
                  </>
                )}
              </div>
            </div>

            {telemetry.costUsd && (
              <div className="text-right shrink-0 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                <div className="text-[9px] text-slate-400 uppercase font-medium">Cost</div>
                <div className="text-xs font-mono font-bold text-emerald-600">
                  ${telemetry.costUsd}
                </div>
              </div>
            )}
          </div>

          {telemetry.overrideApplied && (
            <div className="mt-1 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[10px] text-amber-900 space-y-1">
              <div className="font-mono font-bold flex items-center gap-1 flex-wrap">
                <span className="line-through text-rose-600">{telemetry.requestedModel}</span>
                <span>➔</span>
                <span className="text-emerald-700">{telemetry.model}</span>
              </div>
              {telemetry.overrideReason && (
                <div className="text-[9.5px] text-amber-800 leading-snug">{telemetry.overrideReason}</div>
              )}
            </div>
          )}

          {telemetry.vertexTenancy && (
            <div className="mt-1 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-[9.5px] font-mono text-emerald-800 font-semibold">
              🔒 Tenancy: {telemetry.vertexTenancy}
            </div>
          )}
        </div>

        {/* 2. Token (renamed from Token Quotas & Accounting) */}
        <div className={`p-2.5 bg-white border rounded-xl shadow-2xs ${
          telemetry.status === 429
            ? 'border-amber-300 bg-amber-50/70'
            : 'border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Activity className={`w-3.5 h-3.5 ${telemetry.status === 429 ? 'text-amber-500' : 'text-blue-500'}`} />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Token
              </span>
            </div>
            <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border font-medium ${
              telemetry.status === 429
                ? 'text-amber-700 bg-amber-50 border-amber-200 font-bold'
                : 'text-slate-600 bg-slate-50 border-slate-200'
            }`}>
              {telemetry.status === 429 ? '⚠️ Quota Exceeded (429)' : 'Quota Enforced'}
            </span>
          </div>

          {telemetry.status === 429 ? (
            <div className="space-y-2">
              <div className="p-1.5 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-900 font-medium">
                Token rate quota exceeded. The per-minute LLM token limit for this
                model is defined by your API product tier (Person / Team Quota).
              </div>
              {onRequestQuotaIncrease && (
                <button
                  type="button"
                  onClick={onRequestQuotaIncrease}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[10.5px] transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                >
                  <Zap className="w-3 h-3" />
                  <span>Request Quota Increase (Person / Team)</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[11px]">
              <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                <div className="text-slate-400 text-[9px] font-sans">Prompt</div>
                <div className="font-bold text-slate-800">
                  {telemetry.promptTokens ?? (telemetry.status === 200 ? '—' : 0)}
                </div>
              </div>
              <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                <div className="text-slate-400 text-[9px] font-sans">Output</div>
                <div className="font-bold text-slate-800">
                  {telemetry.candidatesTokens ?? (telemetry.status === 200 ? '—' : 0)}
                </div>
              </div>
              <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                <div className="text-slate-400 text-[9px] font-sans">Total</div>
                <div className="font-bold text-emerald-600">
                  {telemetry.totalTokens ?? (telemetry.status === 200 ? '—' : 0)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. Latency (renamed from Response Latency) */}
        <div
          data-tour-id="telemetry-latency"
          className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Latency
              </span>
            </div>
            <span className="text-[9px] font-mono text-slate-400">Round Trip</span>
          </div>

          <div className="flex items-baseline justify-between">
            <div className={`text-xl font-bold font-mono ${getLatencyColor(telemetry.latencyMs)}`}>
              {telemetry.latencyMs}{' '}
              <span className="text-xs font-sans text-slate-500 font-normal">ms</span>
            </div>

            {isCacheHit ? (
              <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Zap className="w-3 h-3 fill-emerald-500" />
                Vector Cache (~90% Faster)
              </span>
            ) : (
              <span className="text-[10px] font-mono text-slate-500">
                Live LLM Inference
              </span>
            )}
          </div>
        </div>

        {/*
          4. Semantic Cache

          Highlighted when the cache actually served the answer. This is one of the two
          cards that carry a demo, so it gets a tinted surface and a ring rather than a
          numeric delta - the point a presenter makes is "this came from the cache", not
          "this was 62% faster than last time".
        */}
        <div
          data-tour-id="telemetry-semantic-cache"
          className={`p-2.5 border rounded-xl shadow-2xs transition ${
            isCacheHit
              ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-200'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Semantic Cache
              </span>
            </div>

            <button
              onClick={onToggleCache}
              className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-medium border transition cursor-pointer ${
                settings.useCache
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
              title="Click to toggle semantic cache on/off"
            >
              {settings.useCache ? 'use-cache: true' : 'use-cache: omitted'}
            </button>
          </div>

          {/*
            The verdict describes THIS call, so it reads cacheStatus, not the live
            `settings.useCache` toggle above it. Those two disagree the moment you flip
            the toggle - or look back at an earlier call - and the toggle used to win,
            which meant a genuine cache hit could be labelled "Bypassed".
          */}
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold">
              {isCacheHit ? (
                <span className="text-emerald-600 flex items-center gap-1 font-bold">
                  <Zap className="w-3.5 h-3.5 fill-emerald-500" />
                  Vector Cache Hit
                </span>
              ) : telemetry.cacheStatus === 'MISS' ? (
                <span className="text-slate-700">
                  Cache Miss (Seeded to Vector DB)
                </span>
              ) : (
                <span className="text-slate-500">
                  Bypassed (Direct LLM Inference)
                </span>
              )}
            </div>

            {isCacheHit && (
              <span className="text-[9px] font-mono font-bold text-emerald-600">
                $0 Token Cost
              </span>
            )}
          </div>
        </div>

        {/* 5. Model Armor */}
        <div className={`p-2.5 rounded-xl border transition shadow-2xs ${
          isBlocked
            ? 'bg-rose-50 border-rose-200'
            : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              {isBlocked ? (
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Model Armor
              </span>
            </div>
            <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border font-medium ${
              isBlocked
                ? 'text-rose-700 bg-rose-50 border-rose-200 font-bold'
                : 'text-emerald-700 bg-emerald-50 border-emerald-200'
            }`}>
              {isBlocked ? 'Blocked (400)' : 'Secured'}
            </span>
          </div>

          <div className="text-xs font-semibold">
            {isBlocked ? (
              <span className="text-rose-600">
                {telemetry.guardrailMessage || 'Malicious prompt blocked by Model Armor'}
              </span>
            ) : (
              <span className="text-emerald-600 flex items-center gap-1">
                Clean — Zero safety anomalies detected
              </span>
            )}
          </div>
        </div>

        {/* 6. Wallet (renamed from Monetization & Wallet) */}
        <div className={`p-2.5 bg-white border rounded-xl shadow-2xs ${
          telemetry.status === 403 && (telemetry.headersReceived['x-gateway-monetization-status'] || JSON.stringify(telemetry.rawResponse || {}).includes('Monetization') || JSON.stringify(telemetry.rawResponse || {}).includes('prepaid'))
            ? 'border-rose-300 bg-rose-50/70'
            : 'border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Wallet
              </span>
            </div>
            <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border font-medium ${
              telemetry.status === 403 && (telemetry.headersReceived['x-gateway-monetization-status'] || JSON.stringify(telemetry.rawResponse || {}).includes('Monetization') || JSON.stringify(telemetry.rawResponse || {}).includes('prepaid'))
                ? 'text-rose-700 bg-rose-50 border-rose-200 font-bold'
                : 'text-emerald-700 bg-emerald-50 border-emerald-200'
            }`}>
              {telemetry.status === 403 && (telemetry.headersReceived['x-gateway-monetization-status'] || JSON.stringify(telemetry.rawResponse || {}).includes('Monetization') || JSON.stringify(telemetry.rawResponse || {}).includes('prepaid'))
                ? '❌ Depleted (403)'
                : 'Prepaid Active'}
            </span>
          </div>

          {telemetry.status === 403 && (telemetry.headersReceived['x-gateway-monetization-status'] || JSON.stringify(telemetry.rawResponse || {}).includes('Monetization') || JSON.stringify(telemetry.rawResponse || {}).includes('prepaid')) ? (
            <div className="p-1.5 bg-rose-50 border border-rose-200 rounded-lg text-[10px] text-rose-900 font-medium">
              Prepaid balance exhausted ($0.00). Top up in Monetization tab.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
              <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                <div className="text-slate-400 text-[9px] font-sans">Start Balance</div>
                <div className="font-bold text-slate-800 truncate">
                  ${telemetry.headersReceived['x-gateway-prepaid-balance'] || '109.988'}
                </div>
              </div>
              <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                <div className="text-slate-400 text-[9px] font-sans">Remaining</div>
                <div className="font-bold text-emerald-600 truncate">
                  ${telemetry.headersReceived['x-gateway-balance-remaining'] || '109.988'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Accordion: Deep Technical Details (HTTP Headers & Raw JSON) */}
        <div className="pt-2">
          <button
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 transition text-xs shadow-2xs cursor-pointer"
          >
            <div className="flex items-center gap-2 font-medium">
              <Code2 className="w-3.5 h-3.5 text-blue-500" />
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
              {/* Response Headers Received */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <div className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-emerald-500" />
                  Gateway Response Headers (<span className="text-emerald-600">x-gateway-*</span>):
                </div>
                <div className="space-y-1 divide-y divide-slate-100 max-h-48 overflow-y-auto pr-1">
                  {Object.entries(telemetry.headersReceived)
                    .filter(([k]) => k.startsWith('x-gateway') || k.startsWith('x-auto') || k.startsWith('content-type') || k.startsWith('x-accel'))
                    .map(([k, v]) => (
                      <div key={k} className="pt-1 flex items-start justify-between gap-2">
                        <span className="text-emerald-700 font-semibold">{k}:</span>
                        <span className="text-slate-800 text-right break-all font-mono">{v}</span>
                      </div>
                    ))}
                  {Object.keys(telemetry.headersReceived).filter((k) => k.startsWith('x-gateway')).length === 0 && (
                    <div className="text-slate-500 italic text-[10px] py-1">
                      No custom x-gateway headers in direct response (Standard HTTP headers received)
                    </div>
                  )}
                </div>
              </div>

              {/* Request Headers */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <div className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <Send className="w-3 h-3 text-blue-500" />
                  Request Headers Sent:
                </div>
                <div className="space-y-1 divide-y divide-slate-100">
                  {Object.entries(telemetry.headersSent).map(([k, v]) => (
                    <div key={k} className="pt-1 flex items-start justify-between gap-2">
                      <span className="text-slate-500">{k}:</span>
                      <span className="text-slate-800 text-right break-all">
                        {k.toLowerCase().includes('apikey')
                          ? `${v.slice(0, 8)}...${v.slice(-6)}`
                          : k.toLowerCase() === 'authorization' && v.startsWith('Bearer ')
                          ? `Bearer ${v.slice(7, 19)}...${v.slice(-8)} (Google SSO Token)`
                          : v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Raw JSON */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-800">Raw JSON Response:</span>
                  <button
                    onClick={handleCopyJson}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 overflow-x-auto text-[10px] text-slate-800 leading-relaxed max-h-60">
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
