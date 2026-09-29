/**
 * Admin Agent -- pure logic.
 *
 * Everything in this module is deliberately free of I/O: no fetch, no fs, no
 * clock beyond an injectable `now`. The Apigee management API and the AI
 * Gateway are reached through small injected functions (see
 * adminAgentService.js), so the interesting parts -- diffing, snapshot/revert,
 * the `(Dev)` write guard, tool-argument validation and the tool loop's
 * iteration/time caps -- can be unit-tested without credentials or egress.
 */

export const ORG = 'sgx-totc-apigee';

/**
 * Every agent write lands on a product whose name ends in this suffix.
 *
 * This is the *logical* name: the one the contract, the UI and the model all
 * use. Apigee itself rejects parentheses in an API product `name`
 * ("Invalid API product name", HTTP 400 — verified against bap-apac-demo2), so
 * the resource is created as "Standard AI Tier Dev" with the parenthesised form
 * as its displayName. apigeeProductName() is the only place the two meet.
 */
export const DEV_SUFFIX = ' (Dev)';
/** The same suffix, spelled the way Apigee will accept in a product name. */
export const APIGEE_DEV_SUFFIX = ' Dev';

export const LIVE_PRODUCTS = ['Standard AI Tier', 'Enterprise AI Tier'];
export const DEV_PRODUCTS = LIVE_PRODUCTS.map((n) => `${n}${DEV_SUFFIX}`);
/** The only four products any tool call is allowed to name. */
export const KNOWN_PRODUCTS = [...LIVE_PRODUCTS, ...DEV_PRODUCTS];

/**
 * Resource name of the sandbox developer app in Apigee.
 *
 * This deliberately still reads "copilot" after the Admin Copilot -> Admin Agent
 * rename: the app is already provisioned in the org and holds the sandbox
 * consumer key. Renaming it would orphan that key and force a re-provision, and
 * an Apigee app name cannot be edited in place. The user-facing DisplayName
 * attribute says "Admin Agent Dev Sandbox"; only the resource id is frozen.
 */
export const SANDBOX_APP_NAME = 'admin-copilot-dev';

/**
 * The agent runs on the same gateway it administers, so its own usage is
 * metered and shows up in the demo's analytics. Claude cannot be substituted:
 * the proxy's Gemini->Claude bridge drops `tools` and discards `tool_use`.
 *
 * Model chosen by benchmark, not by reputation. All four Gemini candidates were
 * driven through the real gateway with this file's own SYSTEM_INSTRUCTION and
 * tool declarations, 3 trials each:
 *
 *   model                   plain     tool turn   tools  thinking  cost/call
 *   gemini-3.1-flash-lite   2334ms    2212ms      3/3    0         $0.000101
 *   gemini-3-flash-preview  3747ms    2690ms      3/3    55        $0.000235
 *   gemini-3.7-flash        3648ms    3249ms      3/3    48        $0.002414
 *   gemini-3.8-flash        504 Gateway Timeout
 *
 * gemini-3.8-flash -- the previous choice -- now times out at the gateway under
 * a tool-bearing request. flash-lite answers a tool turn in ~2.2s, calls tools
 * just as reliably, emits no thinking tokens, and costs ~24x less than 3.7 and
 * ~240x less than 3.8 did per turn. It is also entitled on BOTH tiers, so the
 * fallback below is now genuinely a last resort rather than a routine path.
 */
export const AGENT_MODEL = 'gemini-3.1-flash-lite';
/** Used only if the primary model turns out not to be entitled (403/404). */
export const AGENT_FALLBACK_MODEL = 'gemini-3-flash-preview';
export const AI_BASE_PROD = 'https://api.maloosatyam.demo.altostrat.com/ai/v1';
export const AI_BASE_DEV = 'https://bap.api.maloosatyam.demo.altostrat.com/ai/v1';

export const MAX_TOOL_ITERATIONS = 6;
/**
 * Wall-clock ceiling for one chat turn.
 *
 * At ~2.5s per hop on gemini-3.1-flash-lite, the worst case (6 hops) is ~15s.
 * 45s leaves roughly 3x headroom for a slow upstream without making a wedged
 * turn feel hung. This was 90s when the agent ran on gemini-3.8-flash at ~13s
 * per hop; leaving it there would just mean waiting longer to find out a turn
 * had failed.
 */
export const TOOL_LOOP_BUDGET_MS = 45_000;
/** Newest N changes keep their pre-write snapshot, so revert stays byte-exact. */
export const MAX_TRACKED_CHANGES = 50;

/** A tool/validation failure that is safe to show the model and the user. */
export class AdminAgentError extends Error {
  constructor(message, code = 'invalid_argument') {
    super(message);
    this.name = 'AdminAgentError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Mint the stand-in identity token the gateway needs when there is no IAP
 * assertion (localhost). Shared with /api/me so the two can never drift.
 *
 * It must say RS256 and carry a non-empty signature segment: Apigee's
 * DecodeJWT rejects the `alg: none` / empty-signature form outright (401),
 * even though it never verifies the signature.
 */
export function mintSyntheticIdentityToken(email, name, nowMs = Date.now()) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const sig = Buffer.from('dummysignature12345678901234567890').toString('base64url');
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    email,
    sub: email,
    name,
    iss: 'local-dev',
    iat: Math.floor(nowMs / 1000),
  })}.${sig}`;
}

// ---------------------------------------------------------------------------
// Product name guards
// ---------------------------------------------------------------------------

export function isDevProductName(name) {
  return typeof name === 'string' && name.endsWith(DEV_SUFFIX);
}

/** Resolve any accepted spelling to one of the four known product names. */
export function resolveKnownProduct(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const match = KNOWN_PRODUCTS.find((p) => p.toLowerCase() === trimmed.toLowerCase());
  if (!match) {
    throw new AdminAgentError(
      `Unknown product "${trimmed}". Known products: ${KNOWN_PRODUCTS.join(', ')}.`
    );
  }
  return match;
}

/** Map a source tier (live or dev spelling) onto its dev sandbox clone. */
export function devNameFor(sourceProduct) {
  const known = resolveKnownProduct(sourceProduct);
  return isDevProductName(known) ? known : `${known}${DEV_SUFFIX}`;
}

/** Map a dev clone back to the live tier it was cloned from. */
export function liveNameFor(devProduct) {
  const known = resolveKnownProduct(devProduct);
  return isDevProductName(known) ? known.slice(0, -DEV_SUFFIX.length) : known;
}

/**
 * The name to use in an Apigee management API path or `name` field.
 *
 * Apigee will not accept "Standard AI Tier (Dev)" -- parentheses are outside
 * the permitted character set for an API product name -- so the dev clones live
 * under "Standard AI Tier Dev" and carry the parenthesised form as their
 * displayName. Everything above this function speaks in logical names only.
 */
export function apigeeProductName(logicalName) {
  const known = resolveKnownProduct(logicalName);
  return isDevProductName(known)
    ? `${known.slice(0, -DEV_SUFFIX.length)}${APIGEE_DEV_SUFFIX}`
    : known;
}

/** Inverse of apigeeProductName, for names read back from Apigee. */
export function logicalProductName(apigeeName) {
  const trimmed = typeof apigeeName === 'string' ? apigeeName.trim() : '';
  if (trimmed.endsWith(APIGEE_DEV_SUFFIX)) {
    const base = trimmed.slice(0, -APIGEE_DEV_SUFFIX.length);
    if (LIVE_PRODUCTS.includes(base)) return `${base}${DEV_SUFFIX}`;
  }
  return trimmed;
}

/**
 * The hard stop behind requirement #2: update_dev_product must refuse to write
 * anything that is not a `(Dev)` clone, whatever the model asked for.
 */
export function assertWritableDevProduct(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!isDevProductName(trimmed)) {
    throw new AdminAgentError(
      `Refusing to write "${trimmed}": the agent may only modify dev sandbox products ` +
        `(names ending in "${DEV_SUFFIX}").`,
      'forbidden_target'
    );
  }
  if (!DEV_PRODUCTS.includes(trimmed)) {
    throw new AdminAgentError(
      `Refusing to write "${trimmed}": not one of the known dev sandbox products ` +
        `(${DEV_PRODUCTS.join(', ')}).`,
      'forbidden_target'
    );
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Change paths
// ---------------------------------------------------------------------------

const ROUTING_CATEGORIES = ['coding', 'deep_reasoning', 'simple', 'general'];

/** Only these attributes are writable; anything else is rejected up front. */
export const ALLOWED_ATTRIBUTE_NAMES = new Set([
  'access',
  'developer.budget.limit',
  'developer.budget.interval',
  'developer.budget.timeunit',
  ...ROUTING_CATEGORIES.map((c) => `routing.model.${c}`),
]);

export const ALLOWED_ENVIRONMENTS = ['dev', 'prod'];

const MAX_QUOTA_LIMIT = 10_000_000;

/**
 * Classify and validate a change path *before* it reaches the Apigee
 * management API. Returns a descriptor; throws AdminAgentError otherwise.
 */
export function parseChangePath(path) {
  if (typeof path !== 'string' || !path.trim()) {
    throw new AdminAgentError('Each change needs a "path".');
  }
  const p = path.trim();

  if (p === 'environments') return { kind: 'environments', path: p };

  if (p.startsWith('attributes.')) {
    const attr = p.slice('attributes.'.length);
    if (!ALLOWED_ATTRIBUTE_NAMES.has(attr)) {
      throw new AdminAgentError(
        `Attribute "${attr}" is not writable. Allowed: ${[...ALLOWED_ATTRIBUTE_NAMES].join(', ')}.`
      );
    }
    return { kind: 'attribute', path: p, attribute: attr };
  }

  const quota = /^llmTokenQuota\.(.+)\.limit$/.exec(p);
  if (quota) {
    const resource = quota[1].trim();
    if (!resource || resource.length > 120 || /[\s"'<>]/.test(resource)) {
      throw new AdminAgentError(`Invalid token quota resource "${resource}".`);
    }
    return { kind: 'quota', path: p, resource };
  }

  throw new AdminAgentError(
    `Unsupported change path "${p}". Supported: attributes.<name>, ` +
      'llmTokenQuota.<resource>.limit, environments.'
  );
}

/** Coerce and bounds-check a change value for the given path kind. */
export function normalizeChangeValue(descriptor, rawValue) {
  if (descriptor.kind === 'environments') {
    let list = rawValue;
    if (typeof list === 'string') {
      const text = list.trim();
      try {
        list = text.startsWith('[') ? JSON.parse(text) : text.split(',').map((s) => s.trim());
      } catch {
        throw new AdminAgentError(`environments must be a JSON array, got ${text}`);
      }
    }
    if (!Array.isArray(list) || list.length === 0) {
      throw new AdminAgentError('environments must be a non-empty array.');
    }
    const cleaned = [...new Set(list.map((e) => String(e).trim()))];
    for (const env of cleaned) {
      if (!ALLOWED_ENVIRONMENTS.includes(env)) {
        throw new AdminAgentError(
          `Unknown environment "${env}". Allowed: ${ALLOWED_ENVIRONMENTS.join(', ')}.`
        );
      }
    }
    return cleaned;
  }

  if (descriptor.kind === 'quota') {
    const n = Number(String(rawValue).replace(/[_,\s]/g, ''));
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > MAX_QUOTA_LIMIT) {
      throw new AdminAgentError(
        `Token quota limit must be a whole number between 1 and ${MAX_QUOTA_LIMIT}, got "${rawValue}".`
      );
    }
    return String(n);
  }

  // attribute
  if (rawValue === null || rawValue === undefined) {
    throw new AdminAgentError(`Attribute "${descriptor.attribute}" needs a value.`);
  }
  const value = String(rawValue).trim();
  if (!value || value.length > 256 || /[\u0000-\u001f]/.test(value)) {
    throw new AdminAgentError(`Invalid value for "${descriptor.path}".`);
  }
  if (descriptor.attribute.startsWith('routing.model.') && !/^[A-Za-z0-9._@-]+$/.test(value)) {
    throw new AdminAgentError(`"${value}" is not a valid model id for ${descriptor.path}.`);
  }
  if (descriptor.attribute === 'developer.budget.limit' && !/^\d{1,12}$/.test(value)) {
    throw new AdminAgentError('developer.budget.limit must be a positive whole number.');
  }
  return value;
}

/** Validate the whole `changes` array from a tool call. */
export function validateChangeList(changes) {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new AdminAgentError('"changes" must be a non-empty array of {path, value}.');
  }
  if (changes.length > 20) {
    throw new AdminAgentError('At most 20 changes may be applied in one call.');
  }
  return changes.map((c) => {
    if (!c || typeof c !== 'object') throw new AdminAgentError('Each change must be an object.');
    const descriptor = parseChangePath(c.path);
    return { ...descriptor, value: normalizeChangeValue(descriptor, c.value) };
  });
}

// ---------------------------------------------------------------------------
// Reading / writing product fields
// ---------------------------------------------------------------------------

function operationConfigs(product) {
  return product?.llmOperationGroup?.operationConfigs || [];
}

/**
 * Accept either the literal operation resource (`/models/x:*`), a bare model id
 * (`gemini-3-flash-preview`) or `auto`, and return the canonical resource
 * string used by the product. Throws if the product has no such operation --
 * inventing one would silently create an unquota'd path.
 */
export function resolveQuotaResource(product, requested) {
  const want = String(requested).trim();
  const configs = operationConfigs(product);
  const resources = configs.flatMap((cfg) => (cfg.llmOperations || []).map((op) => op.resource));

  if (resources.includes(want)) return want;

  const candidates = [`/models/${want}:*`, `/${want}`, `/${want}:*`];
  for (const candidate of candidates) {
    if (resources.includes(candidate)) return candidate;
  }

  for (const cfg of configs) {
    for (const op of cfg.llmOperations || []) {
      if (op.model && op.model === want) return op.resource;
    }
  }

  throw new AdminAgentError(
    `"${want}" is not an operation on ${product?.name || 'this product'}. ` +
      `Available: ${resources.join(', ') || '(none)'}.`
  );
}

/** Current value at a change path, as a string (or null when unset). */
export function readChangePath(product, descriptor) {
  if (descriptor.kind === 'environments') {
    return JSON.stringify(product.environments || []);
  }
  if (descriptor.kind === 'attribute') {
    const found = (product.attributes || []).find((a) => a.name === descriptor.attribute);
    return found ? String(found.value ?? '') : null;
  }
  const resource = descriptor.resolvedResource || descriptor.resource;
  for (const cfg of operationConfigs(product)) {
    if ((cfg.llmOperations || []).some((op) => op.resource === resource)) {
      const limit = cfg.llmTokenQuota?.limit;
      return limit === undefined || limit === null ? null : String(limit);
    }
  }
  return null;
}

function writeChangePath(product, descriptor, value) {
  if (descriptor.kind === 'environments') {
    product.environments = value;
    return;
  }
  if (descriptor.kind === 'attribute') {
    product.attributes = product.attributes || [];
    const existing = product.attributes.find((a) => a.name === descriptor.attribute);
    if (existing) existing.value = value;
    else product.attributes.push({ name: descriptor.attribute, value });
    return;
  }
  const resource = descriptor.resolvedResource || descriptor.resource;
  let touched = false;
  for (const cfg of operationConfigs(product)) {
    if ((cfg.llmOperations || []).some((op) => op.resource === resource)) {
      cfg.llmTokenQuota = { interval: '1', timeUnit: 'minute', ...(cfg.llmTokenQuota || {}), limit: value };
      touched = true;
    }
  }
  if (!touched) {
    throw new AdminAgentError(`No token quota operation found for "${resource}".`);
  }
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Apigee rejects these on write; they are server-owned metadata. */
export function stripServerFields(product) {
  const copy = clone(product);
  delete copy.createdAt;
  delete copy.lastModifiedAt;
  delete copy.createdBy;
  delete copy.lastModifiedBy;
  return copy;
}

/**
 * Apply a validated change list to a product, returning the new product and a
 * contract-shaped diff. The input product is never mutated, so the caller can
 * keep it as the pre-change snapshot.
 */
export function applyChangeSet(product, validatedChanges) {
  const next = clone(product);
  const diff = [];
  for (const change of validatedChanges) {
    const descriptor =
      change.kind === 'quota'
        ? { ...change, resolvedResource: resolveQuotaResource(next, change.resource) }
        : change;
    const canonicalPath =
      descriptor.kind === 'quota'
        ? `llmTokenQuota.${descriptor.resolvedResource}.limit`
        : descriptor.path;
    const before = readChangePath(next, descriptor);
    writeChangePath(next, descriptor, descriptor.value);
    const after = readChangePath(next, descriptor);
    if (before !== after) {
      diff.push({
        path: canonicalPath,
        // A readable label for the card. `path` stays on the object so the
        // exact config location is still available when someone asks for it.
        label: humanizeChangePath(canonicalPath),
        before,
        after,
      });
    }
  }
  return { next, diff };
}

/**
 * Turns an internal config path into something a platform owner can read at a
 * glance. The admin reading the change card wants "Token limit · Claude Haiku",
 * not "llmTokenQuota./models/claude-haiku-4-5@20251001:*.limit".
 *
 * Unknown shapes fall through to the raw path rather than being mangled into a
 * confident-sounding wrong label.
 */
export function humanizeChangePath(path) {
  const quota = /^llmTokenQuota\.(.+)\.limit$/.exec(path);
  if (quota) {
    const resource = quota[1];
    if (resource === '/auto' || resource === '/auto:*') return 'Token limit · auto-routed calls';
    const model = /^\/models\/(.+?):?\*?$/.exec(resource);
    if (model) return `Token limit · ${model[1].replace(/@\d+$/, '')}`;
    return `Token limit · ${resource}`;
  }

  const attr = /^attributes\.(.+)$/.exec(path);
  if (attr) {
    const known = {
      'developer.budget.limit': 'Monthly spending cap',
      'developer.budget.interval': 'Spending cap interval',
      'developer.budget.timeunit': 'Spending cap period',
      'routing.model.coding': 'Auto-routing · coding prompts',
      'routing.model.deep_reasoning': 'Auto-routing · deep reasoning',
      'routing.model.simple': 'Auto-routing · simple lookups',
      'routing.model.general': 'Auto-routing · general prompts',
      access: 'Product visibility',
    };
    return known[attr[1]] || `Attribute · ${attr[1]}`;
  }

  if (path === 'environments') return 'Environments';
  return path;
}

/**
 * One line of plain English for the change card and the model's own recap.
 * Groups the common case — several token limits moved at once — instead of
 * listing four near-identical config paths.
 */
export function summarizeDiff(productName, diff) {
  if (diff.length === 0) return `No effective change on ${productName} — values already match.`;

  const tier = productName.replace(/\s*\(Dev\)\s*$/, '');
  const quotas = diff.filter((d) => /^llmTokenQuota\./.test(d.path));

  // All token limits, all moving the same way: say it once.
  if (quotas.length === diff.length && quotas.length > 1) {
    const raised = quotas.every((d) => Number(d.after) > Number(d.before));
    const lowered = quotas.every((d) => Number(d.after) < Number(d.before));
    const verb = raised ? 'Raised' : lowered ? 'Lowered' : 'Changed';
    return `${verb} ${quotas.length} per-minute token limits on ${tier}`;
  }

  const describe = (d) =>
    `${d.label || humanizeChangePath(d.path)}: ${d.before ?? '—'} → ${d.after}`;
  const parts = diff.slice(0, 2).map(describe);
  const more = diff.length > 2 ? ` (+${diff.length - 2} more)` : '';
  return `${tier}: ${parts.join('; ')}${more}`;
}

export function newChangeId(randomHex = () => Math.random().toString(16).slice(2, 10)) {
  return `chg_${String(randomHex()).replace(/[^0-9a-f]/gi, '').slice(0, 8).padEnd(8, '0')}`;
}

// ---------------------------------------------------------------------------
// Change store (snapshots for byte-exact revert)
// ---------------------------------------------------------------------------

/**
 * Keeps the last N changes together with the exact bytes of the product as it
 * was read immediately before the write. Revert replays those bytes; it does
 * not "reset to defaults", so a change applied on top of hand-edited state
 * restores that state rather than the canonical demo one.
 */
export class ChangeStore {
  constructor(max = MAX_TRACKED_CHANGES) {
    this.max = max;
    this.entries = new Map();
  }

  record(change, snapshotRaw) {
    this.entries.set(change.changeId, { change, snapshotRaw });
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      this.entries.delete(oldest);
    }
    return change;
  }

  get(changeId) {
    return this.entries.get(changeId) || null;
  }

  /** Newest first. Snapshots are never included -- they are server-only state. */
  list() {
    return [...this.entries.values()].map((e) => e.change).reverse();
  }

  setStatus(changeId, status) {
    const entry = this.entries.get(changeId);
    if (!entry) return null;
    entry.change.status = status;
    return entry.change;
  }

  get size() {
    return this.entries.size;
  }
}

// ---------------------------------------------------------------------------
// Dev sandbox clone
// ---------------------------------------------------------------------------

/**
 * Build the dev clone of a live tier: same attributes and llmOperationGroup,
 * but pinned to the dev environment with auto approval. API Products are
 * org-scoped, which is exactly why the agent never writes the live tiers.
 */
export function buildDevClone(liveProduct, devName = devNameFor(liveProduct?.name)) {
  const source = stripServerFields(liveProduct || {});
  return {
    // `name` is the Apigee resource id and may not contain parentheses;
    // `displayName` is what the console and the agent show.
    name: apigeeProductName(devName),
    displayName: devName,
    description:
      `Admin Agent dev sandbox clone of "${liveProduct?.name || ''}". ` +
      'Safe to modify: not attached to prod.',
    approvalType: 'auto',
    environments: ['dev'],
    attributes: clone(source.attributes || []),
    ...(source.llmOperationGroup ? { llmOperationGroup: clone(source.llmOperationGroup) } : {}),
    ...(source.operationGroup ? { operationGroup: clone(source.operationGroup) } : {}),
    ...(source.quota ? { quota: source.quota, quotaInterval: source.quotaInterval, quotaTimeUnit: source.quotaTimeUnit } : {}),
  };
}

/** Models a dev test may name: whatever the dev products actually entitle. */
export function allowedTestModels(devProducts = []) {
  const models = new Set(['auto']);
  for (const product of devProducts) {
    for (const cfg of operationConfigs(product)) {
      for (const op of cfg.llmOperations || []) {
        if (op.model && op.model !== 'auto') models.add(op.model);
      }
    }
  }
  return [...models];
}

// ---------------------------------------------------------------------------
// Tool declarations
// ---------------------------------------------------------------------------

export const TOOL_NAMES = [
  'list_products',
  'get_product',
  'list_guardrails',
  'get_rate_card',
  'update_dev_product',
  'run_dev_test',
  'revert_change',
];

/** Gemini function declarations. Kept JSON-serialisable and schema-minimal. */
export function buildFunctionDeclarations() {
  return [
    {
      name: 'list_products',
      description:
        'List the live API Products (Standard AI Tier, Enterprise AI Tier) and their dev sandbox clones, with environments, approval type, token quotas and routing attributes.',
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'get_product',
      description:
        'Read one API Product in full: attributes, environments and per-model token quotas.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: `Exact product name. One of: ${KNOWN_PRODUCTS.join(', ')}.`,
            enum: KNOWN_PRODUCTS,
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'list_guardrails',
      description:
        'List the guardrail controls enforced by the AI and MCP gateway proxies, including the Apigee policies behind each one.',
      parameters: {
        type: 'object',
        properties: {
          gateway: {
            type: 'string',
            description: 'Optional filter: "ai" or "mcp". Omit for both.',
            enum: ['ai', 'mcp'],
          },
        },
      },
    },
    {
      name: 'get_rate_card',
      description:
        'Read the live per-model input/output token rates from the ai-model-rates KVM that the gateway prices requests with.',
      parameters: {
        type: 'object',
        properties: {
          env: { type: 'string', description: 'Apigee environment, dev or prod. Defaults to prod.', enum: ['dev', 'prod'] },
        },
      },
    },
    {
      name: 'update_dev_product',
      description:
        'Apply configuration changes to the DEV SANDBOX clone of a tier. The live tier is never written. Returns the applied diff, which the user can revert.',
      parameters: {
        type: 'object',
        properties: {
          sourceProduct: {
            type: 'string',
            description: 'The tier to change. The dev clone is written, not this product.',
            enum: LIVE_PRODUCTS,
          },
          changes: {
            type: 'array',
            description: 'The edits to apply.',
            items: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description:
                    'One of: attributes.<name> (access, developer.budget.limit, developer.budget.interval, developer.budget.timeunit, routing.model.coding|deep_reasoning|simple|general), llmTokenQuota.<resource>.limit (resource may be a model id such as gemini-3-flash-preview), or environments.',
                },
                value: {
                  type: 'string',
                  description:
                    'The new value. For environments pass a JSON array string such as ["dev"].',
                },
              },
              required: ['path', 'value'],
            },
          },
        },
        required: ['sourceProduct', 'changes'],
      },
    },
    {
      name: 'run_dev_test',
      description:
        'Send a real prompt through the dev AI Gateway using the sandbox app key, and report status, model, tokens, cost, cache status and latency.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The prompt to send.' },
          model: {
            type: 'string',
            description: 'Optional model id, or "auto" to exercise the router. Defaults to auto.',
          },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'revert_change',
      description: 'Restore the exact pre-change snapshot for a change id returned by update_dev_product.',
      parameters: {
        type: 'object',
        properties: { changeId: { type: 'string', description: 'A chg_xxxxxxxx id.' } },
        required: ['changeId'],
      },
    },
  ];
}

/**
 * Whitelist every tool argument before it can reach the management API.
 * Returns normalized args; throws AdminAgentError on anything unexpected.
 */
export function validateToolArgs(name, rawArgs) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  switch (name) {
    case 'list_products':
      return {};
    case 'get_product':
      return { name: resolveKnownProduct(args.name) };
    case 'list_guardrails': {
      const gateway = args.gateway ? String(args.gateway).trim().toLowerCase() : '';
      if (gateway && gateway !== 'ai' && gateway !== 'mcp') {
        throw new AdminAgentError(`Unknown gateway "${gateway}". Use "ai" or "mcp".`);
      }
      return gateway ? { gateway } : {};
    }
    case 'get_rate_card': {
      const env = args.env ? String(args.env).trim().toLowerCase() : 'prod';
      if (env !== 'dev' && env !== 'prod') {
        throw new AdminAgentError(`Unknown environment "${env}". Use "dev" or "prod".`);
      }
      return { env };
    }
    case 'update_dev_product': {
      const source = resolveKnownProduct(args.sourceProduct || args.product || args.name);
      return {
        sourceProduct: isDevProductName(source) ? liveNameFor(source) : source,
        changes: validateChangeList(args.changes),
      };
    }
    case 'run_dev_test': {
      const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
      if (!prompt) throw new AdminAgentError('run_dev_test needs a non-empty "prompt".');
      if (prompt.length > 4000) throw new AdminAgentError('Prompt is too long (max 4000 chars).');
      const model = args.model ? String(args.model).trim() : 'auto';
      if (!/^[A-Za-z0-9._@:-]{1,80}$/.test(model)) {
        throw new AdminAgentError(`"${model}" is not a valid model id.`);
      }
      return { prompt, model };
    }
    case 'revert_change': {
      const changeId = typeof args.changeId === 'string' ? args.changeId.trim() : '';
      if (!/^chg_[0-9a-f]{8}$/.test(changeId)) {
        throw new AdminAgentError(`"${changeId}" is not a valid change id.`);
      }
      return { changeId };
    }
    default:
      throw new AdminAgentError(`Unknown tool "${name}".`, 'unknown_tool');
  }
}

export const SYSTEM_INSTRUCTION = `You are the Admin Agent for an Apigee AI Gateway console (org ${ORG}).

You help a platform administrator understand and change AI Gateway configuration
by talking to them, not by showing them the machinery.

HOW TO WRITE
- Plain business English. Write the way you would explain it to a colleague who
  owns the platform but does not know Apigee's internals.
- Lead with the answer in one sentence. Add detail only if it genuinely helps.
- Short paragraphs or a few bullets. No headings for a two-line answer.
- Spell out numbers the way a person would: "2,000 tokens a minute", not
  "llmTokenQuota.limit=2000".
- Use everyday words for the concepts: "prompt screening" rather than
  "SUP-UserPrompt", "the spending cap" rather than "developer.budget.limit",
  "which models this tier may call" rather than "llmOperationGroup".

WHAT NOT TO SHOW UNLESS ASKED
- Never volunteer code, JSON, XML, policy filenames, attribute paths, resource
  paths or internal identifiers. They are noise to the person reading this panel.
- No fenced code blocks unless the admin explicitly asks to see the
  configuration, the policy, the XML, the JSON, or "the actual name of...".
- When they do ask, give it to them fully and precisely. The information is not
  secret, it is just not the default way to answer.
- Do not report your own token usage, cost or latency. The console shows that.

WHAT TO DO
- Never write out a tool call as your answer. Do not reply with text like
  "Calling get_product(...)" or "I will now call the tool". Either issue the
  tool call, or answer the question. Narration is never an acceptable reply.
- Use tools for every fact. Never invent a quota, model name, price or policy.
- Prefer one tool call per turn and stop as soon as you can answer. You have at
  most ${MAX_TOOL_ITERATIONS} tool rounds.
- API Products are shared across environments, so you never touch a live tier.
  update_dev_product always writes the "${DEV_SUFFIX.trim()}" sandbox copy. Say that in
  plain words: "I've made that change on the dev copy."
- You cannot change production, and you must never offer to. Production is
  changed only by raising a pull request against the product definitions in
  git. If the admin asks you to promote, publish, or apply something to prod,
  tell them plainly that the change is ready on dev and that going live needs a
  pull request. Do not treat this as a failure -- it is how the platform works.
- Never guess a model id. Model names carry versions and suffixes that you will
  get wrong from memory. Read the product first and use the exact id it returns.
- If a tool fails and the error message lists the valid values, immediately
  retry once with the correct value. Do not ask the admin for permission to use
  a name the system just handed you -- they cannot be expected to know it, and
  asking wastes their turn. Only come back to them if the retry also fails.
- Write numbers as digits: "50 tokens a minute", never "fifty tokens a minute".
- After a change, say what is different now in one sentence, in business terms
  ("Standard tier can now use twice as many tokens a minute: 4,000 instead of
  2,000"). Mention that it can be undone from the card below. Do not repeat the
  diff; the card already shows it.
- If something fails for a reason you cannot correct, say what happened and what
  they can do about it, in one or two sentences. Never retry the same failing
  call with the same arguments.`;

// ---------------------------------------------------------------------------
// Tool loop
// ---------------------------------------------------------------------------

/**
 * True when a 4xx is Apigee's Model Armor guardrail rather than a client error.
 * Shared by the agent's own error reporting and by TestResult mapping so the
 * two can never disagree about what counts as a guardrail block.
 */
export function isModelArmorBlock(status, json, text) {
  if (status !== 400 && status !== 403) return false;
  const blob = JSON.stringify(json ?? text ?? '').toLowerCase();
  return (
    blob.includes('model armor') ||
    blob.includes('sanitize') ||
    blob.includes('sup-userprompt') ||
    blob.includes('blocked')
  );
}

/**
 * Two completely different failures share HTTP 429, and conflating them is
 * actively harmful in a governance demo:
 *
 *  - APIGEE_QUOTA: our own LLMTokenQuota / budget / wallet policy stopped the
 *    call. That IS the governance story. It is actionable (raise the quota, top
 *    up the wallet) and must fail fast and visibly.
 *  - UPSTREAM_CAPACITY: Vertex answered RESOURCE_EXHAUSTED and the gateway
 *    passed it through. Nothing to do with our configuration, and transient.
 *
 * Telling an admin their wallet is empty when it holds $15.78 of $20 is exactly
 * the sort of thing that derails a demo, so when the evidence is ambiguous this
 * returns UNKNOWN rather than guessing.
 */
export const RATE_LIMIT_APIGEE_QUOTA = 'apigee_quota';
export const RATE_LIMIT_UPSTREAM_CAPACITY = 'upstream_capacity';
export const RATE_LIMIT_UNKNOWN = 'unknown';

export function classifyRateLimit(res) {
  const json = res?.json;
  const blob = JSON.stringify(json ?? res?.text ?? '');
  const lower = blob.toLowerCase();
  const headers = res?.headers || {};

  // Vertex's own resource-exhaustion, forwarded by the gateway. The doc link in
  // the message is the most reliable marker; RESOURCE_EXHAUSTED is the next.
  if (
    lower.includes('error-code-429') ||
    lower.includes('resource exhausted') ||
    json?.error?.status === 'RESOURCE_EXHAUSTED'
  ) {
    return RATE_LIMIT_UPSTREAM_CAPACITY;
  }

  // Apigee-originated: a policy fault, or a gateway header that says so.
  const errorcode = String(json?.fault?.detail?.errorcode || '');
  if (
    /^policies\.(ratelimit|quota)\./i.test(errorcode) ||
    lower.includes('quotaviolation') ||
    lower.includes('ltq-token') ||
    lower.includes('token quota') ||
    lower.includes('budget') ||
    lower.includes('wallet') ||
    lower.includes('monetization')
  ) {
    return RATE_LIMIT_APIGEE_QUOTA;
  }
  const budgetStatus = String(headers['x-gateway-budget-status'] || '').toLowerCase();
  if (budgetStatus && budgetStatus !== 'ok') return RATE_LIMIT_APIGEE_QUOTA;

  return RATE_LIMIT_UNKNOWN;
}

/** Human-readable reason for a non-2xx (or transport-level) gateway result. */
export function describeGatewayFailure(res) {
  if (!res) return 'The AI Gateway returned no response.';
  if (res.error && !res.status) return `Could not reach the AI Gateway: ${res.error}`;
  const status = res.status || 0;
  const detail =
    res.json?.error?.message ||
    res.json?.fault?.faultstring ||
    (typeof res.text === 'string' ? res.text.slice(0, 240) : '') ||
    '';

  if (isModelArmorBlock(status, res.json, res.text)) {
    // The agent is governed by the very guardrail it exists to explain.
    // Observed behaviour: this template's prompt-injection filter can match on
    // benign security vocabulary, and it is not fully deterministic -- the same
    // prompt is sometimes allowed. So suggest a rephrase rather than asserting
    // a rule about which words are banned.
    const injection = /pimatchesfound: true/i.test(JSON.stringify(res.json ?? res.text ?? ''));
    return (
      `Model Armor blocked that prompt at the gateway${
        injection ? ' (prompt-injection filter)' : ''
      }, so it never reached a model. This template can match on security ` +
      'vocabulary; rephrasing usually gets through — e.g. "Which security controls ' +
      'are enforced on the AI proxy?".'
    );
  }
  if (status === 400 && /OASValidation|not allowed by the schema/i.test(detail)) {
    return `The gateway's request schema rejected the agent's payload: ${detail}`;
  }
  if (status === 401 || status === 403) {
    return `The AI Gateway rejected the agent's credentials (HTTP ${status})${detail ? `: ${detail}` : ''}.`;
  }
  if (status === 429) {
    const kind = classifyRateLimit(res);
    const retried = res.retriedUpstream ? ' It was already retried once.' : '';
    if (kind === RATE_LIMIT_UPSTREAM_CAPACITY) {
      return (
        'Vertex AI is out of model capacity right now (HTTP 429 RESOURCE_EXHAUSTED, ' +
        `upstream of the gateway). This is transient and unrelated to your token quota or wallet.${retried} ` +
        `Try again in a moment.${detail ? ` Upstream said: ${detail}` : ''}`
      );
    }
    if (kind === RATE_LIMIT_APIGEE_QUOTA) {
      return (
        "The gateway's own governance stopped this call (HTTP 429): the agent's " +
        `token quota or prepaid wallet budget is exhausted.${detail ? ` ${detail}` : ''} ` +
        'Raise the quota on the API Product or top up the developer wallet.'
      );
    }
    return (
      `The AI Gateway returned HTTP 429, and the response does not say whether that is our ` +
      `token quota or upstream model capacity.${retried}${detail ? ` It said: ${detail}` : ''}`
    );
  }
  if (status >= 500) {
    return `The AI Gateway is failing upstream (HTTP ${status})${detail ? `: ${detail}` : ''}.`;
  }
  return `The AI Gateway returned HTTP ${status}${detail ? `: ${detail}` : ''}.`;
}

function partsToText(parts) {
  return (parts || [])
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

/** Keep a tool result from blowing up the next prompt. */
export function truncateToolResult(value, max = 6000) {
  const text = JSON.stringify(value ?? null);
  if (text.length <= max) return value;
  return { truncated: true, note: `Result truncated to ${max} chars.`, preview: text.slice(0, max) };
}

/**
 * Canonical Gemini encoding: echo the model's functionCall parts back and reply
 * with functionResponse parts, correlated by the `id` the gateway assigns.
 *
 * This is what Vertex expects, but it does NOT survive our gateway: the AI
 * proxy's OAS-ValidateRequest policy validates the request body against
 * oas://openapi.yaml, whose `parts` schema allows text only. Sending it back
 * yields HTTP 400 "Object instance has properties which are not allowed by the
 * schema: [functionCall, thoughtSignature]". Kept, and tested, so that the day
 * the proxy's OpenAPI spec learns about tool parts this is a one-line switch.
 */
export function nativeToolTurn({ modelParts, results }) {
  return [
    { role: 'model', parts: modelParts },
    {
      role: 'user',
      parts: results.map(({ call, response }) => ({
        functionResponse: {
          ...(call.id ? { id: call.id } : {}),
          name: call.name,
          response: truncateToolResult(response),
        },
      })),
    },
  ];
}

/**
 * Gateway-compatible encoding: the same information as text parts.
 *
 * Roles stay strictly alternating (model, then user) because the model's own
 * functionCall part cannot be echoed; a one-line stand-in takes its place.
 * The results are labelled as system-generated so the model does not mistake
 * them for something the admin typed.
 *
 * The stand-in is deliberately written as a bracketed machine marker rather
 * than prose. An earlier version read "Calling get_product({...})", which the
 * model learned from its own transcript and started emitting as a FINAL ANSWER
 * instead of actually calling the tool — the admin saw
 * `Calling get_product({"name":"Standard AI Tier (Dev)"})` as the reply. Anything
 * that looks like a sentence here is something the model may imitate.
 */
export function textToolTurn({ results }) {
  const callLine = results
    .map(({ call }) => `${call.name}(${JSON.stringify(call.args ?? {})})`)
    .join(', ');
  const body = results
    .map(({ call, response }) =>
      `### ${call.name}${call.id ? ` [${call.id}]` : ''}\n${JSON.stringify(truncateToolResult(response))}`
    )
    .join('\n\n');
  return [
    { role: 'model', parts: [{ text: `<<TOOL_CALL_ISSUED ${callLine}>>` }] },
    {
      role: 'user',
      parts: [{ text: `TOOL RESULTS (system-generated, not typed by the user):\n\n${body}` }],
    },
  ];
}

/**
 * True when the model has narrated a tool call instead of answering.
 *
 * This is never a valid reply: either the model should have emitted a real
 * functionCall part, or it should have answered the question. Surfacing it
 * verbatim shows the admin our internal plumbing.
 */
export function looksLikeToolNarration(text) {
  if (!text) return false;
  const t = text.trim();
  return (
    /^<<TOOL_CALL_ISSUED/.test(t) ||
    /^calling\s+[a-z_][a-z0-9_]*\s*\(/i.test(t) ||
    /^(i('| a)m going to |i will |let me )?call(ing)?\s+[a-z_][a-z0-9_]*\s*\(\s*\{/i.test(t) ||
    t.startsWith('TOOL RESULTS (system-generated')
  );
}

/**
 * Drive the Gemini function-calling loop.
 *
 * Hard guarantees (requirement #4): at most `maxIterations` model round-trips,
 * at most `budgetMs` wall clock, and it never rejects -- a gateway 4xx/5xx or a
 * throwing tool degrades into an `error` event plus a useful `reply`.
 *
 * @param callModel async ({contents, systemInstruction, tools}) =>
 *        { ok, status, json, headers, text, latencyMs, error }
 * @param executeTool async (functionCall, events) => tool response object
 * @param encodeToolTurn how tool results re-enter the transcript. Defaults to
 *        textToolTurn, because the gateway's request schema rejects the native
 *        functionCall/functionResponse parts -- see those functions.
 */
export async function runToolLoop({
  contents,
  systemInstruction = SYSTEM_INSTRUCTION,
  tools,
  callModel,
  executeTool,
  encodeToolTurn = textToolTurn,
  maxIterations = MAX_TOOL_ITERATIONS,
  budgetMs = TOOL_LOOP_BUDGET_MS,
  now = () => Date.now(),
}) {
  const events = [];
  const startedAt = now();
  let working = [...contents];
  let reply = '';
  // One-shot: we correct a narrated tool call once, then stop trying.
  let nudgedForNarration = false;
  let iterations = 0;
  let stopReason = 'iteration_cap';
  let totalTokens = 0;
  let costUsd = 0;
  let model = AGENT_MODEL;

  for (let i = 0; i < maxIterations; i += 1) {
    if (now() - startedAt >= budgetMs) {
      stopReason = 'time_budget';
      events.push({
        type: 'error',
        // Plain English: the admin does not care about our budget constant.
        message: 'That took longer than expected, so I stopped there. Anything already applied is listed above and can be reverted.',
      });
      break;
    }

    iterations += 1;
    let res;
    try {
      res = await callModel({ contents: working, systemInstruction, tools });
    } catch (err) {
      res = { ok: false, status: 0, error: err?.message || String(err) };
    }

    if (!res || !res.ok) {
      stopReason = 'model_error';
      events.push({ type: 'error', message: describeGatewayFailure(res) });
      break;
    }

    totalTokens += Number(res.json?.usageMetadata?.totalTokenCount) || 0;
    costUsd += Number.parseFloat(res.headers?.['x-gateway-cost-usd'] || '0') || 0;
    if (res.headers?.['x-gateway-model']) model = res.headers['x-gateway-model'];
    else if (res.model) model = res.model;

    const parts = res.json?.candidates?.[0]?.content?.parts || [];
    const calls = parts.filter((p) => p && p.functionCall).map((p) => p.functionCall);
    const text = partsToText(parts);

    // An empty text part is normal on a pure tool-call turn; only a turn with
    // no function calls at all ends the loop.
    if (calls.length === 0) {
      // The model sometimes copies the shape of our synthetic tool-turn
      // stand-in and "answers" with `Calling get_product({...})`. That is
      // plumbing, not an answer. Push back once and let it try again rather
      // than showing it to the admin.
      if (looksLikeToolNarration(text) && !nudgedForNarration && iterations < maxIterations) {
        nudgedForNarration = true;
        working = [
          ...working,
          { role: 'model', parts: [{ text: '<<TOOL_CALL_ISSUED>>' }] },
          {
            role: 'user',
            parts: [{
              text:
                'SYSTEM CORRECTION (not typed by the admin): do not describe or ' +
                'narrate a tool call. Either issue the tool call, or answer the ' +
                "question in plain English using what you already have.",
            }],
          },
        ];
        continue;
      }
      reply = looksLikeToolNarration(text) ? reply : (text || reply);
      stopReason = 'complete';
      break;
    }
    if (text && !looksLikeToolNarration(text)) reply = text;

    const results = [];
    for (const call of calls) {
      let response;
      try {
        response = await executeTool(call, events);
      } catch (err) {
        // executeTool is expected to handle its own failures; this is the net.
        response = { error: err?.message || String(err) };
        events.push({ type: 'error', message: `Tool ${call?.name} failed: ${response.error}` });
      }
      results.push({ call, response });
    }
    working = [...working, ...encodeToolTurn({ modelParts: parts, calls, results })];
  }

  if (stopReason === 'iteration_cap') {
    events.push({
      type: 'error',
      message: `Stopped after the ${maxIterations}-tool-call limit for one turn. Ask a narrower follow-up to continue.`,
    });
  }

  if (!reply) reply = fallbackReply(stopReason, events);

  return {
    reply,
    events,
    iterations,
    stopReason,
    usage: {
      model,
      totalTokens,
      costUsd: Number(costUsd.toFixed(6)),
      latencyMs: now() - startedAt,
    },
  };
}

/** A useful answer even when the model never produced one. */
function fallbackReply(stopReason, events) {
  const toolLines = events
    .filter((e) => e.type === 'tool_call')
    .map((e) => `- ${e.summary}`)
    .join('\n');
  const errors = events.filter((e) => e.type === 'error').map((e) => e.message);
  const head =
    stopReason === 'model_error'
      ? "I couldn't complete that turn."
      : stopReason === 'time_budget'
        ? 'I ran out of time on that turn.'
        : stopReason === 'iteration_cap'
          ? 'I hit the tool-call limit before finishing.'
          : 'No answer was produced.';
  return [
    head,
    toolLines ? `Here is what I did get:\n${toolLines}` : '',
    errors.length ? errors.join(' ') : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Map the contract's `messages` onto Gemini `contents`. */
export function messagesToContents(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AdminAgentError('"messages" must be a non-empty array.');
  }
  if (messages.length > 40) {
    throw new AdminAgentError('Conversation too long; start a new one.');
  }
  const contents = [];
  for (const m of messages) {
    const role = m?.role === 'assistant' ? 'model' : 'user';
    const text = typeof m?.content === 'string' ? m.content : '';
    if (!text.trim()) continue;
    contents.push({ role, parts: [{ text: text.slice(0, 8000) }] });
  }
  if (contents.length === 0) throw new AdminAgentError('No message content to send.');
  if (contents[contents.length - 1].role !== 'user') {
    throw new AdminAgentError('The last message must come from the user.');
  }
  return contents;
}

/** x-gateway-* response headers only -- the contract's TestResult.headers. */
export function pickGatewayHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (k.toLowerCase().startsWith('x-gateway-')) out[k.toLowerCase()] = String(v);
  }
  return out;
}

/** Build a contract-shaped TestResult from a raw gateway response. */
export function toTestResult({ status, json, text, headers, latencyMs, requestedModel, error }) {
  const h = pickGatewayHeaders(headers);
  const usage = json?.usageMetadata || json?.usage || {};
  const promptTokens = Number(
    usage.promptTokenCount ?? usage.input_tokens ?? h['x-gateway-prompt-tokens'] ?? 0
  );
  const candidatesTokens = Number(
    usage.candidatesTokenCount ?? usage.output_tokens ?? h['x-gateway-completion-tokens'] ?? 0
  );
  const totalTokens = Number(
    usage.totalTokenCount ?? usage.total_tokens ?? h['x-gateway-total-tokens'] ?? promptTokens + candidatesTokens
  );
  const ok = status >= 200 && status < 300;

  let answer = '';
  const parts = json?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) answer = partsToText(parts);
  else if (Array.isArray(json?.content)) {
    answer = json.content.filter((c) => c.type === 'text').map((c) => c.text || '').join('\n');
  }
  if (!ok || !answer) {
    answer =
      answer ||
      json?.fault?.faultstring ||
      json?.error?.message ||
      (error ? `Request failed: ${error}` : '') ||
      (typeof text === 'string' ? text.slice(0, 600) : '') ||
      '';
  }

  const guardrailBlocked = isModelArmorBlock(status, json, text);

  return {
    httpStatus: status || 0,
    ok,
    // Never fabricate a model: on a cache hit or a fault the gateway names none,
    // and echoing "auto" back would assert a model that was never chosen.
    model: h['x-gateway-model'] || (requestedModel && requestedModel !== 'auto' ? requestedModel : ''),
    latencyMs: Number(latencyMs) || 0,
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    candidatesTokens: Number.isFinite(candidatesTokens) ? candidatesTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
    costUsd: Number.parseFloat(h['x-gateway-cost-usd'] || '0') || 0,
    cacheStatus: h['x-gateway-cache-status'] || (h['x-gateway-cached'] === 'true' ? 'HIT' : 'DISABLED'),
    guardrailBlocked,
    text: answer,
    headers: h,
  };
}
