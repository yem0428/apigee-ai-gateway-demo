// Dedicated intelligent auto-routing engine
// Leverages gemini-3.1-flash-lite router model and API Product custom attributes
// with resilient fallback heuristics to select the optimal model

var userPrompt = context.getVariable("flow.userPrompt") || "";
var category = null;

// Helper to extract category from candidate JSON text
function extractCategory(raw) {
  if (!raw) return null;
  var cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    var obj = JSON.parse(cleaned);
    if (obj && obj.category) {
      return String(obj.category).toLowerCase().trim();
    }
  } catch (e) {
    var m = cleaned.match(/"category"\s*:\s*"([^"]+)"/i);
    if (m && m[1]) {
      return m[1].toLowerCase().trim();
    }
  }
  return null;
}

// 1. Inspect response from gemini-3.1-flash-lite ServiceCallout (SC-ModelRouter)
try {
  var routerResponseContent = context.getVariable("routerResponse.content");
  if (routerResponseContent) {
    var parsedResp = JSON.parse(routerResponseContent);
    if (parsedResp.candidates && parsedResp.candidates.length > 0) {
      var cand = parsedResp.candidates[0];
      if (cand.content && cand.content.parts && cand.content.parts.length > 0) {
        category = extractCategory(cand.content.parts[0].text);
      }
    }
  }
} catch (e) {
  // ServiceCallout failed, timed out, or response was unparseable
}

// 2. Resilient fallback heuristics if router model response is unavailable
if (!category) {
  var isCoding = /def |class |function |import |const |let |var |SELECT |FROM |WHERE |UPDATE |INSERT |DELETE |```|code|refactor|regex|async /i.test(userPrompt);
  var isDeepReasoning = /compare|architect|deep|reasoning|evaluate|trade-off|multi-step|benchmark|optimize|root cause/i.test(userPrompt);
  var isSimple = userPrompt.length < 200 && !isCoding && !isDeepReasoning;

  if (isCoding) {
    category = "coding";
  } else if (isDeepReasoning) {
    category = "deep_reasoning";
  } else if (isSimple) {
    category = "simple";
  } else {
    category = "general";
  }
}

// 3. Resolve target model dynamically from the API Product custom attributes:
// verifyapikey.VA-VerifyAPIKey.apiproduct.routing.model.<category>
var targetModel = null;
if (category) {
  targetModel = context.getVariable("verifyapikey.VA-VerifyAPIKey.apiproduct.routing.model." + category);
}

// Fallback to general category model attribute if specific category attribute is missing
if (!targetModel) {
  targetModel = context.getVariable("verifyapikey.VA-VerifyAPIKey.apiproduct.routing.model.general");
}

// Tier resolution for tracing and fallback if product carries no custom attributes
var productName = (context.getVariable("verifyapikey.VA-VerifyAPIKey.apiproduct.name") || "").toLowerCase();
var isEnterprise = productName.indexOf("enterprise") !== -1;
var isStandard = !isEnterprise;

context.setVariable("flow.routingTier", isEnterprise ? "enterprise" : "standard");

// Fallback if neither custom attribute was resolved
if (!targetModel) {
  if (isStandard) {
    targetModel = (category === "simple") ? "gemini-3.1-flash-lite" : "gemini-3-flash-preview";
  } else {
    if (category === "coding") {
      targetModel = "claude-opus-4-5@20251101";
    } else if (category === "deep_reasoning") {
      targetModel = "gemini-3.1-pro-preview";
    } else if (category === "simple") {
      targetModel = "gemini-3.1-flash-lite";
    } else {
      targetModel = "gemini-3-flash-preview";
    }
  }
}

var targetProvider = (targetModel.indexOf("claude") !== -1) ? "anthropic" : "google";

// Routing selects a MODEL and nothing else. It deliberately does not set
// flow.costTier: cost is derived downstream by CalculateCost.js from the rate
// resolved out of the ai-model-rates KVM, which is the single source of truth.
context.setVariable("flow.routerCategory", category);
context.setVariable("flow.target_model", targetModel);
context.setVariable("flow.model", targetModel);
context.setVariable("flow.target_provider", targetProvider);
context.setVariable("flow.autoRouted", "true");
