import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const autoRoutingPath = path.resolve(__dirname, "../../apigee/proxies/ai-gateway-v1/apiproxy/resources/jsc/AutoRouting.js");
const autoRoutingCode = fs.readFileSync(autoRoutingPath, "utf8");

/**
 * Helper to execute AutoRouting.js in an isolated Node vm sandbox simulating Apigee JSC context.
 */
function runAutoRouting({ userPrompt = "", tier = "", productName } = {}) {
  // The gateway carries NO custom attributes. The routing tier is derived from
  // the API PRODUCT NAME alone, so `tier` here is a convenience that synthesises
  // the matching product name. Pass `productName` explicitly to control it.
  const resolvedProductName =
    productName !== undefined ? productName : tier ? `${tier} AI Tier` : "";

  const variables = {
    "flow.userPrompt": userPrompt,
    // Both custom-attribute forms are deliberately left populated. The policy
    // must NOT read either of them; the "ignores custom attributes" test below
    // fails loudly if a change starts depending on them again.
    "verifyapikey.VA-VerifyAPIKey.apiproduct.tier": tier,
    "verifyapikey.VA-VerifyAPIKey.tier": tier,
    "verifyapikey.VA-VerifyAPIKey.apiproduct.name": resolvedProductName,
  };

  const context = {
    getVariable: (name) => (variables[name] !== undefined ? variables[name] : null),
    setVariable: (name, val) => {
      variables[name] = val;
    },
  };

  const sandbox = {
    context,
    console,
  };

  vm.createContext(sandbox);
  vm.runInContext(autoRoutingCode, sandbox);

  return {
    targetModel: variables["flow.target_model"],
    model: variables["flow.model"],
    targetProvider: variables["flow.target_provider"],
    autoRouted: variables["flow.autoRouted"],
    costTier: variables["flow.costTier"],
    routingTier: variables["flow.routingTier"],
    allVars: variables,
  };
}

describe("AutoRouting.js - Unit Test Suite", () => {
  describe("1. Enterprise Tier (Default / Multi-Provider Routing)", () => {
    describe("Coding Heuristics -> claude-opus-4-5@20251101 (anthropic / high)", () => {
      const codingPrompts = [
        { label: "Python def", prompt: "def calculate_discount(price, rate): return price * (1 - rate)" },
        { label: "Python class", prompt: "class TransactionManager: pass" },
        { label: "JavaScript function", prompt: "function computeHash(payload) { return sha256(payload); }" },
        { label: "Import statement", prompt: "import { useState, useEffect } from \"react\";" },
        { label: "const declaration", prompt: "const MAX_RETRIES = 5;" },
        { label: "let declaration", prompt: "let currentIndex = 0;" },
        { label: "var declaration", prompt: "var token = getAuthToken();" },
        { label: "SQL SELECT", prompt: "SELECT id, email, status FROM users WHERE status = \"active\"" },
        { label: "SQL FROM and WHERE", prompt: "Extract records FROM orders WHERE total > 1000" },
        { label: "SQL UPDATE", prompt: "UPDATE accounts SET balance = balance - 50" },
        { label: "SQL INSERT", prompt: "INSERT INTO audit_log (action) VALUES (\"LOGIN\")" },
        { label: "SQL DELETE", prompt: "DELETE FROM session_cache WHERE expired = true" },
        { label: "Markdown code fence", prompt: "Here is the snippet: ```json {\"enabled\": true} ```" },
        { label: "Refactor keyword", prompt: "Please refactor this service layer to use dependency injection" },
        { label: "Regex keyword", prompt: "Help me write a regex to validate international phone numbers" },
        { label: "Async keyword", prompt: "async function fetchCustomerProfile(id) { return await api.get(id); }" },
      ];

      for (const { label, prompt } of codingPrompts) {
        it(`routes ${label} to Claude Opus 4.5`, () => {
          const res = runAutoRouting({ userPrompt: prompt, tier: "enterprise" });
          assert.strictEqual(res.targetModel, "claude-opus-4-5@20251101");
          assert.strictEqual(res.targetProvider, "anthropic");
          assert.strictEqual(res.costTier, "high");
          assert.strictEqual(res.autoRouted, "true");
        });
      }
    });

    describe("Deep Reasoning Heuristics -> gemini-3.1-pro-preview (google / high)", () => {
      const deepPrompts = [
        { label: "compare keyword", prompt: "Compare Apache Kafka and Google Cloud Pub/Sub for event streaming" },
        { label: "architect keyword", prompt: "Help me architect a fault-tolerant multi-region payment gateway" },
        { label: "deep keyword", prompt: "Conduct a deep investigation into GC pause time spikes in Go services" },
        { label: "reasoning keyword", prompt: "Provide step-by-step reasoning for resolving this distributed consensus bug" },
        { label: "evaluate keyword", prompt: "Evaluate the security risks of third-party MCP tool integrations" },
        { label: "trade-off keyword", prompt: "Explain the consistency vs latency trade-off in distributed storage" },
        { label: "multi-step keyword", prompt: "Outline a multi-step migration strategy to split a monolithic database into sharded tables" },
        { label: "benchmark keyword", prompt: "Design a load benchmark experiment for 100,000 requests per second" },
        { label: "optimize keyword", prompt: "How do we optimize vector similarity search across 10 million embeddings?" },
        { label: "root cause keyword", prompt: "Determine the root cause of connection pool exhaustion under load" },
      ];

      for (const { label, prompt } of deepPrompts) {
        it(`routes ${label} to Gemini 3.1 Pro Preview`, () => {
          const res = runAutoRouting({ userPrompt: prompt, tier: "enterprise" });
          assert.strictEqual(res.targetModel, "gemini-3.1-pro-preview");
          assert.strictEqual(res.targetProvider, "google");
          assert.strictEqual(res.costTier, "high");
          assert.strictEqual(res.autoRouted, "true");
        });
      }
    });

    describe("Simple Prompts -> gemini-3.1-flash-lite (google / low)", () => {
      const simplePrompts = [
        "Hi!",
        "What is the capital of Japan?",
        "Tell me a one-line joke.",
        "Summarize this sentence in 3 words: The sky is blue and clear today.",
        "Translate hello to Spanish.",
      ];

      for (const prompt of simplePrompts) {
        it(`routes simple prompt "${prompt}" to Gemini 3.1 Flash Lite`, () => {
          const res = runAutoRouting({ userPrompt: prompt, tier: "enterprise" });
          assert.strictEqual(res.targetModel, "gemini-3.1-flash-lite");
          assert.strictEqual(res.targetProvider, "google");
          assert.strictEqual(res.costTier, "low");
          assert.strictEqual(res.autoRouted, "true");
        });
      }
    });

    describe("General Complex Prompts (>= 200 chars, no code, no deep reasoning) -> gemini-3-flash-preview (google / medium)", () => {
      it("routes general lengthy paragraph to Gemini 3 Flash", () => {
        const longPrompt =
          "The quick brown fox jumps over the lazy dog repeatedly until evening shadows settle across the ancient hills. " +
          "All creatures gather silently to witness such extraordinary agility, boundless endurance, and calm harmony " +
          "in the pristine forest canopy.";
        assert.ok(longPrompt.length >= 200, "Prompt must be at least 200 characters");

        const res = runAutoRouting({ userPrompt: longPrompt, tier: "enterprise" });
        assert.strictEqual(res.targetModel, "gemini-3-flash-preview");
        assert.strictEqual(res.targetProvider, "google");
        assert.strictEqual(res.costTier, "medium");
        assert.strictEqual(res.autoRouted, "true");
      });
    });

    describe("Precedence Order (Coding beats Deep Reasoning in Enterprise)", () => {
      it("routes prompt with both coding and reasoning keywords to Claude Opus", () => {
        const combinedPrompt = "Architect an event pipeline and provide the Python code: def handle_message(msg): pass";
        const res = runAutoRouting({ userPrompt: combinedPrompt, tier: "enterprise" });
        assert.strictEqual(res.targetModel, "claude-opus-4-5@20251101");
        assert.strictEqual(res.targetProvider, "anthropic");
        assert.strictEqual(res.costTier, "high");
      });
    });
  });

  describe("2. Standard Tier (Budget Constrained to Flash Models)", () => {
    it("routes simple query to Gemini 3.1 Flash Lite (low cost tier)", () => {
      const res = runAutoRouting({ userPrompt: "What time is it in Tokyo?", tier: "standard" });
      assert.strictEqual(res.targetModel, "gemini-3.1-flash-lite");
      assert.strictEqual(res.targetProvider, "google");
      assert.strictEqual(res.costTier, "low");
    });

    it("constrains coding prompt to Gemini 3 Flash (medium cost tier, NOT Opus)", () => {
      const res = runAutoRouting({
        userPrompt: "def calculate_sum(a, b): return a + b",
        tier: "standard",
      });
      assert.strictEqual(res.targetModel, "gemini-3-flash-preview");
      assert.strictEqual(res.targetProvider, "google");
      assert.strictEqual(res.costTier, "medium");
    });

    it("constrains deep reasoning prompt to Gemini 3 Flash (medium cost tier, NOT Pro)", () => {
      const res = runAutoRouting({
        userPrompt: "Compare and architect the trade-offs of microservices",
        tier: "standard",
      });
      assert.strictEqual(res.targetModel, "gemini-3-flash-preview");
      assert.strictEqual(res.targetProvider, "google");
      assert.strictEqual(res.costTier, "medium");
    });

    it("routes long general prompt (>= 200 chars) to Gemini 3 Flash", () => {
      const longPrompt =
        "The quick brown fox jumps over the lazy dog repeatedly until the evening settles over the valley. " +
        "Every single creature in the forest observes the graceful jumps and wonders what motivates such agility " +
        "and boundless energy.";
      assert.ok(longPrompt.length >= 200);

      const res = runAutoRouting({ userPrompt: longPrompt, tier: "standard" });
      assert.strictEqual(res.targetModel, "gemini-3-flash-preview");
      assert.strictEqual(res.targetProvider, "google");
      assert.strictEqual(res.costTier, "medium");
    });
  });

  describe("3. Tier Detection Flexibility & Edge Cases", () => {
    it("detects standard tier from a case-insensitive product name", () => {
      const res = runAutoRouting({ userPrompt: "def test(): pass", tier: "STANDARD" });
      assert.strictEqual(res.targetModel, "gemini-3-flash-preview", "Should constrain to flash model");
    });

    it("detects standard tier from product name containing \"standard\"", () => {
      const res = runAutoRouting({
        userPrompt: "def test(): pass",
        tier: "",
        productName: "Apigee-Standard-AI-Product",
      });
      assert.strictEqual(res.targetModel, "gemini-3-flash-preview", "Should constrain to flash model");
    });

    it("fails CLOSED to standard when the product name is blank", () => {
      // Security regression guard. An unresolved entitlement must never hand
      // out the premium multi-provider models. A coding prompt that would route
      // to Opus under enterprise must be constrained to flash here.
      const res = runAutoRouting({ userPrompt: "def test(): pass", tier: "", productName: "" });
      assert.strictEqual(res.targetModel, "gemini-3-flash-preview", "Unknown tier must not reach Opus");
      assert.strictEqual(res.targetProvider, "google");
      assert.strictEqual(res.routingTier, "standard");
    });

    it("routes enterprise multi-provider when the product is an enterprise product", () => {
      const res = runAutoRouting({ userPrompt: "def test(): pass", tier: "enterprise" });
      assert.strictEqual(res.targetModel, "claude-opus-4-5@20251101");
      assert.strictEqual(res.targetProvider, "anthropic");
      assert.strictEqual(res.routingTier, "enterprise");
    });

    it("detects enterprise tier from the product name alone", () => {
      const res = runAutoRouting({
        userPrompt: "def test(): pass",
        tier: "",
        productName: "Enterprise AI Tier",
      });
      assert.strictEqual(res.targetModel, "claude-opus-4-5@20251101");
      assert.strictEqual(res.routingTier, "enterprise");
    });

    it("ignores custom attributes entirely and trusts only the product name", () => {
      // The products carry no custom attributes any more. Both legacy `tier`
      // variables are set to "enterprise" here while the PRODUCT is standard.
      // If the policy regressed to reading either attribute, a standard caller
      // would be escalated to the premium multi-provider models.
      const res = runAutoRouting({
        userPrompt: "def test(): pass",
        tier: "enterprise",
        productName: "Standard AI Tier",
      });
      assert.strictEqual(res.targetModel, "gemini-3-flash-preview");
      assert.strictEqual(res.targetProvider, "google");
      assert.strictEqual(res.routingTier, "standard");
    });

    it("handles empty prompt gracefully as simple prompt", () => {
      const res = runAutoRouting({ userPrompt: "", tier: "enterprise" });
      assert.strictEqual(res.targetModel, "gemini-3.1-flash-lite");
      assert.strictEqual(res.targetProvider, "google");
      assert.strictEqual(res.costTier, "low");
    });

    it("verifies all expected context variables are populated", () => {
      const res = runAutoRouting({ userPrompt: "Hello", tier: "enterprise" });
      assert.ok(res.allVars["flow.target_model"]);
      assert.ok(res.allVars["flow.model"]);
      assert.ok(res.allVars["flow.target_provider"]);
      assert.strictEqual(res.allVars["flow.autoRouted"], "true");
      assert.ok(res.allVars["flow.costTier"]);
    });
  });
});
