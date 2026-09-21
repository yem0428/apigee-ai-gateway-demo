import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modPath = path.resolve(__dirname, "../src/services/telemetryDiff.ts");
const modCode = fs.readFileSync(modPath, "utf8");

/**
 * telemetryDiff.ts compiled and executed for real.
 *
 * The module cannot be imported directly here: this harness is `node --test` over .mjs with
 * no TS pipeline, and the source uses an extensionless relative import that node's ESM
 * resolver rejects.
 *
 * An earlier version of this file regex-stripped the type annotations, which broke the
 * moment a parameter used the optional marker (`raw?: string` reduced to `raw?`, a syntax
 * error). Running the actual TypeScript compiler - already a devDependency, so no new
 * package - removes that whole class of fragility and guarantees the tests exercise the
 * same semantics the app ships.
 *
 * Compiled to CommonJS so the exports land on a plain object we control. The `../types`
 * import is type-only and TypeScript elides it, but `require` is stubbed anyway so a future
 * value import fails loudly here rather than silently yielding undefined.
 */
const compiled = ts.transpileModule(modCode, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const sandbox = {
  exports: {},
  require: (id) => {
    throw new Error(`telemetryDiff.ts must stay dependency-free; it tried to require ${id}`);
  },
};
vm.createContext(sandbox);
vm.runInContext(compiled, sandbox);
const { diffTelemetry, NO_MODEL_LABEL } = sandbox.exports;

assert.equal(typeof diffTelemetry, "function", "diffTelemetry did not survive compilation");
assert.equal(typeof NO_MODEL_LABEL, "string", "NO_MODEL_LABEL did not survive compilation");

/** Minimal telemetry object; only the fields the diff reads need to be present. */
const call = (over = {}) => ({
  status: 200,
  statusText: "OK",
  endpointUrl: "https://example/ai/v1/auto",
  model: "gemini-3-flash-preview",
  environment: "prod",
  latencyMs: 2000,
  cacheStatus: "MISS",
  guardrailStatus: "PASSED",
  costUsd: "0.019412",
  intent: "General",
  headersSent: {},
  headersReceived: {},
  rawRequest: {},
  rawResponse: {},
  ...over,
});

// Array.from rebuilds the list in THIS realm. Arrays returned from the vm sandbox carry
// the sandbox's Array.prototype, which deepStrictEqual rejects as not reference-equal even
// when the contents match.
const keys = (changes) => Array.from(changes, (c) => c.key);
const byKey = (changes, k) => changes.find((c) => c.key === k);

describe("telemetryDiff", () => {
  describe("1. No baseline means nothing to compare", () => {
    it("returns an empty list for the first call of a session", () => {
      assert.strictEqual(diffTelemetry(undefined, call()).length, 0);
      assert.strictEqual(diffTelemetry(null, call()).length, 0);
    });

    it("returns an empty list when there is no current call", () => {
      assert.strictEqual(diffTelemetry(call(), null).length, 0);
    });

    it("reports nothing when two calls are identical", () => {
      assert.strictEqual(diffTelemetry(call(), call()).length, 0);
    });
  });

  describe("2. The cache demo", () => {
    it("reports a miss becoming a hit as an improvement", () => {
      const changes = diffTelemetry(call(), call({ cacheStatus: "HIT" }));
      const cache = byKey(changes, "cache");
      assert.ok(cache, "expected a cache change");
      assert.strictEqual(cache.from, "MISS");
      assert.strictEqual(cache.to, "HIT");
      assert.strictEqual(cache.kind, "improved");
      assert.strictEqual(cache.headline, true);
    });

    it("quotes the full cost saving as -100% when a hit costs nothing", () => {
      // The single most quotable number in the caching demo.
      const changes = diffTelemetry(call(), call({ cacheStatus: "HIT", costUsd: "0.000000" }));
      const cost = byKey(changes, "cost");
      assert.strictEqual(cost.from, "$0.019412");
      assert.strictEqual(cost.to, "$0.000000");
      assert.strictEqual(cost.kind, "improved");
      assert.strictEqual(cost.detail, "-100%");
    });

    it("leads with cache and model, the two fields a presenter points at", () => {
      const changes = diffTelemetry(
        call(),
        call({ cacheStatus: "HIT", model: undefined, costUsd: "0.000000", latencyMs: 873 })
      );
      assert.deepStrictEqual(keys(changes).slice(0, 2), ["cache", "model"]);
    });
  });

  describe("3. Model attribution on a cache hit", () => {
    it("reads an unattributed hit as a move to the cache label, not to nothing", () => {
      // The gateway sends no x-gateway-model on a hit, so `model` is undefined. Rendering
      // "gemini-3-flash-preview -> (blank)" would look like a bug; it is a real state with
      // a real name.
      const changes = diffTelemetry(call(), call({ model: undefined, cacheStatus: "HIT" }));
      const model = byKey(changes, "model");
      assert.strictEqual(model.from, "gemini-3-flash-preview");
      assert.strictEqual(model.to, NO_MODEL_LABEL);
    });

    it("does not invent a model change when both calls are unattributed", () => {
      const a = call({ model: undefined, cacheStatus: "HIT" });
      const b = call({ model: undefined, cacheStatus: "HIT" });
      assert.strictEqual(byKey(diffTelemetry(a, b), "model"), undefined);
    });
  });

  describe("4. The auto-routing demo", () => {
    it("reports a model switch as neutral, not as a regression", () => {
      // Routing to a pricier model is the router working, not a fault. Colouring it red
      // would tell the exact opposite story to the one being demonstrated.
      const changes = diffTelemetry(call(), call({ model: "claude-opus-4-5@20251101" }));
      assert.strictEqual(byKey(changes, "model").kind, "neutral");
    });

    it("reports the intent change as supporting detail rather than a headline", () => {
      const changes = diffTelemetry(call(), call({ intent: "Coding" }));
      assert.strictEqual(byKey(changes, "intent").headline, false);
    });
  });

  describe("5. Latency is only reported when it is perceptible", () => {
    it("ignores jitter below 100 ms", () => {
      // Without a threshold every call reports a latency "change" and the band becomes
      // noise that people stop reading.
      assert.strictEqual(byKey(diffTelemetry(call(), call({ latencyMs: 2050 })), "latency"), undefined);
      assert.strictEqual(byKey(diffTelemetry(call(), call({ latencyMs: 1950 })), "latency"), undefined);
    });

    it("reports a real speed-up as an improvement with a percentage", () => {
      const changes = diffTelemetry(call({ latencyMs: 2310 }), call({ latencyMs: 873 }));
      const lat = byKey(changes, "latency");
      assert.strictEqual(lat.kind, "improved");
      assert.strictEqual(lat.detail, "-62%");
    });

    it("reports a slow-down as a regression", () => {
      assert.strictEqual(byKey(diffTelemetry(call({ latencyMs: 800 }), call({ latencyMs: 2000 })), "latency").kind, "regressed");
    });
  });

  describe("6. Guardrails", () => {
    it("treats a block as a headline regression", () => {
      const changes = diffTelemetry(call(), call({ guardrailStatus: "BLOCKED" }));
      const g = byKey(changes, "guardrail");
      assert.strictEqual(g.kind, "regressed");
      assert.strictEqual(g.headline, true);
    });

    it("does not shout when recovering from a block", () => {
      const changes = diffTelemetry(call({ guardrailStatus: "BLOCKED" }), call());
      const g = byKey(changes, "guardrail");
      assert.strictEqual(g.kind, "neutral");
      assert.strictEqual(g.headline, false);
    });
  });

  describe("7. Missing and malformed values degrade quietly", () => {
    it("reports no cost change when either side has no cost", () => {
      assert.strictEqual(byKey(diffTelemetry(call({ costUsd: undefined }), call()), "cost"), undefined);
      assert.strictEqual(byKey(diffTelemetry(call(), call({ costUsd: undefined })), "cost"), undefined);
    });

    it("omits the percentage rather than dividing by a zero baseline", () => {
      // 0 -> something is an infinite increase. There is no honest percentage, so the UI
      // just shows both values.
      const cost = byKey(diffTelemetry(call({ costUsd: "0.000000" }), call({ costUsd: "0.01" })), "cost");
      assert.strictEqual(cost.detail, undefined);
      assert.strictEqual(cost.kind, "regressed");
    });

    it("ignores an unparseable cost string", () => {
      assert.strictEqual(byKey(diffTelemetry(call({ costUsd: "n/a" }), call()), "cost"), undefined);
    });
  });

  describe("8. Very large increases are readable", () => {
    it("switches to a multiplier once a percentage stops being legible", () => {
      // The real figure from a flash-lite -> Opus reroute. As a percentage this reads
      // "+2581400%", which nobody can parse at a glance.
      const cost = byKey(
        diffTelemetry(call({ costUsd: "0.000003" }), call({ costUsd: "0.077445" })),
        "cost"
      );
      assert.strictEqual(cost.detail, "25815\u00d7");
      assert.strictEqual(cost.kind, "regressed");
    });

    it("uses the multiplier from exactly 10x upward", () => {
      const cost = byKey(
        diffTelemetry(call({ costUsd: "0.001000" }), call({ costUsd: "0.012000" })),
        "cost"
      );
      assert.strictEqual(cost.detail, "12\u00d7");
    });

    it("still uses percentages just below the threshold", () => {
      // 9x is +800%, which is still a number a person can read.
      const cost = byKey(
        diffTelemetry(call({ costUsd: "0.001000" }), call({ costUsd: "0.009000" })),
        "cost"
      );
      assert.strictEqual(cost.detail, "+800%");
    });

    it("never converts a decrease, which cannot exceed -100%", () => {
      const cost = byKey(
        diffTelemetry(call({ costUsd: "0.077445" }), call({ costUsd: "0.000003" })),
        "cost"
      );
      assert.strictEqual(cost.detail, "-100%");
      assert.strictEqual(cost.kind, "improved");
    });
  });
});
