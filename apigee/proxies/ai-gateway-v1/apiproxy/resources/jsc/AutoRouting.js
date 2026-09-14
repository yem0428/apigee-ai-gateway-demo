// Dedicated intelligent auto-routing engine
// Analyzes prompt content, complexity, coding indicators, and product tier to select the optimal model

var userPrompt = context.getVariable("flow.userPrompt") || "";
var tier = context.getVariable("verifyapikey.VA-VerifyAPIKey.tier") || "";
var productName = context.getVariable("verifyapikey.VA-VerifyAPIKey.apiproduct.name") || "";
var isStandard = (tier.toLowerCase() === "standard") || (productName.toLowerCase().indexOf("standard") !== -1);

// Heuristic pattern matchers
var isCoding = /def |class |function |import |const |let |var |SELECT |FROM |WHERE |UPDATE |INSERT |DELETE |```|refactor|regex|async /i.test(userPrompt);
var isDeepReasoning = /compare|architect|deep|reasoning|evaluate|trade-off|multi-step|benchmark|optimize|root cause/i.test(userPrompt);
var isSimple = userPrompt.length < 200 && !isCoding && !isDeepReasoning;

var targetModel = "gemini-3-flash";
var targetProvider = "google";
var costTier = "medium";

if (isStandard) {
  // Standard product tier: constrained to flash models
  if (isSimple) {
    targetModel = "gemini-3.1-flash-lite";
    targetProvider = "google";
    costTier = "low";
  } else {
    targetModel = "gemini-3-flash";
    targetProvider = "google";
    costTier = "medium";
  }
} else {
  // Enterprise tier: intelligent multi-provider routing
  if (isCoding) {
    targetModel = "claude-opus-4-5@20251101";
    targetProvider = "anthropic";
    costTier = "high";
  } else if (isDeepReasoning) {
    targetModel = "gemini-3.1-pro-preview";
    targetProvider = "google";
    costTier = "high";
  } else if (isSimple) {
    targetModel = "gemini-3.1-flash-lite";
    targetProvider = "google";
    costTier = "low";
  } else {
    targetModel = "gemini-3-flash";
    targetProvider = "google";
    costTier = "medium";
  }
}

context.setVariable("flow.target_model", targetModel);
context.setVariable("flow.model", targetModel);
context.setVariable("flow.target_provider", targetProvider);
context.setVariable("flow.autoRouted", "true");
context.setVariable("flow.costTier", costTier);
