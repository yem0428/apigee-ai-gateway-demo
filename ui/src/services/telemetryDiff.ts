import { GatewayTelemetry } from '../types';

/**
 * A single field that differs between two gateway calls.
 *
 * `kind` drives colour only. It is deliberately not a value judgement on `model` or
 * `intent` changes - routing to a more expensive model is not "worse", it is the router
 * doing its job - so those are reported as `neutral`. Only cost and latency, where lower
 * is unambiguously better, get a direction.
 */
export interface TelemetryChange {
  key: 'cache' | 'model' | 'cost' | 'latency' | 'intent' | 'guardrail';
  label: string;
  from: string;
  to: string;
  kind: 'improved' | 'regressed' | 'neutral';
  /** Short supporting figure, e.g. "-62%". Absent when a percentage is meaningless. */
  detail?: string;
  /** Whether this change is worth surfacing as a compact inline hint on the message. */
  headline: boolean;
}

/** What the UI shows when the gateway attributed no model (a semantic cache hit). */
export const NO_MODEL_LABEL = 'Served from cache';

const fmtModel = (t: GatewayTelemetry): string => t.model || NO_MODEL_LABEL;

const fmtCost = (raw?: string): string => {
  const n = Number.parseFloat(raw ?? '');
  return Number.isFinite(n) ? `$${n.toFixed(6)}` : '—';
};

/**
 * Percentage change, guarded against a zero baseline.
 *
 * A miss->hit transition goes from a real cost to exactly $0, and "-100%" is both correct
 * and the single most quotable number in the cache demo. The reverse (0 -> something) is
 * an infinite increase, which has no honest percentage, so it returns undefined and the
 * caller just shows the two values.
 *
 * At and beyond 10x the percentage form stops communicating. Routing a prompt from a
 * flash-lite tier to Opus is a real +2,581,400% on cost, and that is a number nobody can
 * read - so those are rendered as a multiplier instead. Same fact, sayable out loud.
 * A decrease can never reach the threshold: the floor is -100%.
 */
function pctDelta(from: number, to: number): string | undefined {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return undefined;
  if (from === 0) return undefined;
  const pct = ((to - from) / from) * 100;
  if (Math.abs(pct) < 1) return undefined;
  const multiple = to / from;
  if (multiple >= 10) return `${Math.round(multiple)}\u00d7`;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`;
}

/**
 * Compare two gateway calls and return only what actually changed.
 *
 * Ordered by demo value rather than by field order in the type: a cache hit and a model
 * switch are the two things a presenter points at, so they come first.
 *
 * Returns [] when there is no baseline (the first call of a session), which the UI treats
 * as "nothing to compare" rather than "nothing changed".
 */
export function diffTelemetry(
  baseline: GatewayTelemetry | null | undefined,
  current: GatewayTelemetry | null | undefined
): TelemetryChange[] {
  if (!baseline || !current) return [];

  const changes: TelemetryChange[] = [];

  // 1. Cache. The headline of the caching demo.
  if (baseline.cacheStatus !== current.cacheStatus) {
    changes.push({
      key: 'cache',
      label: 'Cache',
      from: baseline.cacheStatus,
      to: current.cacheStatus,
      kind: current.cacheStatus === 'HIT' ? 'improved' : 'neutral',
      headline: true,
    });
  }

  // 2. Model. The headline of the auto-routing demo.
  //
  // Compared through fmtModel so an unattributed cache hit reads as a transition to
  // "Served from cache" rather than as a change to an empty string.
  if (fmtModel(baseline) !== fmtModel(current)) {
    changes.push({
      key: 'model',
      label: 'Model',
      from: fmtModel(baseline),
      to: fmtModel(current),
      kind: 'neutral',
      headline: true,
    });
  }

  // 3. Cost.
  const fromCost = Number.parseFloat(baseline.costUsd ?? '');
  const toCost = Number.parseFloat(current.costUsd ?? '');
  if (Number.isFinite(fromCost) && Number.isFinite(toCost) && fromCost !== toCost) {
    changes.push({
      key: 'cost',
      label: 'Cost',
      from: fmtCost(baseline.costUsd),
      to: fmtCost(current.costUsd),
      kind: toCost < fromCost ? 'improved' : 'regressed',
      detail: pctDelta(fromCost, toCost),
      headline: true,
    });
  }

  // 4. Latency. Noisy by nature, so only reported past a threshold that a viewer could
  // actually perceive - otherwise every single call reports a "change" and the hint band
  // becomes background noise that people stop reading.
  const latencyDelta = current.latencyMs - baseline.latencyMs;
  if (Math.abs(latencyDelta) >= 100) {
    changes.push({
      key: 'latency',
      label: 'Latency',
      from: `${baseline.latencyMs} ms`,
      to: `${current.latencyMs} ms`,
      kind: latencyDelta < 0 ? 'improved' : 'regressed',
      detail: pctDelta(baseline.latencyMs, current.latencyMs),
      headline: true,
    });
  }

  // 5. Intent. Supporting detail for the routing story; the model change above already
  // carries the point, so this is not a headline.
  if ((baseline.intent || '') !== (current.intent || '')) {
    changes.push({
      key: 'intent',
      label: 'Intent',
      from: baseline.intent || '—',
      to: current.intent || '—',
      kind: 'neutral',
      headline: false,
    });
  }

  // 6. Guardrail. Rare, but when it flips to BLOCKED that is the whole point of the call.
  if (baseline.guardrailStatus !== current.guardrailStatus) {
    changes.push({
      key: 'guardrail',
      label: 'Guardrail',
      from: baseline.guardrailStatus,
      to: current.guardrailStatus,
      kind: current.guardrailStatus === 'BLOCKED' ? 'regressed' : 'neutral',
      headline: current.guardrailStatus === 'BLOCKED',
    });
  }

  return changes;
}
