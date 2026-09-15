import React, { useState } from 'react';
import { McpTelemetry } from '../types';
import {
  Activity,
  Clock,
  Code2,
  Copy,
  Check,
  FileJson,
  Send,
  User,
} from 'lucide-react';

interface McpTraceViewerProps {
  telemetry: McpTelemetry | null;
  loading?: boolean;
}

/**
 * High-contrast JSON syntax highlighter for dark terminal/code editor views
 */
const highlightJson = (json: any): string => {
  if (typeof json !== 'string') {
    json = JSON.stringify(json, null, 2);
  }
  if (!json) return '';

  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match: string) => {
      let cls = 'text-amber-400'; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-cyan-400 font-semibold'; // JSON key
        } else {
          cls = 'text-emerald-400'; // string value
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-purple-400 font-bold'; // boolean
      } else if (/null/.test(match)) {
        cls = 'text-rose-400 italic'; // null
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
};

export const McpTraceViewer: React.FC<McpTraceViewerProps> = ({ telemetry, loading }) => {
  const [activeTab, setActiveTab] = useState<'response' | 'request' | 'headers'>(() => {
    if (typeof window !== 'undefined') {
      const sub = new URLSearchParams(window.location.search).get('subtab');
      if (sub === 'headers' || sub === 'request' || sub === 'response') return sub;
    }
    return 'response';
  });
  const [copied, setCopied] = useState(false);

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
        <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-600 dark:border-t-cyan-400 rounded-full animate-spin mb-4" />
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-200">Executing MCP Request</h4>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xs">
          Routing JSON-RPC payload and executing tool...
        </p>
      </div>
    );
  }

  if (!telemetry) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400 mb-4">
          <Activity className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-200">MCP Protocol & Trace Telemetry</h4>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-sm leading-relaxed">
          Select a registered tool and click <span className="text-cyan-600 dark:text-cyan-300 font-medium">Execute Tool</span> or choose a preset scenario to inspect the live JSON-RPC 2.0 transaction.
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
    <div className="h-full flex flex-col bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
      {/* Header Banner */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-3 h-3 rounded-full shrink-0 ${
              isSuccess ? 'bg-emerald-500 animate-pulse' : isRateLimited ? 'bg-amber-500' : 'bg-red-500'
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900 dark:text-slate-100 font-mono">
                {telemetry.method}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono border ${
                  isSuccess
                    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30'
                    : isRateLimited
                    ? 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/30'
                    : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/30'
                }`}
              >
                {telemetry.status} {telemetry.statusText}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-sm mt-0.5">
              {telemetry.endpointUrl}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300 font-medium shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>{telemetry.latencyMs} ms</span>
          </div>
        </div>
      </div>

      {/* Identity & Trace Context Strip */}
      <div className="px-4 py-2 bg-slate-100/70 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-medium">Caller:</span>
            <span className="font-mono text-slate-900 dark:text-slate-100 font-semibold">
              {telemetry.userEmail || telemetry.ssoUser?.email || 'Authenticated SSO'}
            </span>
          </div>
          {telemetry.activeUser && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-semibold text-[10px] border border-amber-300 dark:border-amber-500/30 tracking-wide uppercase">
              {telemetry.activeUser.replace('_', ' ')}
            </span>
          )}
        </div>

        {telemetry.headersReceived['x-request-id'] && (
          <div className="flex items-center gap-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">
            <span>Request ID:</span>
            <span className="text-slate-800 dark:text-slate-200 font-medium">{telemetry.headersReceived['x-request-id']}</span>
          </div>
        )}
      </div>

      {/* Tab Switcher for Details */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/30">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('response')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'response'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            JSON-RPC Response
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('request')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'request'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            JSON-RPC Request
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('headers')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'headers'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700'
            }`}
          >
            Headers
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
                : {
                    headersReceived: telemetry.headersReceived,
                    headersSent: telemetry.headersSent,
                  };
            handleCopy(content);
          }}
          className="flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium transition cursor-pointer shadow-2xs"
          title="Copy payload"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* Tab Content Display */}
      <div className="flex-1 p-3.5 overflow-auto font-mono text-xs leading-relaxed bg-white dark:bg-slate-900">
        {activeTab === 'response' && (
          <pre
            className="code-editor-dark p-3.5 rounded-xl border border-slate-800 overflow-x-auto text-xs leading-relaxed selection:bg-cyan-900 shadow-inner"
            style={{ backgroundColor: '#0f172a', color: '#e2e8f0' }}
            dangerouslySetInnerHTML={{
              __html: highlightJson(telemetry.rawResponse),
            }}
          />
        )}

        {activeTab === 'request' && (
          <div className="space-y-2">
            <div className="text-[11px] text-slate-600 dark:text-slate-400 font-sans">
              Payload posted to <code className="font-mono text-cyan-600 dark:text-cyan-400 font-semibold">{telemetry.endpointUrl}</code>:
            </div>
            <pre
              className="code-editor-dark p-3.5 rounded-xl border border-slate-800 overflow-x-auto text-xs leading-relaxed selection:bg-cyan-900 shadow-inner"
              style={{ backgroundColor: '#0f172a', color: '#e2e8f0' }}
              dangerouslySetInnerHTML={{
                __html: highlightJson(telemetry.rawRequest),
              }}
            />
          </div>
        )}

        {activeTab === 'headers' && (
          <div className="space-y-4">
            {/* Headers Received from Gateway */}
            <div className="bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-2xs">
              <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 font-sans uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                  <span>Headers Received from Gateway</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-medium shadow-2xs">
                  {Object.keys(telemetry.headersReceived).length} headers
                </span>
              </div>
              <div className="divide-y divide-slate-200/80 dark:divide-slate-800/60 font-mono text-xs">
                {Object.entries(telemetry.headersReceived).map(([k, v]) => (
                  <div key={k} className="py-2 px-1 flex items-start justify-between gap-4">
                    <span className="text-cyan-700 dark:text-cyan-400 font-semibold select-all shrink-0">
                      {k}:
                    </span>
                    <span className="text-slate-900 dark:text-slate-100 text-right break-all select-all font-medium bg-white dark:bg-slate-900/90 px-2.5 py-1 rounded-md border border-slate-200/90 dark:border-slate-800 shadow-2xs max-w-lg">
                      {v}
                    </span>
                  </div>
                ))}
                {Object.keys(telemetry.headersReceived).length === 0 && (
                  <div className="py-4 text-center text-slate-500 dark:text-slate-400 text-xs italic font-sans">
                    No headers received in response
                  </div>
                )}
              </div>
            </div>

            {/* Headers Sent by Client */}
            <div className="bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-2xs">
              <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 font-sans uppercase tracking-wider flex items-center gap-2">
                  <Send className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Headers Sent by Client</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-medium shadow-2xs">
                  {Object.keys(telemetry.headersSent).length} headers
                </span>
              </div>
              <div className="divide-y divide-slate-200/80 dark:divide-slate-800/60 font-mono text-xs">
                {Object.entries(telemetry.headersSent).map(([k, v]) => (
                  <div key={k} className="py-2 px-1 flex items-start justify-between gap-4">
                    <span className="text-slate-700 dark:text-slate-300 font-semibold select-all shrink-0">
                      {k}:
                    </span>
                    <span className="text-slate-900 dark:text-slate-100 text-right break-all select-all font-medium bg-white dark:bg-slate-900/90 px-2.5 py-1 rounded-md border border-slate-200/90 dark:border-slate-800 shadow-2xs max-w-lg">
                      {k.toLowerCase() === 'x-apikey' && v && v.length > 12 ? `${v.slice(0, 8)}...${v.slice(-4)}` : v}
                    </span>
                  </div>
                ))}
                {Object.keys(telemetry.headersSent).length === 0 && (
                  <div className="py-4 text-center text-slate-500 dark:text-slate-400 text-xs italic font-sans">
                    No headers sent
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

