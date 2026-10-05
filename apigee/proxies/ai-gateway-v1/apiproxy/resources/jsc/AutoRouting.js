// Dedicated intelligent auto-routing engine
// Leverages gemini-3.1-flash-lite router model and API Product custom attributes
// to dynamically select the optimal model

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


// 2. Check Caller Context: Human Developer vs Unattended Agent (Subagent)
//    - x-subagent-name (e.g., "subagent:code-worker") identifies an unattended background agent
//    - x-gateway-override-mode ("auto-override" | "confirmed-switch" | "confirmed-keep")
var subagentName = context.getVariable("request.header.x-subagent-name") || "";
var overrideMode = context.getVariable("request.header.x-gateway-override-mode") || "";
var requestedModel = context.getVariable("flow.model") || "";

var targetModel = null;

// Case A: Unattended Subagent Policy Auto-Override (No human prompt possible -> instant model assignment)
if (overrideMode === "auto-override" || (subagentName && requestedModel.indexOf("claude-opus") !== -1)) {
  if (category === "coding") {
    // Route subagent coding tasks on expensive Opus to DeepSeek-V4 on Vertex Dedicated Tenancy (98.2% savings)
    targetModel = "deepseek-v4";
  } else {
    // Route subagent simple/lookup tasks to ultra-fast Gemini 3.1 Flash-Lite (99.5% savings)
    targetModel = "gemini-3.1-flash-lite-preview";
  }
  context.setVariable("flow.overrideReason", "Unattended Subagent Auto-Override (" + (subagentName || "agent") + ")");
}

// Case B: Standard /auto Dynamic Routing via API Product Custom Attributes
// verifyapikey.VA-VerifyAPIKey.apiproduct.routing.model.<category>
if (!targetModel && category) {
  targetModel = context.getVariable("verifyapikey.VA-VerifyAPIKey.apiproduct.routing.model." + category);
}

// Fallback to general category model attribute if specific category attribute is missing
if (!targetModel) {
  targetModel = context.getVariable("verifyapikey.VA-VerifyAPIKey.apiproduct.routing.model.general") || "gemini-2.5-flash";
}
if (targetModel === "gemini-3.1-flash-lite") {
  targetModel = "gemini-3.1-flash-lite-preview";
} else if (targetModel === "gemini-3.1-pro") {
  targetModel = "gemini-3.1-pro-preview";
}

var productName = (context.getVariable("verifyapikey.VA-VerifyAPIKey.apiproduct.name") || "").toLowerCase();
context.setVariable("flow.routingTier", productName.indexOf("enterprise") !== -1 ? "enterprise" : "standard");

var targetProvider = "google";
if (targetModel && targetModel.indexOf("claude") !== -1) {
  targetProvider = "anthropic";
} else if (targetModel && (targetModel.indexOf("deepseek") !== -1 || targetModel.indexOf("kimi") !== -1 || targetModel.indexOf("glm") !== -1)) {
  targetProvider = "vertex-oss";
}

// Routing selects a MODEL and nothing else. It deliberately does not set
// flow.costTier: cost is derived downstream by CalculateCost.js from the rate
// resolved out of the ai-model-rates KVM, which is the single source of truth.
context.setVariable("flow.routerCategory", category);
context.setVariable("flow.target_model", targetModel);
context.setVariable("flow.model", targetModel);
context.setVariable("flow.target_provider", targetProvider);
context.setVariable("flow.autoRouted", "true");

