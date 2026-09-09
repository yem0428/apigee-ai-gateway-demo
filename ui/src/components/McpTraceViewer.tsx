import React, { useState } from 'react';
import { McpTelemetry } from '../types';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Code2,
  Copy,
  Check,
  Shield,
  Key,
  Database,
  FileJson,
  User,
} from 'lucide-react';

interface McpTraceViewerProps {
  telemetry: McpTelemetry | null;
  loading?: boolean;
}

export const McpTraceViewer: React.FC<McpTraceViewerProps> = ({ telemetry, loading }) => {
  const [activeTab, setActiveTab] = useState<'response' | 'request' | 'headers'>('response');
  const [copied, setCopied] = useState(false);

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-slate-900/40 border border-slate-800 rounded-2xl">
        <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-4" />
        <h4 className="text-sm font-semibold text-slate-200">Executing MCP Request</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          Routing JSON-RPC payload through Apigee PP-MCP, checking API Key entitlements, and executing tool...
        </p>
      </div>
    );
  }

  if (!telemetry) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-slate-900/30 border border-slate-800/80 rounded-2xl">
        <div className="w-12 h-12 rounded-2xl bg-cyan-950/40 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4">
          <Activity className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-slate-200">MCP Protocol & Trace Telemetry</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
          Select a registered tool and click <span className="text-cyan-300 font-medium">Execute Tool</span> or choose a preset scenario to inspect the live JSON-RPC 2.0 transaction and Apigee policy execution.
        </p>
      </div>
    );
  }

  const isSuccess = telemetry.status >= 200 && telemetry.status < 300;
  const isRateLimited = telemetry.status === 429;

  const handleCopy = (content: any) => {
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Header Banner */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-3 h-3 rounded-full ${
              isSuccess ? 'bg-emerald-400 animate-pulse' : isRateLimited ? 'bg-amber-400' : 'bg-red-500'
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-100 font-mono">
                {telemetry.method}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono border ${
                  isSuccess
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-500/30'
                    : isRateLimited
                    ? 'bg-amber-950 text-amber-300 border-amber-500/30'
                    : 'bg-red-950 text-red-300 border-red-500/30'
                }`}
              >
                {telemetry.status} {telemetry.statusText}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono truncate max-w-sm mt-0.5">
              {telemetry.endpointUrl}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/80 rounded-lg border border-slate-700 text-xs font-mono text-slate-300">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>{telemetry.latencyMs} ms</span>
          </div>
        </div>
      </div>

      {/* Apigee Policy Execution Trace Ribbon */}
      <div className="px-4 py-3 bg-slate-950/40 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {/* PP-MCP Policy */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/90 border border-slate-800">
          <Code2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 font-mono">PP-MCP (Parser)</div>
            <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Parsed MCP
            </div>
          </div>
        </div>

        {/* VA-VerifyAPIKey */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/90 border border-slate-800">
          <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 font-mono">VA-VerifyAPIKey</div>
            <div className="text-xs font-semibold flex items-center gap-1">
              {telemetry.policyTrace.vaVerifyApiKey ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Valid Key
                </span>
              ) : (
                <span className="text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Rejected
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Q-Limit Policy */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/90 border border-slate-800">
          <Shield className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 font-mono">Q-Limit (Quota)</div>
            <div className="text-xs font-semibold flex items-center gap-1">
              {telemetry.policyTrace.qLimit ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Allowed
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Quota Exceeded
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ML-CloudLogging */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/90 border border-slate-800">
          <Database className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 font-mono">ML-CloudLogging</div>
            <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Audit Logged
            </div>
          </div>
        </div>
      </div>

      {/* Identity & Trace Context Strip */}
      <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-300">
            <User className="w-3 h-3 text-emerald-400" />
            <span>Caller:</span>
            <span className="font-mono text-white font-medium">
              {telemetry.userEmail || telemetry.ssoUser?.email || 'Authenticated SSO'}
            </span>
          </div>
          {telemetry.activeUser && (
            <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 font-medium text-[10px] border border-amber-500/30">
              {telemetry.activeUser.replace('_', ' ').toUpperCase()}
            </span>
          )}
        </div>

        {telemetry.headersReceived['x-request-id'] && (
          <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
            <span>Request ID:</span>
            <span className="text-slate-200">{telemetry.headersReceived['x-request-id']}</span>
          </div>
        )}
      </div>

      {/* Tab Switcher for Details */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-slate-800 bg-slate-950/30">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('response')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'response'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            JSON-RPC Response
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('request')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'request'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            JSON-RPC Request
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('headers')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'headers'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Headers & Trace
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            const content =
              activeTab === 'response'
                ? telemetry.rawResponse
                : activeTab === 'request'
                ? telemetry.rawRequest
                : telemetry.headersReceived;
            handleCopy(content);
          }}
          className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition cursor-pointer"
          title="Copy payload"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* Tab Content Display */}
      <div className="flex-1 p-4 overflow-auto font-mono text-xs text-slate-200 leading-relaxed">
        {activeTab === 'response' && (
          <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 overflow-x-auto selection:bg-cyan-900">
            {JSON.stringify(telemetry.rawResponse, null, 2)}
          </pre>
        )}

        {activeTab === 'request' && (
          <div className="space-y-3">
            <div className="text-[11px] text-slate-400 font-sans">
              Payload posted to <code className="font-mono text-cyan-400">{telemetry.endpointUrl}</code>:
            </div>
            <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 overflow-x-auto selection:bg-cyan-900">
              {JSON.stringify(telemetry.rawRequest, null, 2)}
            </pre>
          </div>
        )}

        {activeTab === 'headers' && (
          <div className="space-y-4">
            <div>
              <div className="text-xs font-bold text-slate-400 mb-2 font-sans uppercase tracking-wider">
                Headers Received from Apigee
              </div>
              <div className="bg-slate-950 rounded-xl border border-slate-800 divide-y divide-slate-850 p-2">
                {Object.entries(telemetry.headersReceived).map(([k, v]) => (
                  <div key={k} className="py-1.5 px-2 flex items-baseline justify-between gap-4">
                    <span className="text-cyan-400 font-semibold">{k}:</span>
                    <span className="text-slate-300 text-right truncate max-w-md">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-400 mb-2 font-sans uppercase tracking-wider">
                Headers Sent by Client
              </div>
              <div className="bg-slate-950 rounded-xl border border-slate-800 divide-y divide-slate-850 p-2">
                {Object.entries(telemetry.headersSent).map(([k, v]) => (
                  <div key={k} className="py-1.5 px-2 flex items-baseline justify-between gap-4">
                    <span className="text-slate-400 font-semibold">{k}:</span>
                    <span className="text-slate-200 text-right truncate max-w-md">
                      {k.toLowerCase() === 'x-apikey' ? `${v.slice(0, 8)}...${v.slice(-4)}` : v}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
