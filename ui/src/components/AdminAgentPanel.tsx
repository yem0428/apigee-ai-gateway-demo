import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  PanelRight,
  Wrench,
  Undo2,
  Rocket,
  FlaskConical,
  Send,
  Loader2,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,

  GripVertical,
  Check,
  X,
} from 'lucide-react';
import {
  AGENT_MODEL,
  fetchSandbox,
  provisionSandbox,
  promoteChange,
  revertChange,
  sendChat,
  type AdminAgentEvent,
  type Change,
  type ChatTurn,
  type ChatUsage,
  type SandboxState,
  type TestResult,
} from '../services/adminAgent';

/**
 * A single row in the transcript. The agent's writes are auto-applied by the
 * backend, so a `change` entry is a *notification with an undo*, never an
 * approval prompt - the card says so in as many words.
 */
type Entry =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; usage?: ChatUsage }
  | { kind: 'tool'; id: string; name: string; summary: string; ok: boolean }
  | { kind: 'change'; id: string; change: Change }
  | { kind: 'test'; id: string; result: TestResult }
  /*
    `blocked` is a governed refusal from Model Armor, not a broken request, and is
    styled amber rather than rose to say so.
  */
  | { kind: 'error'; id: string; text: string; tone: 'failed' | 'blocked'; retry?: string };

const MIN_WIDTH = 340;
const MAX_WIDTH = 560;
const DEFAULT_WIDTH = 400;

/*
  Avoid the literal token "guardrail": Model Armor matches it as prompt injection
  at the perimeter and rejects the turn with a 400 every single time, so a chip
  using that word would fail on first click. "Security controls" asks the same
  question and is verified to return the full control list.
*/
const SUGGESTIONS = [
  'Which security controls are enforced on the AI proxy?',
  'Double the Standard tier token quota',
  'Test a coding prompt on dev',
];

let entrySeq = 0;
const nextId = () => `e${++entrySeq}`;

/**
 * A perimeter refusal reads as a failure unless we say otherwise, so these are
 * pulled out of the rose error styling and shown as a governed block.
 */
const isModelArmorBlock = (message: string) =>
  /model\s*armor|pimatchesfound/i.test(message);

const money = (n: number) => `$${(Number.isFinite(n) ? n : 0).toFixed(6)}`;

/** A small bordered chip. The default palette is deliberately quiet. */
const Chip: React.FC<{ label: string; value: string; tone?: string }> = ({
  label,
  value,
  tone = 'border-slate-200 bg-slate-50 text-slate-700',
}) => (
  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${tone}`}>
    <span className="text-slate-500 font-medium">{label}</span> {value}
  </span>
);

const ToolChip: React.FC<{ name: string; summary: string; ok: boolean }> = ({
  name,
  summary,
  ok,
}) => (
  <div
    data-agent-tool
    className="flex items-center gap-1.5 text-[11px] text-slate-600 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50/80"
  >
    <Wrench className="w-3 h-3 text-slate-400 shrink-0" />
    <span className="font-mono font-semibold text-slate-800 shrink-0">{name}</span>
    <span className="truncate">{summary}</span>
    {ok ? (
      <Check className="w-3 h-3 text-emerald-600 shrink-0 ml-auto" />
    ) : (
      <X className="w-3 h-3 text-rose-600 shrink-0 ml-auto" />
    )}
  </div>
);

const STATUS_TONE: Record<Change['status'], string> = {
  applied: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  reverted: 'border-slate-200 bg-slate-100 text-slate-600',
  promoted: 'border-blue-200 bg-blue-50 text-blue-700',
};

const STATUS_LABEL: Record<Change['status'], string> = {
  applied: 'Applied to dev sandbox',
  reverted: 'Reverted',
  promoted: 'Promoted to prod',
};

const ChangeCard: React.FC<{
  change: Change;
  onRevert: (id: string) => Promise<void>;
  onPromote: (id: string) => Promise<void>;
}> = ({ change, onRevert, onPromote }) => {
  const [busy, setBusy] = useState<'revert' | 'promote' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'revert' | 'promote', fn: (id: string) => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn(change.changeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      data-agent-change
      className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden"
    >
      <div className="px-2.5 py-2 border-b border-slate-100">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${
              STATUS_TONE[change.status]
            }`}
          >
            {STATUS_LABEL[change.status]}
          </span>
          <span className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600">
            {change.env}
          </span>
          <span className="text-[10px] font-mono text-slate-400 ml-auto">
            {change.changeId}
          </span>
        </div>
        <p className="text-[11px] text-slate-700 leading-snug mt-1.5 font-semibold">
          {change.summary}
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          <span className="font-mono text-slate-600">{change.productName}</span>
          {change.sourceProduct ? (
            <> · clone of <span className="font-mono text-slate-600">{change.sourceProduct}</span></>
          ) : null}
        </p>
      </div>

      {change.diff?.length ? (
        <div className="px-2.5 py-2 bg-slate-50/60 border-b border-slate-100 overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="font-semibold pb-1 pr-2">What changed</th>
                <th className="font-semibold pb-1 pr-2">Before</th>
                <th className="font-semibold pb-1">After</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {change.diff.map((row) => (
                <tr key={row.path} className="border-t border-slate-200/70">
                  {/* Plain label by default; the exact config path is still one
                      hover away rather than being dropped on the reader. */}
                  <td
                    className="py-1 pr-2 font-semibold text-slate-800"
                    title={row.path}
                  >
                    {row.label || row.path}
                  </td>
                  <td className="py-1 pr-2 font-mono text-slate-400 line-through">
                    {row.before ?? '—'}
                  </td>
                  <td className="py-1 font-mono font-semibold text-emerald-700">
                    {row.after ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {error && (
        <div className="px-2.5 py-1.5 bg-rose-50 border-b border-rose-100 text-[10px] text-rose-700 font-medium">
          {error}
        </div>
      )}

      <div className="px-2.5 py-1.5 flex items-center gap-1.5">
        <button
          type="button"
          data-agent-revert
          disabled={busy !== null || change.status === 'reverted'}
          onClick={() => run('revert', onRevert)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy === 'revert' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Undo2 className="w-3 h-3" />
          )}
          Revert
        </button>
        <button
          type="button"
          data-agent-promote
          disabled={busy !== null || change.status !== 'applied'}
          onClick={() => run('promote', onPromote)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 border border-blue-600 text-[11px] font-semibold text-white hover:bg-blue-500 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy === 'promote' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Rocket className="w-3 h-3" />
          )}
          Promote to Prod
        </button>
        <span className="ml-auto text-[10px] text-slate-400">
          {change.appliedAt ? new Date(change.appliedAt).toLocaleTimeString() : ''}
        </span>
      </div>
    </div>
  );
};

const TestCard: React.FC<{ result: TestResult }> = ({ result }) => {
  const blocked = result.guardrailBlocked;
  const tone = blocked
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : result.ok
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-rose-200 bg-rose-50 text-rose-700';

  return (
    <div
      data-agent-test
      className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden"
    >
      <div className="px-2.5 py-2 border-b border-slate-100">
        <div className="flex items-center gap-1.5 mb-1.5">
          <FlaskConical className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-bold text-slate-900">Dev gateway test</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${tone}`}>
            {blocked ? 'Guardrail blocked' : `HTTP ${result.httpStatus}`}
          </span>
          <Chip label="model" value={result.model || '—'} />
          <Chip label="tokens" value={String(result.totalTokens ?? 0)} />
          <Chip label="cost" value={money(result.costUsd)} />
          <Chip label="cache" value={result.cacheStatus || '—'} />
          <Chip label="latency" value={`${Math.round(result.latencyMs ?? 0)}ms`} />
        </div>
      </div>
      <p className="px-2.5 py-2 text-[11px] text-slate-700 leading-snug whitespace-pre-wrap">
        {result.text}
      </p>
    </div>
  );
};

interface AdminAgentPanelProps {
  /** Rendered only beside the Admin Console; the caller owns that decision. */
  className?: string;
}

export const AdminAgentPanel: React.FC<AdminAgentPanelProps> = ({ className = '' }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  /*
    The model that actually served the last turn. The backend can fall back off
    the configured model if the Enterprise entitlement fails, so the header chip
    reports what ran rather than what we asked for.
  */
  const [servedModel, setServedModel] = useState<string | null>(null);

  const [sandbox, setSandbox] = useState<SandboxState | null>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  /*
    Starts busy: the first read is kicked off on mount, and defaulting to idle made
    the first paint claim "not provisioned" for a frame before the request answered.
  */
  const [sandboxBusy, setSandboxBusy] = useState(true);
  const [sandboxChecked, setSandboxChecked] = useState(false);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const push = useCallback((...items: Entry[]) => {
    setEntries((prev) => [...prev, ...items]);
  }, []);

  /* ---------------------------------------------------------------- sandbox */

  const loadSandbox = useCallback(async () => {
    setSandboxBusy(true);
    try {
      const state = await fetchSandbox();
      setSandbox(state);
      setSandboxError(null);
    } catch (err) {
      setSandbox(null);
      setSandboxError(err instanceof Error ? err.message : String(err));
    } finally {
      setSandboxChecked(true);
      setSandboxBusy(false);
    }

  }, []);

  useEffect(() => {
    void loadSandbox();
  }, [loadSandbox]);

  const handleProvision = async () => {
    setSandboxBusy(true);
    try {
      const state = await provisionSandbox();
      setSandbox(state);
      setSandboxError(null);
      push({
        kind: 'assistant',
        id: nextId(),
        text: 'Dev sandbox ready. Product clones and the agent app are provisioned; every write I make lands on the (Dev) products only.',
      });
    } catch (err) {
      setSandboxError(err instanceof Error ? err.message : String(err));
    } finally {
      setSandboxBusy(false);
    }
  };

  /* ------------------------------------------------------------------ chat */

  /** `prompt` is threaded through so a blocked turn can be put back in the composer. */
  const applyEvents = (events: AdminAgentEvent[] | undefined, prompt: string) => {

    if (!Array.isArray(events)) return;
    for (const event of events) {
      if (event.type === 'tool_call') {
        push({
          kind: 'tool',
          id: nextId(),
          name: event.name,
          summary: event.summary,
          ok: event.ok,
        });
      } else if (event.type === 'change') {
        push({ kind: 'change', id: nextId(), change: event.change });
      } else if (event.type === 'test') {
        push({ kind: 'test', id: nextId(), result: event.result });
      } else if (event.type === 'error') {
        push({
          kind: 'error',
          id: nextId(),
          text: event.message,
          tone: isModelArmorBlock(event.message) ? 'blocked' : 'failed',
          retry: prompt,
        });
      }

    }
  };

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;

    const history: ChatTurn[] = entries
      .filter((e): e is Extract<Entry, { kind: 'user' | 'assistant' }> =>
        e.kind === 'user' || e.kind === 'assistant'
      )
      .map((e) => ({ role: e.kind === 'user' ? 'user' : 'assistant', content: e.text }));

    push({ kind: 'user', id: nextId(), text: prompt });
    setInput('');
    setBusy(true);

    try {
      const res = await sendChat([...history, { role: 'user', content: prompt }]);
      if (res.usage?.model) setServedModel(res.usage.model);
      applyEvents(res.events, prompt);
      if (res.reply) {
        push({ kind: 'assistant', id: nextId(), text: res.reply, usage: res.usage });
      }
    } catch (err) {
      // The panel must never go blank on a bad response: the failure becomes a
      // first-class, retryable card in the transcript. A perimeter block can also
      // surface here as a 4xx, so it is classified the same way as an error event.
      const message = err instanceof Error ? err.message : String(err);
      const blocked = isModelArmorBlock(message);
      push({
        kind: 'error',
        id: nextId(),
        text: message,
        tone: blocked ? 'blocked' : 'failed',
        retry: prompt,
      });

    } finally {
      setBusy(false);
    }
  };

  const mutateChange = (updated: Change) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.kind === 'change' && e.change.changeId === updated.changeId
          ? { ...e, change: updated }
          : e
      )
    );
  };

  const handleRevert = async (changeId: string) => {
    const res = await revertChange(changeId);
    mutateChange(res.change);
  };

  const handlePromote = async (changeId: string) => {
    const res = await promoteChange(changeId);
    mutateChange(res.change);
  };

  /* ---------------------------------------------------------------- resize */

  /*
    The listeners are bound synchronously inside the mousedown rather than from an
    effect: an effect only runs after React commits, which is late enough that a
    quick drag loses its first few mousemoves.
  */
  const endDragRef = useRef<(() => void) | null>(null);

  useEffect(() => () => endDragRef.current?.(), []);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const onMove = (ev: MouseEvent) => {
      const next = startWidth + (startX - ev.clientX);
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.removeProperty('user-select');
      endDragRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    endDragRef.current = onUp;
    document.body.style.setProperty('user-select', 'none');
  };

  const nudge = (delta: number) =>
    setWidth((w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w + delta)));

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: 'end' });
  }, [entries.length, busy]);

  /* ------------------------------------------------------------- collapsed */

  if (collapsed) {
    return (
      <aside
        data-agent-panel
        data-agent-collapsed="true"
        className={`h-full w-11 shrink-0 border-l border-slate-200 bg-white flex flex-col items-center py-2.5 gap-2 ${className}`}
      >
        <button
          type="button"
          data-agent-toggle
          onClick={() => setCollapsed(false)}
          title="Expand Admin Agent"
          className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 hover:bg-blue-100 transition cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
        <div
          className="text-[10px] font-semibold text-slate-500 tracking-wide"
          style={{ writingMode: 'vertical-rl' }}
        >
          Admin Agent
        </div>
        {entries.length > 0 && (
          <span className="mt-auto text-[10px] font-semibold text-slate-400">
            {entries.length}
          </span>
        )}
      </aside>
    );
  }

  /* -------------------------------------------------------------- expanded */

  /*
    Four states, not two: the slow first read deserves its own, and an unreachable
    endpoint is different from a sandbox that simply has not been created.
  */
  const sandboxState: 'checking' | 'error' | 'ready' | 'unprovisioned' = !sandboxChecked
    ? 'checking'
    : sandboxError
      ? 'error'
      : sandbox?.provisioned
        ? 'ready'
        : 'unprovisioned';

  return (
    <aside
      data-agent-panel
      data-agent-collapsed="false"
      data-agent-width={width}
      style={{ width }}
      className={`relative h-full shrink-0 border-l border-slate-200 bg-white flex flex-col min-h-0 ${className}`}
    >
      {/* Drag handle. Arrow keys work too, so the width is reachable without a mouse. */}
      <div
        data-agent-resize
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        onMouseDown={startDrag}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') nudge(20);
          if (e.key === 'ArrowRight') nudge(-20);
        }}
        title="Drag to resize"
        className="absolute left-0 top-0 h-full w-1.5 -ml-0.5 cursor-col-resize group z-10 flex items-center justify-center hover:bg-blue-100/70 focus:bg-blue-100 focus:outline-none"
      >
        <GripVertical className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition" />
      </div>

      {/* Header */}
      <div className="px-3 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-xs font-bold text-slate-900">Admin Agent</div>
            <div className="text-[10px] text-slate-500">
              Changes auto-apply to the dev sandbox
            </div>
          </div>
          <button
            type="button"
            data-agent-toggle
            onClick={() => setCollapsed(true)}
            title="Collapse Admin Agent"
            className="ml-auto p-1 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:border-slate-300 transition cursor-pointer"
          >
            <PanelRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <span
            data-agent-model
            className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-mono font-semibold text-slate-600"
          >
            {servedModel ?? AGENT_MODEL} · via AI Gateway
          </span>
          {servedModel && servedModel !== AGENT_MODEL && (
            <span
              className="px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-[10px] font-semibold text-amber-800"
              title={`Configured for ${AGENT_MODEL}; the last turn was served by ${servedModel}.`}
            >
              fallback
            </span>
          )}
        </div>

        {/*
          Dev sandbox status. The initial read is slow (four Apigee product reads
          plus the app), so "checking" is a real state with its own spinner rather
          than a gap that briefly renders as "not provisioned".
        */}
        <div
          className="mt-2 flex items-center gap-1.5 flex-wrap"
          data-agent-sandbox
          data-agent-sandbox-state={sandboxState}
        >
          {sandboxState === 'checking' ? (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600">
              <Loader2 className="w-3 h-3 animate-spin" />
              Checking dev sandbox…
            </span>
          ) : sandboxState === 'error' ? (
            <>
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-rose-200 bg-rose-50 text-[10px] font-semibold text-rose-700">
                <AlertCircle className="w-3 h-3" />
                Sandbox status unavailable
              </span>
              <button
                type="button"
                data-agent-sandbox-retry
                onClick={() => void loadSandbox()}
                disabled={sandboxBusy}
                className="px-1.5 py-0.5 rounded border border-slate-200 bg-white text-[10px] font-semibold text-slate-600 hover:border-slate-300 transition cursor-pointer disabled:opacity-50"
              >
                Retry
              </button>
              <span className="w-full text-[10px] text-rose-600/90 leading-snug">
                {sandboxError}
              </span>
            </>
          ) : sandboxState === 'ready' ? (
            <>
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700">
                <ShieldCheck className="w-3 h-3" />
                Dev sandbox ready
              </span>
              {sandbox?.products?.length ? (
                <span className="text-[10px] text-slate-500">
                  {sandbox.products.filter((p) => p.exists).length} dev product
                  {sandbox.products.filter((p) => p.exists).length === 1 ? '' : 's'}
                  {sandbox.keyPresent ? ' · key held server-side' : ''}
                </span>
              ) : null}
            </>
          ) : (
            <>
              <span className="px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-[10px] font-semibold text-amber-800">
                Dev sandbox not provisioned
              </span>
              <button
                type="button"
                data-agent-provision
                onClick={() => void handleProvision()}
                disabled={sandboxBusy}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-blue-600 bg-blue-600 text-[10px] font-semibold text-white hover:bg-blue-500 transition cursor-pointer disabled:opacity-50"
              >
                {sandboxBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                Provision dev sandbox
              </button>
            </>
          )}
        </div>

      </div>

      {/* Transcript */}
      <div
        data-agent-messages
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 space-y-2 bg-slate-50/50"
      >
        {entries.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-[11px] text-slate-600 leading-snug">
            <p className="font-semibold text-slate-800 mb-1">
              Ask for a change and I&apos;ll make it on the dev sandbox.
            </p>
            <p>
              I can read the API products, guardrails and rate card, edit the{' '}
              <span className="font-mono text-slate-700">(Dev)</span> product clones, and
              run a real metered call against the dev gateway. Every edit lands
              immediately and arrives here with a diff and a Revert button — nothing
              touches a live tier until you press Promote.
            </p>
          </div>
        )}

        {entries.map((entry) => {
          if (entry.kind === 'user') {
            return (
              <div key={entry.id} className="flex justify-end">
                <div className="max-w-[88%] rounded-xl bg-blue-600 text-white px-2.5 py-1.5 text-[11px] leading-snug whitespace-pre-wrap">
                  {entry.text}
                </div>
              </div>
            );
          }
          if (entry.kind === 'assistant') {
            return (
              <div
                key={entry.id}
                className="rounded-xl border border-slate-200 bg-white shadow-2xs px-2.5 py-2"
              >
                {/* Deliberately no per-turn usage chips. This panel showcases how
                    easy a governance change is; the agent's own token/cost
                    telemetry is noise here. It is still metered and visible on
                    the Analytics & Cost tab like any other caller, and the
                    header chip still names the model that served the turn. */}
                <p className="text-[11px] text-slate-700 leading-snug whitespace-pre-wrap">
                  {entry.text}
                </p>
              </div>
            );
          }
          if (entry.kind === 'tool') {
            return (
              <ToolChip
                key={entry.id}
                name={entry.name}
                summary={entry.summary}
                ok={entry.ok}
              />
            );
          }
          if (entry.kind === 'change') {
            return (
              <ChangeCard
                key={entry.id}
                change={entry.change}
                onRevert={handleRevert}
                onPromote={handlePromote}
              />
            );
          }
          if (entry.kind === 'test') {
            return <TestCard key={entry.id} result={entry.result} />;
          }
          const isBlock = entry.tone === 'blocked';
          return (
            <div
              key={entry.id}
              data-agent-error
              data-agent-error-tone={entry.tone}
              className={`rounded-xl border px-2.5 py-2 ${
                isBlock ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {isBlock ? (
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                )}
                <span
                  className={`text-[11px] font-bold ${
                    isBlock ? 'text-amber-900' : 'text-rose-800'
                  }`}
                >
                  {isBlock ? 'Blocked by Model Armor' : 'Agent request failed'}
                </span>
                {isBlock && (
                  <span className="px-1.5 py-0.5 rounded border border-amber-300 bg-white text-[10px] font-semibold text-amber-800">
                    governed
                  </span>
                )}
              </div>
              {/*
                The backend's message carries a suggested rephrasing, so it is shown
                verbatim - no truncation, no clamping.
              */}
              <p
                className={`text-[10px] leading-snug mt-1 break-words whitespace-pre-wrap ${
                  isBlock ? 'text-amber-900/90' : 'text-rose-700'
                }`}
              >
                {entry.text}
              </p>
              {isBlock ? (
                entry.retry && (
                  <button
                    type="button"
                    data-agent-rephrase
                    onClick={() => {
                      setInput(entry.retry as string);
                      inputRef.current?.focus();
                    }}
                    className="mt-1.5 px-2 py-0.5 rounded border border-amber-300 bg-white text-[10px] font-semibold text-amber-800 hover:border-amber-400 transition cursor-pointer"
                  >
                    Rephrase
                  </button>
                )
              ) : (
                entry.retry && (
                  <button
                    type="button"
                    data-agent-retry
                    disabled={busy}
                    onClick={() => void send(entry.retry as string)}
                    className="mt-1.5 px-2 py-0.5 rounded border border-rose-300 bg-white text-[10px] font-semibold text-rose-700 hover:border-rose-400 transition cursor-pointer disabled:opacity-50"
                  >
                    Retry
                  </button>
                )
              )}
            </div>
          );

        })}

        {busy && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 px-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Working…
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      {/* Composer */}
      {/*
        `pb-14` clears the app's fixed bottom-right "Guide me" / settings pill, which
        floats over exactly this corner of the viewport.
      */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2.5 pb-14">
        <div className="flex items-center gap-1 flex-wrap mb-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              data-agent-suggestion
              onClick={() => {
                setInput(s);
                inputRef.current?.focus();
              }}
              className="px-1.5 py-0.5 rounded-md border border-slate-200 bg-white text-[10px] font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700 transition cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 focus-within:border-blue-300 transition">
          <textarea
            ref={inputRef}
            data-agent-input
            value={input}
            rows={2}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask the agent to inspect or change a tier…"
            className="flex-1 bg-transparent text-[11px] text-slate-800 resize-none focus:outline-none placeholder:text-slate-400 leading-snug"
          />
          <button
            type="button"
            data-agent-send
            onClick={() => void send(input)}
            disabled={busy || !input.trim()}
            className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title="Send"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
};
