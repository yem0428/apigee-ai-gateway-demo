/**
 * Admin Copilot -- Apigee / AI Gateway I/O and the /api/admin-agent/* routes.
 *
 * All the pure logic lives in adminAgentCore.js. This module is the thin, but
 * carefully defensive, shell around it:
 *
 *  - every outbound call goes through one of two injectable functions
 *    (`apigeeFetch`, `gatewayFetch`) so tests can run without credentials;
 *  - no handler is allowed to throw: the HTTP layer always answers with a
 *    structured JSON body, never a stack trace and never a dead socket;
 *  - the dev sandbox consumer key is held in process memory only and is
 *    scrubbed out of every response body on the way to the browser.
 */
import {
  AI_BASE_DEV,
  AI_BASE_PROD,
  AdminAgentError,
  COPILOT_MODEL,
  COPILOT_FALLBACK_MODEL,
  RATE_LIMIT_UPSTREAM_CAPACITY,
  ChangeStore,
  DEV_PRODUCTS,
  LIVE_PRODUCTS,
  KNOWN_PRODUCTS,
  MAX_TOOL_ITERATIONS,
  ORG,
  SANDBOX_APP_NAME,
  SYSTEM_INSTRUCTION,
  TOOL_LOOP_BUDGET_MS,
  allowedTestModels,
  applyChangeSet,
  assertWritableDevProduct,
  buildDevClone,
  buildFunctionDeclarations,
  classifyRateLimit,
  apigeeProductName,
  devNameFor,
  isDevProductName,
  liveNameFor,
  logicalProductName,
  messagesToContents,
  mintSyntheticIdentityToken,
  newChangeId,
  runToolLoop,
  stripServerFields,
  summarizeDiff,
  toTestResult,
  validateChangeList,
  validateToolArgs,
} from './adminAgentCore.js';
import { listGuardrails } from './guardrailCatalog.js';

const APIGEE_BASE = 'https://apigee.googleapis.com/v1/organizations';
const RATE_KVM = 'ai-model-rates';
const RATE_KVM_ENTRY = 'rate_card';
const COPILOT_TIMEOUT_MS = 25_000;
const DEV_TEST_TIMEOUT_MS = 20_000;
/** Backoff before the single retry of a transient Vertex capacity 429. */
const UPSTREAM_RETRY_DELAY_MS = 1_500;
const MAX_BODY_BYTES = 256 * 1024;

function projectProduct(product, exists, logicalName) {
  const name = logicalName || logicalProductName(product?.name);
  if (!exists || !product) return { name, exists: false };
  return {
    name,
    exists: true,
    displayName: product.displayName || name,
    environments: product.environments || [],
    approvalType: product.approvalType || '',
    attributes: (product.attributes || []).map((a) => ({ name: a.name, value: String(a.value ?? '') })),
    tokenQuotas: (product.llmOperationGroup?.operationConfigs || []).flatMap((cfg) =>
      (cfg.llmOperations || []).map((op) => ({
        resource: op.resource,
        model: op.model,
        limit: cfg.llmTokenQuota?.limit ?? null,
        interval: cfg.llmTokenQuota?.interval ?? null,
        timeUnit: cfg.llmTokenQuota?.timeUnit ?? null,
      }))
    ),
  };
}

async function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new AdminAgentError('Request body too large.', 'too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', (err) => reject(err));
  });
}

/**
 * Requirement #1: the sandbox consumer key must never reach the browser.
 * Rather than trusting every response shape, the secrets we hold are scrubbed
 * out of the serialized body as a last line of defence.
 */
export function redactSecrets(text, secrets) {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 8) out = out.split(secret).join('[redacted]');
  }
  return out;
}

export function createAdminAgentService({
  getToken,
  provisionAdmin,
  defaultProducts = {},
  fetchImpl = (...args) => globalThis.fetch(...args),
  org = ORG,
  adminEmail = process.env.SSO_USER_EMAIL || process.env.VITE_SSO_USER_EMAIL || 'maloosatyam@google.com',
  aiBaseProd = AI_BASE_PROD,
  aiBaseDev = AI_BASE_DEV,
  copilotModel = COPILOT_MODEL,
  fallbackModel = COPILOT_FALLBACK_MODEL,
  now = () => Date.now(),
  randomHex,
  // Injectable so the retry path is unit-testable without a real 1.5s wait.
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  logger = console,
} = {}) {
  const changes = new ChangeStore();
  /** Consumer keys. Process memory only; never serialized to a client. */
  const secrets = { adminKey: '', sandboxKey: '' };
  const tools = [{ functionDeclarations: buildFunctionDeclarations() }];
  /** The model currently serving turns; only ever downgraded, never upgraded. */
  let activeModel = copilotModel;

  // -------------------------------------------------------------------------
  // Apigee management API
  // -------------------------------------------------------------------------

  async function apigee(pathSuffix, { method = 'GET', body } = {}) {
    const token = await getToken();
    if (!token) {
      return { ok: false, status: 503, json: null, text: 'no_gcp_token', error: 'Could not obtain a GCP access token.' };
    }
    try {
      const res = await fetchImpl(`${APIGEE_BASE}/${org}${pathSuffix}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { ok: res.ok, status: res.status, json, text };
    } catch (err) {
      return { ok: false, status: 0, json: null, text: '', error: err?.message || String(err) };
    }
  }

  // The one place a logical name ("Standard AI Tier (Dev)") becomes an Apigee
  // resource name ("Standard AI Tier Dev"). Everything else speaks logically.
  const productPath = (logicalName) =>
    `/apiproducts/${encodeURIComponent(apigeeProductName(logicalName))}`;

  async function readProduct(logicalName) {
    const res = await apigee(productPath(logicalName));
    if (res.ok && res.json) return { exists: true, product: res.json, raw: res.text };
    if (res.status === 404) return { exists: false, product: null, raw: '' };
    return { exists: false, product: null, raw: '', error: res.error || `HTTP ${res.status}` };
  }

  /** Live tier read with the canonical demo defaults as a fallback, as /api/products does. */
  async function readLiveOrDefault(name) {
    const res = await readProduct(name);
    if (res.exists) return res.product;
    const fallback = defaultProducts[name];
    return fallback ? JSON.parse(JSON.stringify(fallback)) : null;
  }

  async function writeProduct(logicalName, product) {
    const body = stripServerFields(product);
    // Never let a logical name leak into the resource itself: Apigee would
    // reject the parentheses, and a mismatched `name` renames the product.
    body.name = apigeeProductName(logicalName);
    const res = await apigee(productPath(logicalName), { method: 'PUT', body });
    if (!res.ok) {
      throw new AdminAgentError(
        `Apigee refused the write to "${logicalName}" (HTTP ${res.status})${
          res.json?.error?.message ? `: ${res.json.error.message}` : ''
        }`,
        'apigee_error'
      );
    }
    return res.json;
  }

  async function createProduct(product) {
    const res = await apigee('/apiproducts', { method: 'POST', body: product });
    if (!res.ok) {
      throw new AdminAgentError(
        `Could not create "${product.name}" (HTTP ${res.status})${
          res.json?.error?.message ? `: ${res.json.error.message}` : ''
        }`,
        'apigee_error'
      );
    }
    return res.json;
  }

  // -------------------------------------------------------------------------
  // Credentials (server-side only)
  // -------------------------------------------------------------------------

  async function adminConsumerKey() {
    if (secrets.adminKey) return secrets.adminKey;
    const token = await getToken();
    if (!token || typeof provisionAdmin !== 'function') return '';
    try {
      const result = await provisionAdmin(org, token, adminEmail);
      secrets.adminKey = result?.apiKeys?.admin || result?.apiKey || '';
    } catch (err) {
      logger.warn?.('[AdminAgent] Could not resolve the admin consumer key:', err?.message || err);
    }
    return secrets.adminKey;
  }

  const appPath = () =>
    `/developers/${encodeURIComponent(adminEmail)}/apps/${encodeURIComponent(SANDBOX_APP_NAME)}`;

  async function readSandboxApp() {
    const res = await apigee(appPath());
    if (!res.ok) return { exists: false, app: null };
    const cred =
      res.json?.credentials?.find((c) => c.status === 'approved') || res.json?.credentials?.[0];
    if (cred?.consumerKey) secrets.sandboxKey = cred.consumerKey;
    return { exists: true, app: res.json };
  }

  function identityToken() {
    return mintSyntheticIdentityToken(adminEmail, adminEmail.split('@')[0], now());
  }

  // -------------------------------------------------------------------------
  // Sandbox
  // -------------------------------------------------------------------------

  async function sandboxStatus() {
    const products = await Promise.all(
      DEV_PRODUCTS.map(async (name) => {
        const res = await readProduct(name);
        return { name, exists: res.exists, environments: res.product?.environments || [] };
      })
    );
    const app = await readSandboxApp();
    const provisioned = products.every((p) => p.exists) && app.exists && !!secrets.sandboxKey;
    return {
      provisioned,
      products,
      app: { name: SANDBOX_APP_NAME, exists: app.exists },
      // The key itself stays here. Only its presence is reported.
      keyPresent: !!secrets.sandboxKey,
    };
  }

  /**
   * Create the two `(Dev)` clones and the sandbox app.
   *
   * Existing clones are healed (environments/approvalType) rather than
   * overwritten, so re-provisioning does not silently discard changes the
   * copilot already applied to the sandbox.
   */
  async function provisionSandbox() {
    const notes = [];
    for (const liveName of LIVE_PRODUCTS) {
      const devName = devNameFor(liveName);
      const existing = await readProduct(devName);
      if (!existing.exists) {
        const live = await readLiveOrDefault(liveName);
        if (!live) {
          notes.push(`Could not read "${liveName}"; skipped its dev clone.`);
          continue;
        }
        await createProduct(buildDevClone(live, devName));
        notes.push(`Created ${devName}.`);
      } else {
        const product = existing.product;
        const needsEnv =
          !Array.isArray(product.environments) ||
          product.environments.length !== 1 ||
          product.environments[0] !== 'dev';
        const needsApproval = product.approvalType !== 'auto';
        if (needsEnv || needsApproval) {
          await writeProduct(devName, { ...product, environments: ['dev'], approvalType: 'auto' });
          notes.push(`Repaired ${devName} (dev-only, auto approval).`);
        }
      }
    }

    const app = await readSandboxApp();
    if (!app.exists) {
      const created = await apigee(`/developers/${encodeURIComponent(adminEmail)}/apps`, {
        method: 'POST',
        body: {
          name: SANDBOX_APP_NAME,
          // Apps reference the Apigee resource names, not the logical ones.
          apiProducts: DEV_PRODUCTS.map(apigeeProductName),
          attributes: [
            { name: 'DisplayName', value: 'Admin Copilot Dev Sandbox' },
            { name: 'persona', value: 'admin-copilot' },
          ],
        },
      });
      if (!created.ok) {
        throw new AdminAgentError(
          `Could not create the sandbox app (HTTP ${created.status})${
            created.json?.error?.message ? `: ${created.json.error.message}` : ''
          }`,
          'apigee_error'
        );
      }
      notes.push(`Created app ${SANDBOX_APP_NAME}.`);
    }
    await readSandboxApp();

    const status = await sandboxStatus();
    return { ...status, notes };
  }

  // -------------------------------------------------------------------------
  // Gateway calls
  // -------------------------------------------------------------------------

  async function gatewayCall({ url, apiKey, body, timeoutMs }) {
    const startedAt = now();
    if (!apiKey) {
      return {
        ok: false,
        status: 0,
        json: null,
        text: '',
        headers: {},
        latencyMs: 0,
        error: 'no API key available for the gateway call',
      };
    }
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-apikey': apiKey,
          Authorization: `Bearer ${identityToken()}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      const headers = {};
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
      return { ok: res.ok, status: res.status, json, text, headers, latencyMs: now() - startedAt };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        json: null,
        text: '',
        headers: {},
        latencyMs: now() - startedAt,
        error: err?.name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : err?.message || String(err),
      };
    }
  }

  /**
   * The copilot's own model call -- metered like any other gateway consumer.
   *
   * gemini-3.8-flash is an Enterprise-tier entitlement. The admin key is
   * Enterprise, so this should always hold, but an entitlement failure must
   * degrade to a model that is known to support tools rather than kill the
   * turn. The model that actually served is reported back so `usage.model`
   * (and the UI chip) never claims something untrue.
   */
  async function callCopilotModel({ contents, systemInstruction, tools: toolDefs }) {
    const apiKey = await adminConsumerKey();
    const body = {
      // No `role` here: the gateway's OAS-ValidateRequest policy rejects
      // systemInstruction.role with HTTP 400 ("properties which are not
      // allowed by the schema"), even though Vertex itself accepts it.
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      tools: toolDefs,
    };
    const attemptOnce = (model) =>
      gatewayCall({
        url: `${aiBaseProd}/models/${model}:generateContent`,
        apiKey,
        timeoutMs: COPILOT_TIMEOUT_MS,
        body,
      });

    /**
     * Vertex RESOURCE_EXHAUSTED is upstream capacity, not our governance, and
     * it is transient -- so it gets exactly one retry. An Apigee quota/budget
     * 429 deliberately gets none: that one IS the governance story, and hiding
     * it behind a retry would both delay the answer and misrepresent it.
     */
    const attempt = async (model) => {
      const first = await attemptOnce(model);
      if (first.ok || first.status !== 429) return first;
      if (classifyRateLimit(first) !== RATE_LIMIT_UPSTREAM_CAPACITY) return first;

      logger.warn?.(
        `[AdminAgent] Vertex RESOURCE_EXHAUSTED on ${model}; retrying once in ${UPSTREAM_RETRY_DELAY_MS}ms.`
      );
      await sleep(UPSTREAM_RETRY_DELAY_MS);
      const second = await attemptOnce(model);
      // Flagged so the error message can say it already retried.
      return { ...(second.status ? second : first), retriedUpstream: true };
    };

    let res = await attempt(activeModel);
    const notEntitled = !res.ok && (res.status === 403 || res.status === 404);
    if (notEntitled && activeModel !== fallbackModel) {
      logger.warn?.(
        `[AdminAgent] ${activeModel} returned HTTP ${res.status}; retrying on ${fallbackModel}.`
      );
      const retry = await attempt(fallbackModel);
      if (retry.ok) {
        // Only make the downgrade stick when it actually worked; a 403 from an
        // exhausted wallet must not silently pin the copilot to a lesser model.
        activeModel = fallbackModel;
        return { ...retry, model: fallbackModel };
      }
      res = retry.status ? retry : res;
    }
    return { ...res, model: activeModel };
  }

  async function runDevTest({ prompt, model }) {
    if (!secrets.sandboxKey) await readSandboxApp();
    if (!secrets.sandboxKey) {
      throw new AdminAgentError(
        'The dev sandbox is not provisioned yet, so there is no key to test with. Provision it first.',
        'not_provisioned'
      );
    }

    const devProducts = (
      await Promise.all(DEV_PRODUCTS.map((n) => readProduct(n)))
    )
      .filter((r) => r.exists)
      .map((r) => r.product);
    const allowed = allowedTestModels(
      devProducts.length ? devProducts : Object.values(defaultProducts)
    );
    if (!allowed.includes(model)) {
      throw new AdminAgentError(
        `Model "${model}" is not entitled on the dev sandbox. Available: ${allowed.join(', ')}.`
      );
    }

    const url = model === 'auto' ? `${aiBaseDev}/auto` : `${aiBaseDev}/models/${model}:generateContent`;
    const res = await gatewayCall({
      url,
      apiKey: secrets.sandboxKey,
      timeoutMs: DEV_TEST_TIMEOUT_MS,
      body: { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
    });
    return toTestResult({ ...res, requestedModel: model });
  }

  // -------------------------------------------------------------------------
  // Changes
  // -------------------------------------------------------------------------

  async function applyDevChange({ sourceProduct, changes: validated }) {
    const devName = assertWritableDevProduct(devNameFor(sourceProduct));
    const current = await readProduct(devName);
    if (!current.exists) {
      throw new AdminAgentError(
        `${devName} does not exist yet. Provision the dev sandbox first.`,
        'not_provisioned'
      );
    }

    const { next, diff } = applyChangeSet(current.product, validated);
    if (diff.length === 0) {
      throw new AdminAgentError(
        `Nothing to change on ${devName}: the requested values are already in place.`,
        'no_op'
      );
    }

    await writeProduct(devName, next);

    const change = {
      changeId: newChangeId(randomHex),
      productName: devName,
      sourceProduct: isDevProductName(sourceProduct) ? liveNameFor(sourceProduct) : sourceProduct,
      env: 'dev',
      summary: summarizeDiff(devName, diff),
      diff,
      appliedAt: new Date(now()).toISOString(),
      status: 'applied',
    };
    // The snapshot is the exact product as it was read a moment ago, so revert
    // restores that state byte for byte rather than "resetting to defaults".
    changes.record(change, current.raw || JSON.stringify(current.product));
    return change;
  }

  async function revertChange(changeId) {
    const entry = changes.get(changeId);
    if (!entry) {
      throw new AdminAgentError(`No snapshot for change "${changeId}" (only the last 50 are kept).`, 'not_found');
    }
    if (entry.change.status === 'reverted') return entry.change;

    const snapshot = JSON.parse(entry.snapshotRaw);
    await writeProduct(assertWritableDevProduct(entry.change.productName), snapshot);

    // A promoted change also touched the live tier; put that back too.
    if (entry.promotedSnapshotRaw) {
      const liveName = liveNameFor(entry.change.productName);
      await writeProduct(liveName, JSON.parse(entry.promotedSnapshotRaw));
    }
    return changes.setStatus(changeId, 'reverted');
  }

  async function promoteChange(changeId) {
    const entry = changes.get(changeId);
    if (!entry) throw new AdminAgentError(`Unknown change "${changeId}".`, 'not_found');
    if (entry.change.status === 'reverted') {
      throw new AdminAgentError('That change was reverted; re-apply it before promoting.', 'conflict');
    }

    const liveName = liveNameFor(entry.change.productName);
    const current = await readProduct(liveName);
    if (!current.exists) {
      throw new AdminAgentError(`Live product "${liveName}" could not be read.`, 'apigee_error');
    }

    // Replay the same diff on the live tier, re-validating every path/value --
    // the diff is trusted no more than the original tool call was.
    const validated = validateChangeList(entry.change.diff.map((d) => ({ path: d.path, value: d.after })));
    for (const change of validated) {
      if (change.kind === 'environments' && !change.value.includes('prod')) {
        throw new AdminAgentError(
          `Refusing to promote: that would remove "prod" from ${liveName} and take the live tier offline.`,
          'forbidden_target'
        );
      }
    }

    const { next, diff } = applyChangeSet(current.product, validated);
    if (diff.length === 0) {
      changes.setStatus(changeId, 'promoted');
      return entry.change;
    }
    await writeProduct(liveName, next);
    entry.promotedSnapshotRaw = current.raw || JSON.stringify(current.product);
    return changes.setStatus(changeId, 'promoted');
  }

  // -------------------------------------------------------------------------
  // Tool execution
  // -------------------------------------------------------------------------

  async function executeTool(call, events) {
    const name = call?.name || '(unnamed)';
    let args;
    try {
      args = validateToolArgs(name, call?.args);
    } catch (err) {
      events.push({ type: 'tool_call', name, summary: `${name} rejected: ${err.message}`, ok: false });
      return { error: err.message };
    }

    try {
      switch (name) {
        case 'list_products': {
          const results = await Promise.all(
            KNOWN_PRODUCTS.map(async (n) => {
              const r = await readProduct(n);
              return projectProduct(r.product, r.exists, n);
            })
          );
          events.push({
            type: 'tool_call',
            name,
            summary: `Listed ${results.filter((p) => p.exists).length} of ${KNOWN_PRODUCTS.length} products`,
            ok: true,
          });
          return { products: results };
        }
        case 'get_product': {
          const r = await readProduct(args.name);
          if (!r.exists) {
            events.push({ type: 'tool_call', name, summary: `${args.name} not found`, ok: false });
            return { error: `Product "${args.name}" does not exist.` };
          }
          events.push({ type: 'tool_call', name, summary: `Read ${args.name}`, ok: true });
          return { product: projectProduct(r.product, true, args.name) };
        }
        case 'list_guardrails': {
          const controls = listGuardrails(args.gateway);
          events.push({
            type: 'tool_call',
            name,
            summary: `Listed ${controls.length} guardrail controls${args.gateway ? ` (${args.gateway})` : ''}`,
            ok: true,
          });
          return { controls };
        }
        case 'get_rate_card': {
          const res = await apigee(
            `/environments/${args.env}/keyvaluemaps/${RATE_KVM}/entries/${RATE_KVM_ENTRY}`
          );
          if (!res.ok) {
            events.push({ type: 'tool_call', name, summary: `Rate card read failed (HTTP ${res.status})`, ok: false });
            return { error: `Could not read the rate card (HTTP ${res.status}).` };
          }
          let rates = {};
          try {
            rates = typeof res.json?.value === 'string' ? JSON.parse(res.json.value) : res.json?.value || {};
          } catch {
            rates = {};
          }
          events.push({ type: 'tool_call', name, summary: `Read the ${args.env} rate card`, ok: true });
          return { env: args.env, rates };
        }
        case 'update_dev_product': {
          const change = await applyDevChange(args);
          events.push({ type: 'tool_call', name, summary: change.summary, ok: true });
          events.push({ type: 'change', change });
          return { applied: true, changeId: change.changeId, productName: change.productName, diff: change.diff };
        }
        case 'run_dev_test': {
          const result = await runDevTest(args);
          events.push({
            type: 'tool_call',
            name,
            summary: `Dev test → HTTP ${result.httpStatus}${result.model ? ` on ${result.model}` : ''}`,
            ok: result.ok,
          });
          events.push({ type: 'test', result });
          return {
            httpStatus: result.httpStatus,
            ok: result.ok,
            model: result.model,
            totalTokens: result.totalTokens,
            costUsd: result.costUsd,
            cacheStatus: result.cacheStatus,
            latencyMs: result.latencyMs,
            guardrailBlocked: result.guardrailBlocked,
            text: result.text.slice(0, 1500),
          };
        }
        case 'revert_change': {
          const change = await revertChange(args.changeId);
          events.push({ type: 'tool_call', name, summary: `Reverted ${args.changeId}`, ok: true });
          events.push({ type: 'change', change });
          return { reverted: true, changeId: change.changeId };
        }
        default:
          events.push({ type: 'tool_call', name, summary: `Unknown tool ${name}`, ok: false });
          return { error: `Unknown tool "${name}".` };
      }
    } catch (err) {
      const message = err instanceof AdminAgentError ? err.message : `Tool ${name} failed: ${err?.message || err}`;
      // "Nothing to change -- the requested values are already in place" is a
      // correct answer, not a failure. Emitting an `error` event for it painted a
      // red banner underneath an otherwise perfect reply, so it stays a plain
      // tool_call: the model still sees it and can say so in its own words.
      const benign = err instanceof AdminAgentError && err.code === 'no_op';
      events.push({ type: 'tool_call', name, summary: message, ok: benign });
      if (!benign) events.push({ type: 'error', message });
      return { error: message };
    }
  }

  async function chat(messages) {
    const contents = messagesToContents(messages);
    const result = await runToolLoop({
      contents,
      systemInstruction: SYSTEM_INSTRUCTION,
      tools,
      callModel: callCopilotModel,
      executeTool,
      maxIterations: MAX_TOOL_ITERATIONS,
      budgetMs: TOOL_LOOP_BUDGET_MS,
      now,
    });
    return { reply: result.reply, events: result.events, usage: result.usage };
  }

  // -------------------------------------------------------------------------
  // HTTP layer
  // -------------------------------------------------------------------------

  function send(res, statusCode, payload) {
    if (res.writableEnded) return;
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    let body;
    try {
      body = JSON.stringify(payload);
    } catch {
      body = JSON.stringify({ status: 'error', error: 'Response could not be serialized.' });
    }
    res.end(redactSecrets(body, [secrets.adminKey, secrets.sandboxKey]));
  }

  function statusFor(err) {
    if (!(err instanceof AdminAgentError)) return 500;
    switch (err.code) {
      case 'invalid_argument':
      case 'unknown_tool':
        return 400;
      case 'method_not_allowed':
        return 405;
      case 'forbidden_target':
        return 403;
      case 'not_found':
        return 404;
      case 'conflict':
      case 'no_op':
        return 409;
      case 'too_large':
        return 413;
      case 'not_provisioned':
        return 409;
      case 'apigee_error':
        return 502;
      default:
        return 500;
    }
  }

  function fail(res, err) {
    const code = err instanceof AdminAgentError ? err.code : 'internal_error';
    const message = err instanceof AdminAgentError ? err.message : err?.message || String(err);
    if (!(err instanceof AdminAgentError)) {
      logger.error?.('[AdminAgent] Unhandled error:', err);
    }
    send(res, statusFor(err), { status: 'error', code, error: message });
  }

  async function jsonBody(req) {
    const raw = await readBody(req);
    if (!raw.trim()) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new AdminAgentError('Request body must be a JSON object.');
      }
      return parsed;
    } catch (err) {
      if (err instanceof AdminAgentError) throw err;
      throw new AdminAgentError('Request body is not valid JSON.');
    }
  }

  function requireMethod(req, method) {
    if (req.method !== method) {
      throw new AdminAgentError(`Method ${req.method} not allowed; use ${method}.`, 'method_not_allowed');
    }
  }

  async function handleRequest(req, res, parsedUrl) {
    const route = parsedUrl.pathname.replace(/^\/api\/admin-agent/, '').replace(/\/$/, '') || '/';
    try {
      switch (route) {
        case '/sandbox': {
          requireMethod(req, 'GET');
          const status = await sandboxStatus();
          return send(res, 200, { status: 'ok', ...status });
        }
        case '/sandbox/provision': {
          requireMethod(req, 'POST');
          await jsonBody(req);
          const result = await provisionSandbox();
          return send(res, 200, { status: 'ok', ...result });
        }
        case '/chat': {
          requireMethod(req, 'POST');
          const body = await jsonBody(req);
          const result = await chat(body.messages);
          return send(res, 200, { status: 'ok', ...result });
        }
        case '/changes': {
          requireMethod(req, 'GET');
          return send(res, 200, { status: 'ok', changes: changes.list() });
        }
        case '/revert': {
          requireMethod(req, 'POST');
          const body = await jsonBody(req);
          const change = await revertChange(String(body.changeId || '').trim());
          return send(res, 200, { status: 'ok', change });
        }
        case '/promote': {
          requireMethod(req, 'POST');
          const body = await jsonBody(req);
          const change = await promoteChange(String(body.changeId || '').trim());
          return send(res, 200, { status: 'ok', change });
        }
        case '/test': {
          requireMethod(req, 'POST');
          const body = await jsonBody(req);
          const args = validateToolArgs('run_dev_test', { prompt: body.prompt, model: body.model });
          const result = await runDevTest(args);
          return send(res, 200, { status: 'ok', result });
        }
        default:
          return send(res, 404, {
            status: 'error',
            code: 'unknown_route',
            error: `Unknown admin-agent route "${parsedUrl.pathname}".`,
          });
      }
    } catch (err) {
      // Nothing below this point may reject: an unhandled rejection here would
      // take the whole demo server down.
      try {
        return fail(res, err);
      } catch (sendErr) {
        logger.error?.('[AdminAgent] Failed to send error response:', sendErr);
        if (!res.writableEnded) res.end();
      }
    }
  }

  return {
    handleRequest,
    // Exposed for tests and for the live end-to-end check.
    _internals: {
      changes,
      secrets,
      tools,
      applyDevChange,
      revertChange,
      promoteChange,
      runDevTest,
      executeTool,
      chat,
      sandboxStatus,
      provisionSandbox,
      callCopilotModel,
      readProduct,
      identityToken,
    },
  };
}
