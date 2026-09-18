import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  ExternalLink,
  ScrollText,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Shuffle,
  Database,
} from 'lucide-react';
import { CallLogEntry, CallLogWindow, fetchCallLogs } from '../services/api';

interface CallLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The ledger row this modal was opened from. */
  userEmail: string;
  model: string;
}

const WINDOW_OPTIONS: { value: CallLogWindow; label: string }[] = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

/** Local time, seconds precision -- these rows are read at demo pace. */
const formatTimestamp = (iso: string | null): string => {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

/**
 * Per-call costs routinely land below a cent, so the shared two-decimal
 * formatter would render most rows as "$0.00". Keep six decimals here.
 */
const formatCallCost = (usd: number): string => {
  if (!usd || usd <= 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  return `$${usd.toFixed(4)}`;
};

const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}...` : text;

const StatusPill: React.FC<{ status: number; faultName: string }> = ({ status, faultName }) => {
  const ok = status >= 200 && status < 300;
  // A policy fault is a deliberate block, not a server failure -- colour it
  // amber even when the status code could not be resolved from the log entry.
  const clientBlocked = (status >= 400 && status < 500) || (!ok && !!faultName);
  const cls = ok
    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
    : clientBlocked
    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
    : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
  return (
    <span
      className={`inline-block text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${cls}`}
      title={faultName || undefined}
    >
      {status || (faultName ? 'BLOCKED' : '--')}
    </span>
  );
};

export const CallLogsModal: React.FC<CallLogsModalProps> = ({
  isOpen,
  onClose,
  userEmail,
  model,
}) => {
  const [logWindow, setLogWindow] = useState<CallLogWindow>('7d');
  const [entries, setEntries] = useState<CallLogEntry[]>([]);
  const [consoleUrl, setConsoleUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userEmail || !model) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchCallLogs(userEmail, model, logWindow);
      setEntries(data.entries || []);
      setConsoleUrl(data.consoleUrl || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [userEmail, model, logWindow]);

  useEffect(() => {
    if (isOpen) {
      setExpanded(null);
      load();
    }
  }, [isOpen, load]);

  // Escape-to-close, matching the other modals in the app.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-7xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 shrink-0">
          <div className="flex items-start gap-2.5">
            <ScrollText className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Full Audit Logs</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Every governed call for{' '}
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                  {userEmail}
                </span>{' '}
                on{' '}
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                  {model}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close audit logs"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs shadow-xs">
              <span className="text-slate-500 dark:text-slate-400 mr-1.5 text-[11px]">Window:</span>
              <select
                value={logWindow}
                onChange={(e) => setLogWindow(e.target.value as CallLogWindow)}
                className="bg-transparent text-slate-800 dark:text-slate-200 text-xs font-mono focus:outline-none cursor-pointer"
              >
                {WINDOW_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {!loading && !error && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {entries.length} call{entries.length === 1 ? '' : 's'}
                {entries.length === 100 ? ' (most recent 100)' : ''}
              </span>
            )}
          </div>

          {consoleUrl && (
            <a
              href={consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Open in Cloud Logging
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Body */}
        <div className="overflow-auto grow">
          {error ? (
            <div className="m-6 flex items-start gap-2.5 p-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                  Could not load audit logs
                </p>
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 font-mono">{error}</p>
              </div>
            </div>
          ) : loading ? (
            <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading audit logs...
            </p>
          ) : entries.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
              No calls recorded for this user and model in the selected window.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900">
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                  <th className="py-2.5 pl-6 pr-2 w-8" />
                  <th className="py-2.5 pr-3 whitespace-nowrap">Timestamp</th>
                  <th className="py-2.5 pr-3">Status</th>
                  <th className="py-2.5 pr-3">Request</th>
                  <th className="py-2.5 pr-3">Response</th>
                  <th className="py-2.5 pr-3 text-right whitespace-nowrap">Tokens (in/out)</th>
                  <th className="py-2.5 pr-3 text-right">Cost</th>
                  <th className="py-2.5 pr-6 text-center whitespace-nowrap">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {entries.map((entry, idx) => {
                  const rowKey = entry.trackingId || `${entry.timestamp}__${idx}`;
                  const isExpanded = expanded === rowKey;
                  const blocked = entry.status >= 400 || !!entry.faultName;
                  return (
                    <React.Fragment key={rowKey}>
                      <tr
                        onClick={() => setExpanded(isExpanded ? null : rowKey)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer"
                      >
                        <td className="py-2.5 pl-6 pr-2 align-top text-slate-400">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </td>
                        <td className="py-2.5 pr-3 align-top font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {formatTimestamp(entry.timestamp)}
                        </td>
                        <td className="py-2.5 pr-3 align-top">
                          <StatusPill status={entry.status} faultName={entry.faultName} />
                        </td>
                        <td className="py-2.5 pr-3 align-top text-slate-700 dark:text-slate-300 max-w-xs">
                          {entry.prompt ? (
                            truncate(entry.prompt, 70)
                          ) : (
                            <span className="text-slate-400 dark:text-slate-600 italic">
                              not captured
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 align-top text-slate-700 dark:text-slate-300 max-w-xs">
                          {entry.response ? (
                            truncate(entry.response, 70)
                          ) : blocked ? (
                            <span className="text-amber-600 dark:text-amber-400 text-[11px]">
                              {truncate(entry.errorMessage || entry.faultName || 'Blocked', 70)}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-600 italic">
                              not captured
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 align-top text-right font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {entry.promptTokens.toLocaleString()} /{' '}
                          {entry.candidatesTokens.toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-3 align-top text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {formatCallCost(entry.costUsd)}
                        </td>
                        <td className="py-2.5 pr-6 align-top">
                          <div className="flex items-center justify-center gap-1">
                            {entry.autoRouted && (
                              <span
                                title="Auto-routed by the gateway"
                                className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                              >
                                <Shuffle className="w-2.5 h-2.5" />
                                Routed
                              </span>
                            )}
                            {entry.cached && (
                              <span
                                title="Served from the semantic cache"
                                className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                              >
                                <Database className="w-2.5 h-2.5" />
                                Cached
                              </span>
                            )}
                            {!entry.autoRouted && !entry.cached && (
                              <span className="text-slate-300 dark:text-slate-700">--</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50 dark:bg-slate-950/40">
                          <td colSpan={8} className="px-6 py-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div>
                                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1">
                                  Full request
                                </p>
                                <pre className="whitespace-pre-wrap break-words text-[11px] font-mono text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 max-h-48 overflow-auto">
                                  {entry.prompt || '(not captured)'}
                                </pre>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1">
                                  Full response
                                </p>
                                <pre className="whitespace-pre-wrap break-words text-[11px] font-mono text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 max-h-48 overflow-auto">
                                  {entry.response || entry.errorMessage || '(not captured)'}
                                </pre>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                              <span>
                                Tracking ID:{' '}
                                <span className="text-slate-700 dark:text-slate-300">
                                  {entry.trackingId || '--'}
                                </span>
                              </span>
                              <span>
                                Provider:{' '}
                                <span className="text-slate-700 dark:text-slate-300">
                                  {entry.provider || '--'}
                                </span>
                              </span>
                              <span>
                                Path:{' '}
                                <span className="text-slate-700 dark:text-slate-300">
                                  {entry.pathSuffix || '--'}
                                </span>
                              </span>
                              <span>
                                Latency:{' '}
                                <span className="text-slate-700 dark:text-slate-300">
                                  {entry.latencyMs === null ? '--' : `${entry.latencyMs} ms`}
                                </span>
                              </span>
                              <span>
                                Total tokens:{' '}
                                <span className="text-slate-700 dark:text-slate-300">
                                  {entry.totalTokens.toLocaleString()}
                                </span>
                              </span>
                              <span>
                                Environment:{' '}
                                <span className="text-slate-700 dark:text-slate-300">
                                  {entry.environment || '--'}
                                </span>
                              </span>
                              {entry.faultName && (
                                <span>
                                  Fault:{' '}
                                  <span className="text-amber-600 dark:text-amber-400">
                                    {entry.faultName}
                                  </span>
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 shrink-0">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Sourced from Cloud Logging. Logging happens after the response is returned and also
            fires on faults, so blocked and failed calls are captured alongside successful ones.
            Click any row for the full request and response.
          </p>
        </div>
      </div>
    </div>
  );
};
