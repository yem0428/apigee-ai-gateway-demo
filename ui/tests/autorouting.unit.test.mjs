import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jscDir = path.resolve(__dirname, "../../apigee/proxies/ai-gateway-v1/apiproxy/resources/jsc");
const autoRoutingCode = fs.readFileSync(path.join(jscDir, "AutoRouting.js"), "utf8");
const prepRouterCode = fs.readFileSync(path.join(jscDir, "PrepRouterRequest.js"), "utf8");

/**
 * AutoRouting.js with comments removed.
 *
 * The static guards below assert that no model name and no prompt-classification logic
 * survives in the policy. They have to run against executable code only: the header
 * comment legitimately names gemini-3.1-flash-lite as the classifier, and a guard that
 * trips on its own documentation is a guard someone deletes.
 */
const autoRoutingExecutable = autoRoutingCode
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/**
 * The routing model map as actually configured on the two AI tier API products.
 *
 * These are NOT test fixtures invented here: they mirror the `routing.model.*` custom
 * attributes in apigee/products/{standard,enterprise}_ai_tier.json. `productAttributes`
 * below asserts that correspondence against the product JSON itself, so a product edit
 * that is not reflected here fails rather than silently drifting.
 */
const PRODUCT_ROUTING = {
  "Enterprise AI Tier": {
    coding: "claude-opus-4-5@20251101",
    deep_reasoning: "gemini-3.1-pro-preview",
    simple: "gemini-3.1-flash-lite",
    general: "gemini-3-flash-preview",
  },
  "Standard AI Tier": {
    coding: "gemini-3-flash-preview",
    deep_reasoning: "gemini-3-flash-preview",
    simple: "gemini-3.1-flash-lite",
    general: "gemini-3-flash-preview",
  },
};

/** Builds the Vertex `generateContent` envelope SC-ModelRouter writes to `routerResponse`. */
function routerResponse(categoryText) {
  return JSON.stringify({
    candidates: [{ content: { role: "model", parts: [{ text: categoryText }] } }],
  });
}

/**
 * Executes AutoRouting.js in an isolated vm sandbox simulating the Apigee JSC context.
 *
 * `product` selects which set of `routing.model.*` attributes VA-VerifyAPIKey resolved.
 * Pass `attributes: {}` to simulate a product that carries none.
 */
function runAutoRouting({
  routerContent = undefined,
  product = "Enterprise AI Tier",
  attributes = undefined,
  productName = undefined,
} = {}) {
  const resolvedName = productName !== undefined ? productName : product;
  const routingMap = attributes !== undefined ? attributes : PRODUCT_ROUTING[product] || {};

  const variables = {
    "verifyapikey.VA-VerifyAPIKey.apiproduct.name": resolvedName,
  };
  for (const [category, model] of Object.entries(routingMap)) {
    variables[`verifyapikey.VA-VerifyAPIKey.apiproduct.routing.model.${category}`] = model;
  }
  if (routerContent !== undefined) {
    variables["routerResponse.content"] = routerContent;
  }

  const context = {
    getVariable: (name) => (variables[name] !== undefined ? variables[name] : null),
    setVariable: (name, val) => {
      variables[name] = val;
    },
  };

  const sandbox = { context, console };
  vm.createContext(sandbox);
  vm.runInContext(autoRoutingCode, sandbox);

  return {
    targetModel: variables["flow.target_model"],
    model: variables["flow.model"],
    targetProvider: variables["flow.target_provider"],
    autoRouted: variables["flow.autoRouted"],
    routerCategory: variables["flow.routerCategory"],
    routingTier: variables["flow.routingTier"],
    costTier: variables["flow.costTier"],
    allVars: variables,
  };
}

/** Executes PrepRouterRequest.js in the same kind of sandbox. */
function runPrepRouter(userPrompt) {
  const variables = { "flow.userPrompt": userPrompt };
  const context = {
    getVariable: (name) => (variables[name] !== undefined ? variables[name] : null),
    setVariable: (name, val) => {
      variables[name] = val;
    },
  };
  const sandbox = { context, console };
  vm.createContext(sandbox);
  vm.runInContext(prepRouterCode, sandbox);

  return {
    skip: variables["flow.skipRouterCallout"],
    payload: variables["flow.routerPayload"],
    parsed: JSON.parse(variables["flow.routerPayload"]),
  };
}

describe("AutoRouting.js - LLM Router Model Unit Test Suite", () => {
  describe("1. Router category -> product attribute resolution (Enterprise AI Tier)", () => {
    const cases = [
      ["coding", "claude-opus-4-5@20251101", "anthropic"],
      ["deep_reasoning", "gemini-3.1-pro-preview", "google"],
      ["simple", "gemini-3.1-flash-lite", "google"],
      ["general", "gemini-3-flash-preview", "google"],
    ];

    for (const [category, expectedModel, expectedProvider] of cases) {
      it(`routes category "${category}" to ${expectedModel}`, () => {
        const res = runAutoRouting({
          routerContent: routerResponse(JSON.stringify({ category })),
          product: "Enterprise AI Tier",
        });
        assert.strictEqual(res.routerCategory, category);
        assert.strictEqual(res.targetModel, expectedModel);
        assert.strictEqual(res.model, expectedModel);
        assert.strictEqual(res.targetProvider, expectedProvider);
        assert.strictEqual(res.autoRouted, "true");
      });
    }
  });

  describe("2. The SAME category resolves differently per product (attribute-driven)", () => {
    // This is the whole point of moving the model map onto the API product: the routing
    // decision is one classification, and entitlement is applied by the product. If these
    // two ever return the same model for `coding`, the tier cap has stopped working.
    it("routes coding to Opus on Enterprise but to Flash on Standard", () => {
      const ent = runAutoRouting({
        routerContent: routerResponse('{"category": "coding"}'),
        product: "Enterprise AI Tier",
      });
      const std = runAutoRouting({
        routerContent: routerResponse('{"category": "coding"}'),
        product: "Standard AI Tier",
      });

      assert.strictEqual(ent.targetModel, "claude-opus-4-5@20251101");
      assert.strictEqual(ent.targetProvider, "anthropic");
      assert.strictEqual(std.targetModel, "gemini-3-flash-preview");
      assert.strictEqual(std.targetProvider, "google");
    });

    it("never routes a Standard caller to Pro or Opus for any category", () => {
      for (const category of ["coding", "deep_reasoning", "simple", "general"]) {
        const res = runAutoRouting({
          routerContent: routerResponse(JSON.stringify({ category })),
          product: "Standard AI Tier",
        });
        assert.notStrictEqual(res.targetModel, "claude-opus-4-5@20251101");
        assert.notStrictEqual(res.targetModel, "gemini-3.1-pro-preview");
        assert.strictEqual(res.targetProvider, "google");
      }
    });
  });

  describe("3. Router response parsing robustness", () => {
    it("parses a pretty-printed JSON body", () => {
      const res = runAutoRouting({
        routerContent: routerResponse('{\n  "category": "deep_reasoning"\n}'),
      });
      assert.strictEqual(res.routerCategory, "deep_reasoning");
      assert.strictEqual(res.targetModel, "gemini-3.1-pro-preview");
    });

    it("strips ```json fences before parsing", () => {
      const res = runAutoRouting({
        routerContent: routerResponse('```json\n{"category": "coding"}\n```'),
      });
      assert.strictEqual(res.routerCategory, "coding");
      assert.strictEqual(res.targetModel, "claude-opus-4-5@20251101");
    });

    it("recovers the category by regex when the body is not valid JSON", () => {
      // Guards the `catch` arm of extractCategory: a truncated body still carries a
      // usable decision, and discarding it would silently demote the request to general.
      const res = runAutoRouting({
        routerContent: routerResponse('{"category": "simple", "confidence":'),
      });
      assert.strictEqual(res.routerCategory, "simple");
      assert.strictEqual(res.targetModel, "gemini-3.1-flash-lite");
    });

    it("normalises case and surrounding whitespace in the category", () => {
      const res = runAutoRouting({
        routerContent: routerResponse('{"category": "  CODING  "}'),
      });
      assert.strictEqual(res.routerCategory, "coding");
      assert.strictEqual(res.targetModel, "claude-opus-4-5@20251101");
    });
  });

  describe("4. Router unavailable -> general attribute, never a hardcoded model", () => {
    // The regex heuristics and the hardcoded per-tier model map were both deleted. The
    // ONLY remaining source of a model name is the API product, so every degraded path
    // has to land on `routing.model.general` rather than on a literal in the policy.
    const degraded = [
      ["callout never ran (empty prompt / skipped)", undefined],
      ["callout timed out and left no body", ""],
      ["callout returned an error envelope", '{"error":{"code":429,"message":"quota"}}'],
      ["callout returned no candidates", '{"candidates":[]}'],
      ["callout returned unparseable content", "not-json-at-all"],
      ["candidate carried no recognisable category", routerResponse('{"label":"coding"}')],
    ];

    for (const [label, content] of degraded) {
      it(`falls back to routing.model.general when the ${label}`, () => {
        const res = runAutoRouting({ routerContent: content, product: "Enterprise AI Tier" });
        assert.strictEqual(res.routerCategory, null, "category must stay unresolved");
        assert.strictEqual(res.targetModel, "gemini-3-flash-preview");
        assert.strictEqual(res.targetProvider, "google");
        assert.strictEqual(res.autoRouted, "true");
      });
    }

    it("falls back to general when the router invents a category the product does not map", () => {
      // The responseSchema enum makes this unlikely, not impossible. An unmapped category
      // must degrade to the product's general model, not to null.
      const res = runAutoRouting({
        routerContent: routerResponse('{"category": "translation"}'),
        product: "Enterprise AI Tier",
      });
      assert.strictEqual(res.routerCategory, "translation");
      assert.strictEqual(res.targetModel, "gemini-3-flash-preview");
    });
  });

  describe("5. No hardcoded model map survives in the policy", () => {
    it("resolves nothing when the product carries no routing attributes", () => {
      // Deliberate. A product that grants /auto without declaring routing.model.* is a
      // misconfiguration, and the policy must surface it rather than quietly hand out a
      // model the product may not even entitle. This test is what fails if someone
      // reintroduces the old per-tier literals as a "safety net".
      for (const category of ["coding", "deep_reasoning", "simple", "general"]) {
        const res = runAutoRouting({
          routerContent: routerResponse(JSON.stringify({ category })),
          attributes: {},
          productName: "Enterprise AI Tier",
        });
        assert.strictEqual(
          res.targetModel,
          null,
          `a product with no attributes must not yield a model (category: ${category})`
        );
      }
    });

    it("contains no model literal in the executable source", () => {
      // Static guard on the file itself. The runtime tests above can be satisfied by a
      // literal that happens to agree with the product; this cannot.
      //
      // Comments are stripped first, deliberately. The header comment names
      // gemini-3.1-flash-lite as the CLASSIFIER, which is accurate and worth keeping --
      // a guard that fires on its own documentation just gets disabled.
      for (const literal of [
        "claude-opus-4-5@20251101",
        "gemini-3.1-pro-preview",
        "gemini-3.1-flash-lite",
        "gemini-3-flash-preview",
      ]) {
        assert.ok(
          !autoRoutingExecutable.includes(literal),
          `AutoRouting.js must not hardcode the model name ${literal}`
        );
      }
    });

    it("contains no prompt-classification logic in the executable source", () => {
      // The classification now belongs to the router model. A regex creeping back in
      // would mean two disagreeing classifiers and a decision that depends on timing.
      // flow.userPrompt is included: AutoRouting.js must no longer read the prompt at all.
      for (const marker of ["isCoding", "isDeepReasoning", "isSimple", "flow.userPrompt"]) {
        assert.ok(
          !autoRoutingExecutable.includes(marker),
          `AutoRouting.js must not classify prompts itself (found ${marker})`
        );
      }
    });
  });

  describe("6. Tier tracing and provider selection", () => {
    it("reports the enterprise tier from the product name", () => {
      const res = runAutoRouting({ routerContent: routerResponse('{"category":"simple"}') });
      assert.strictEqual(res.routingTier, "enterprise");
    });

    it("reports the standard tier for a non-enterprise product name", () => {
      const res = runAutoRouting({
        routerContent: routerResponse('{"category":"simple"}'),
        product: "Standard AI Tier",
      });
      assert.strictEqual(res.routingTier, "standard");
    });

    it("reports standard when the product name is blank", () => {
      const res = runAutoRouting({
        routerContent: routerResponse('{"category":"simple"}'),
        product: "Standard AI Tier",
        productName: "",
      });
      assert.strictEqual(res.routingTier, "standard");
    });

    it("selects the anthropic provider from the resolved model name alone", () => {
      // Provider is derived, not configured. A product could map any category to a Claude
      // model and the Claude RouteRule still has to fire.
      const res = runAutoRouting({
        routerContent: routerResponse('{"category":"simple"}'),
        attributes: { simple: "claude-haiku-4-5@20251001" },
      });
      assert.strictEqual(res.targetModel, "claude-haiku-4-5@20251001");
      assert.strictEqual(res.targetProvider, "anthropic");
    });

    it("defaults the provider to google when no model resolves", () => {
      // Regression guard: reading .indexOf on a null model threw and took the whole
      // policy down, which turns a misconfigured product into a 500 for the caller.
      const res = runAutoRouting({ attributes: {} });
      assert.strictEqual(res.targetModel, null);
      assert.strictEqual(res.targetProvider, "google");
    });
  });

  describe("7. Separation of concerns", () => {
    it("sets NO costing variables - routing selects a model, nothing else", () => {
      // Routing used to hardcode a costTier literal beside each decision, which then beat
      // the KVM-resolved rate in CalculateCost.js on the /auto path. Costing lives in
      // exactly one place.
      for (const category of ["coding", "deep_reasoning", "simple", "general"]) {
        for (const product of ["Standard AI Tier", "Enterprise AI Tier"]) {
          const res = runAutoRouting({
            routerContent: routerResponse(JSON.stringify({ category })),
            product,
          });
          assert.strictEqual(res.costTier, undefined);
          assert.strictEqual(res.allVars["flow.tx_cost_usd"], undefined);
          assert.strictEqual(res.allVars["flow.tx_cost_micros"], undefined);
        }
      }
    });

    it("populates every variable the downstream flow reads", () => {
      const res = runAutoRouting({ routerContent: routerResponse('{"category":"coding"}') });
      assert.ok(res.allVars["flow.target_model"]);
      assert.ok(res.allVars["flow.model"]);
      assert.ok(res.allVars["flow.target_provider"]);
      assert.ok(res.allVars["flow.routerCategory"]);
      assert.ok(res.allVars["flow.routingTier"]);
      assert.strictEqual(res.allVars["flow.autoRouted"], "true");
    });
  });
});

describe("PrepRouterRequest.js - Router Callout Payload", () => {
  it("skips the callout on an empty prompt", () => {
    // No prompt means nothing to classify. Calling the router anyway would add a billed
    // round trip and ~300ms to a request that can only ever land on the general model.
    for (const prompt of ["", "   ", "\n\t "]) {
      const res = runPrepRouter(prompt);
      assert.strictEqual(res.skip, "true", `expected skip for ${JSON.stringify(prompt)}`);
    }
  });

  it("builds a callout payload for a real prompt", () => {
    const res = runPrepRouter("def fib(n): pass");
    assert.strictEqual(res.skip, "false");
    assert.ok(res.parsed.contents[0].parts[0].text.includes("def fib(n): pass"));
  });

  it("pins the response to the four-category JSON schema", () => {
    // The enum is what lets AutoRouting.js index the product attributes directly. If a
    // category is added here it must also be added to every AI tier product.
    const { parsed } = runPrepRouter("hello");
    const cfg = parsed.generationConfig;
    assert.strictEqual(cfg.responseMimeType, "application/json");
    assert.deepStrictEqual(cfg.responseSchema.properties.category.enum, [
      "coding",
      "deep_reasoning",
      "simple",
      "general",
    ]);
    assert.deepStrictEqual(cfg.responseSchema.required, ["category"]);
  });

  it("pins temperature to 0 so the same prompt routes the same way", () => {
    // A nondeterministic router makes cost and entitlement behaviour irreproducible
    // between two identical demo runs.
    assert.strictEqual(runPrepRouter("hello").parsed.generationConfig.temperature, 0.0);
  });

  it("truncates a long prompt to bound classification latency", () => {
    const long = "x".repeat(5000);
    const { parsed } = runPrepRouter(long);
    const sent = parsed.contents[0].parts[0].text;
    assert.ok(sent.length < 2000, `classifier prompt should be bounded, got ${sent.length}`);
    assert.ok(!sent.includes("x".repeat(501)), "prompt excerpt should be capped at 500 chars");
  });

  it("emits a payload that is valid JSON for the AssignMessage template", () => {
    // AM-PrepRouterRequest injects this verbatim as the callout body. A prompt carrying
    // quotes or newlines must not be able to break out of the JSON envelope.
    const { payload } = runPrepRouter('He said "hi"\nthen {left};');
    assert.doesNotThrow(() => JSON.parse(payload));
  });
});

describe("API products back the routing attributes the policy reads", () => {
  const productsDir = path.resolve(__dirname, "../../apigee/products");

  for (const [productName, expected] of Object.entries(PRODUCT_ROUTING)) {
    const file = productName === "Enterprise AI Tier" ? "enterprise_ai_tier.json" : "standard_ai_tier.json";

    it(`${file} declares every routing.model.* attribute the router can emit`, () => {
      const data = JSON.parse(fs.readFileSync(path.join(productsDir, file), "utf8"));
      const attrs = Object.fromEntries(data.attributes.map((a) => [a.name, a.value]));

      for (const [category, model] of Object.entries(expected)) {
        assert.strictEqual(
          attrs[`routing.model.${category}`],
          model,
          `${file} must map routing.model.${category} to ${model}`
        );
      }
    });

    it(`${file} only routes to models it actually entitles`, () => {
      // An attribute pointing at a model the product does not grant would route the call
      // straight into a 401 at VA-VerifyAPIKey on the downstream operation.
      const data = JSON.parse(fs.readFileSync(path.join(productsDir, file), "utf8"));
      const granted = new Set(
        data.llmOperationGroup.operationConfigs.flatMap((oc) => oc.llmOperations.map((op) => op.model))
      );

      for (const [category, model] of Object.entries(expected)) {
        assert.ok(
          granted.has(model),
          `${file} maps ${category} to ${model}, which the product does not entitle`
        );
      }
    });
  }
});
