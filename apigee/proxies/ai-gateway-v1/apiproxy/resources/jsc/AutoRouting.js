// Dedicated intelligent auto-routing engine
// Analyzes prompt content, complexity, coding indicators, and product tier to select the optimal model

var userPrompt = context.getVariable("flow.userPrompt") || "";

// Tier resolution. The tier is derived from the API PRODUCT NAME so the demo
// carries no custom attributes: any product whose name contains "enterprise"
// gets the premium routing branch.
var productName = (context.getVariable("verifyapikey.VA-VerifyAPIKey.apiproduct.name") || "").toLowerCase();

// Fail CLOSED. Premium routing (Pro / Opus) requires a positive enterprise
// signal. If the product cannot be determined we downgrade to the constrained
// Standard branch rather than handing out the expensive models by default.
var isEnterprise = productName.indexOf("enterprise") !== -1;
var isStandard = !isEnterprise;

// Exposed for tracing so a downgrade caused by unresolved entitlement is
// visible rather than silent.
context.setVariable("flow.routingTier", isEnterprise ? "enterprise" : "standard");

// Heuristic pattern matchers
var isCoding = /def |class |function |import |const |let |var |SELECT |FROM |WHERE |UPDATE |INSERT |DELETE |```|code|refactor|regex|async /i.test(userPrompt);
var isDeepReasoning = /compare|architect|deep|reasoning|evaluate|trade-off|multi-step|benchmark|optimize|root cause/i.test(userPrompt);
var isSimple = userPrompt.length < 200 && !isCoding && !isDeepReasoning;

// Routing selects a MODEL and nothing else. It deliberately does not set
// flow.costTier: cost is derived downstream by CalculateCost.js from the rate
// resolved out of the ai-model-rates KVM, which is the single source of truth.
// A literal set here would win over the KVM on the /auto path and drift
// silently the moment a model is repriced.
var targetModel = "gemini-3-flash-preview";
var targetProvider = "google";


if (isStandard) {
  // Standard product tier: constrained to flash models
  if (isSimple) {
    targetModel = "gemini-3.1-flash-lite";
    targetProvider = "google";
  } else {
    targetModel = "gemini-3-flash-preview";
    targetProvider = "google";
  }
} else {
  // Enterprise tier: intelligent multi-provider routing
  if (isCoding) {
    targetModel = "claude-opus-4-5@20251101";
    targetProvider = "anthropic";
  } else if (isDeepReasoning) {
    targetModel = "gemini-3.1-pro-preview";
    targetProvider = "google";
  } else if (isSimple) {
    targetModel = "gemini-3.1-flash-lite";
    targetProvider = "google";
  } else {
    targetModel = "gemini-3-flash-preview";
    targetProvider = "google";
  }
}

context.setVariable("flow.target_model", targetModel);
context.setVariable("flow.model", targetModel);
context.setVariable("flow.target_provider", targetProvider);
context.setVariable("flow.autoRouted", "true");
