// Typed client for the Admin Agent endpoints served by `ui/server.js`.
//
// Every call is relative: the sandbox consumer key, the admin identity token and
// the gateway host all stay server-side, so nothing here embeds a credential.
//
// Shapes are frozen by `admin_agent_contract.md`. The backend is built in
// parallel against the same contract, so each helper tolerates a missing or
// half-written endpoint by throwing an `AdminAgentError` the panel can render
// inline instead of blanking out.

/** A single tool invocation the model made, surfaced as a one-line chip. */
export interface ToolCallEvent {
  type: 'tool_call';
  name: string;
  summary: string;
  ok: boolean;
}

export interface ChangeEvent {
  type: 'change';
  change: Change;
}

export interface TestEvent {
  type: 'test';
  result: TestResult;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type AdminAgentEvent = ToolCallEvent | ChangeEvent | TestEvent | ErrorEvent;

/** One auto-applied write against a `(Dev)` product, with its undo handle. */
export interface Change {
  changeId: string;
  productName: string;
  sourceProduct: string;
  env: 'dev';
  summary: string;
  /** `label` is the human-readable form; `path` is the exact config location. */
  diff: { path: string; label?: string; before: string | null; after: string | null }[];
  appliedAt: string;
  status: 'applied' | 'reverted' | 'promoted';
}

export interface TestResult {
  httpStatus: number;
  ok: boolean;
  model: string;
  latencyMs: number;
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  costUsd: number;
  cacheStatus: string;
  guardrailBlocked: boolean;
  text: string;
  headers: Record<string, string>;
}

export interface SandboxProduct {
  name: string;
  exists: boolean;
  environments?: string[];
}

export interface SandboxState {
  status: string;
  provisioned: boolean;
  products: SandboxProduct[];
  app?: { name: string; exists: boolean };
  keyPresent: boolean;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatUsage {
  model: string;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface ChatResponse {
  status: string;
  reply: string;
  events: AdminAgentEvent[];
  usage?: ChatUsage;
}

/**
 * Carries the HTTP status alongside the message so the panel can distinguish
 * "the backend is not deployed yet" (404) from "the model turn failed" (5xx).
 */
export class AdminAgentError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminAgentError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (err) {
    // Network-level failure: the dev server is down or the request was aborted.
    throw new AdminAgentError(
      err instanceof Error ? err.message : 'Network request failed',
      0
    );
  }

  const raw = await response.text();
  let body: any = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const detail =
      (body && (body.error || body.message)) ||
      (raw ? raw.slice(0, 180) : '') ||
      response.statusText;
    throw new AdminAgentError(
      `${detail || 'Request failed'} (${response.status})`,
      response.status
    );
  }

  if (body === null) {
    // `ui/server.js` falls back to index.html for unknown paths, so an API route
    // that answers with HTML is a route that has not been deployed yet.
    throw new AdminAgentError(
      `Endpoint ${path} is not available yet (the server returned a non-JSON body)`,
      response.status
    );
  }

  return body as T;
}

function jsonPost(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

/** GET /api/admin-agent/sandbox */
export function fetchSandbox(): Promise<SandboxState> {
  return request<SandboxState>('/api/admin-agent/sandbox');
}

/** POST /api/admin-agent/sandbox/provision */
export function provisionSandbox(): Promise<SandboxState> {
  return request<SandboxState>('/api/admin-agent/sandbox/provision', jsonPost({}));
}

/** POST /api/admin-agent/chat */
export function sendChat(messages: ChatTurn[]): Promise<ChatResponse> {
  return request<ChatResponse>('/api/admin-agent/chat', jsonPost({ messages }));
}

/** GET /api/admin-agent/changes */
export function fetchChanges(): Promise<{ status: string; changes: Change[] }> {
  return request<{ status: string; changes: Change[] }>('/api/admin-agent/changes');
}

/** POST /api/admin-agent/revert */
export function revertChange(changeId: string): Promise<{ status: string; change: Change }> {
  return request<{ status: string; change: Change }>(
    '/api/admin-agent/revert',
    jsonPost({ changeId })
  );
}

/** POST /api/admin-agent/promote */
export function promoteChange(changeId: string): Promise<{ status: string; change: Change }> {
  return request<{ status: string; change: Change }>(
    '/api/admin-agent/promote',
    jsonPost({ changeId })
  );
}

/** POST /api/admin-agent/test */
export function runDevTest(
  prompt: string,
  model?: string
): Promise<{ status: string; result: TestResult }> {
  return request<{ status: string; result: TestResult }>(
    '/api/admin-agent/test',
    jsonPost(model ? { prompt, model } : { prompt })
  );
}

/**
 * The model the agent is configured to run on.
 *
 * Only a pre-flight default: the backend falls back to `gemini-3-flash-preview`
 * if the Enterprise entitlement fails, and reports whatever actually served the
 * turn in `usage.model`. Prefer that over this constant once a turn has landed.
 */
export const AGENT_MODEL = 'gemini-3.8-flash';

