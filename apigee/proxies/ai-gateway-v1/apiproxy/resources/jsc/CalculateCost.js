// Real-time micro-dollar cost calculation per model rate card
var promptTokens = parseInt(context.getVariable("flow.promptTokenCount") || context.getVariable("flow.claudePromptTokens") || "0", 10);
var candidateTokens = parseInt(context.getVariable("flow.candidatesTokenCount") || context.getVariable("flow.claudeCandidatesTokens") || "0", 10);

// Thinking ("thoughts") tokens are billed by Vertex at the OUTPUT rate but are reported
// separately from candidatesTokenCount. Ignoring them badly understates cost on reasoning
// models: a gemini-3.7-flash call measured 7 prompt / 1 candidate / 84 thoughts, so charging
// only prompt+candidates billed 8 tokens out of 92 actually consumed.
var thoughtTokens = parseInt(context.getVariable("flow.thoughtsTokenCount") || "0", 10);
if (isNaN(thoughtTokens) || thoughtTokens < 0) { thoughtTokens = 0; }

var completionTokens = candidateTokens + thoughtTokens;

// Prefer the provider's own total when it is present and at least as large as our sum — it is
// authoritative and covers any future token category we do not yet break out. Never let it
// shrink the figure below what we can already account for.
var reportedTotal = parseInt(context.getVariable("flow.totalTokenCount") || "0", 10);
var totalTokens = promptTokens + completionTokens;
if (!isNaN(reportedTotal) && reportedTotal > totalTokens) {
  totalTokens = reportedTotal;
}

var model = context.getVariable("flow.target_model") || context.getVariable("flow.model") || "gemini-3-flash-preview";
var modelNormalized = model.toLowerCase().trim();

var inputRate = null;
var outputRate = null;

// 1. Try resolving rate card dynamically from Apigee KVM (flow.model_rates_json)
var kvmRatesJson = context.getVariable("flow.model_rates_json");
if (kvmRatesJson) {
  try {
    var rateCard = (typeof kvmRatesJson === "string") ? JSON.parse(kvmRatesJson) : kvmRatesJson;
    
    // Exact match
    if (rateCard[modelNormalized] && rateCard[modelNormalized].input !== undefined) {
      inputRate = parseFloat(rateCard[modelNormalized].input);
      outputRate = parseFloat(rateCard[modelNormalized].output);
    }
    
    // Strip '@version' suffix (e.g. claude-opus-4-5@20251101 -> claude-opus-4-5)
    if (inputRate === null && modelNormalized.indexOf("@") !== -1) {
      var baseModel = modelNormalized.split("@")[0];
      if (rateCard[baseModel] && rateCard[baseModel].input !== undefined) {
        inputRate = parseFloat(rateCard[baseModel].input);
        outputRate = parseFloat(rateCard[baseModel].output);
      }
    }
    
    // Fallback matching for known model prefixes
    if (inputRate === null) {
      var prefixes = [
        "gemini-3.1-flash-lite", "gemini-3-flash-preview",
        "gemini-3.7-flash", "gemini-3.8-flash",
        "gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-2.5-flash",
        "claude-opus-4-5", "claude-opus",
        "claude-haiku-4-5"
      ];
      for (var i = 0; i < prefixes.length; i++) {
        if (modelNormalized.indexOf(prefixes[i]) !== -1 && rateCard[prefixes[i]]) {
          inputRate = parseFloat(rateCard[prefixes[i]].input);
          outputRate = parseFloat(rateCard[prefixes[i]].output);
          break;
        }
      }
    }
    
    // Default fallback from KVM
    if (inputRate === null && rateCard["default"]) {
      inputRate = parseFloat(rateCard["default"].input);
      outputRate = parseFloat(rateCard["default"].output);
    }
  } catch (e) {
    // If KVM JSON parsing fails, gracefully drop through to propertyset fallback
  }
}

// 2. Fallback to propertyset.model_rates (if KVM rate not found or KVM not populated)
if (inputRate === null || isNaN(inputRate)) {
  var inputRateStr = context.getVariable("propertyset.model_rates." + modelNormalized + ".input");
  var outputRateStr = context.getVariable("propertyset.model_rates." + modelNormalized + ".output");

  if (!inputRateStr && modelNormalized.indexOf("@") !== -1) {
    var base = modelNormalized.split("@")[0];
    inputRateStr = context.getVariable("propertyset.model_rates." + base + ".input");
    outputRateStr = context.getVariable("propertyset.model_rates." + base + ".output");
  }

  if (!inputRateStr) {
    var prefixes2 = [
      "gemini-3.1-flash-lite", "gemini-3-flash-preview",
      "gemini-3.7-flash", "gemini-3.8-flash",
      "gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-2.5-flash",
      "claude-opus-4-5", "claude-opus",
      "claude-haiku-4-5"
    ];
    for (var j = 0; j < prefixes2.length; j++) {
      if (modelNormalized.indexOf(prefixes2[j]) !== -1) {
        inputRateStr = context.getVariable("propertyset.model_rates." + prefixes2[j] + ".input");
        outputRateStr = context.getVariable("propertyset.model_rates." + prefixes2[j] + ".output");
        if (inputRateStr) break;
      }
    }
  }

  if (!inputRateStr) {
    inputRateStr = context.getVariable("propertyset.model_rates.default.input") || "0.15";
  }
  if (!outputRateStr) {
    outputRateStr = context.getVariable("propertyset.model_rates.default.output") || "0.60";
  }

  inputRate = parseFloat(inputRateStr);
  outputRate = parseFloat(outputRateStr);
}

// Ensure valid numeric rates
if (isNaN(inputRate)) inputRate = 0.15;
if (isNaN(outputRate)) outputRate = 0.60;

// Cost tier — the ONLY place it is set. Always derived from the resolved OUTPUT
// RATE, never from the model name and never from an upstream literal:
// gemini-3.7-flash and gemini-3.8-flash bill at 7.50, above gemini-3.1-pro-preview's
// 5.00, so any name-based guess would label them cheap. Deriving it here means a
// reprice in the ai-model-rates KVM moves the tier with no code change.
var derivedTier = "medium";
if (outputRate >= 5.0) { derivedTier = "high"; }
else if (outputRate <= 0.30) { derivedTier = "low"; }
context.setVariable("flow.costTier", derivedTier);

// A semantic-cache hit never reached a model, so it costs nothing. It still gets a
// tier above, because the tier describes the model that WOULD have served it and the
// UI reads x-gateway-cost-tier on every response.
var isCached = String(context.getVariable("flow.cached") || "") === "true";
if (isCached) {
  context.setVariable("flow.tx_cost_usd", "0.000000");
  // Explicitly zero, not the Math.max(1, ...) floor applied to real calls.
  context.setVariable("flow.tx_cost_micros", "0");
  // Deliberately leave the token variables and the monetization block untouched:
  // DC-ModelAnalytics runs on cache hits too, and rewriting them here would change
  // what a hit reports today. QC-DeductBudget stays excluded on hits in default.xml.
} else {
  var inputCost = (promptTokens / 1000000.0) * inputRate;
  var outputCost = (completionTokens / 1000000.0) * outputRate;
  var totalCostUSD = inputCost + outputCost;

  // Integer micro-dollars (1 USD = 1,000,000 micro-dollars) for Apigee Quota deduction
  var costMicros = Math.max(1, Math.round(totalCostUSD * 1000000));

  context.setVariable("flow.promptTokenCount", promptTokens.toString());
  context.setVariable("flow.candidatesTokenCount", completionTokens.toString());
  context.setVariable("flow.totalTokenCount", totalTokens.toString());
  context.setVariable("flow.thoughtsTokenCount", thoughtTokens.toString());
  context.setVariable("flow.tx_cost_usd", totalCostUSD.toFixed(6));
  context.setVariable("flow.tx_cost_micros", costMicros.toString());

  // Apigee Monetization Rating Engine variables
  // Rate plans have base fee = $0.001 USD (1,000,000 nanos).
  // Since Charged Amount = Base Fee ($0.001) * perUnitPriceMultiplier,
  // perUnitPriceMultiplier must be totalCostUSD * 1000 so that $0.001 * (totalCostUSD * 1000) = totalCostUSD.
  var ratePlanMultiplier = totalCostUSD * 1000.0;
  context.setVariable("perUnitPriceMultiplier", ratePlanMultiplier.toFixed(6));
  context.setVariable("currency", "USD");
  context.setVariable("transactionSuccess", "true");

  // Compute estimated remaining prepaid wallet balance
  var initialBalanceStr = context.getVariable("mint.limitscheck.prepaid_developer_balance");
  if (initialBalanceStr) {
    var initialBal = parseFloat(initialBalanceStr);
    if (!isNaN(initialBal)) {
      var remBal = Math.max(0, initialBal - totalCostUSD);
      context.setVariable("flow.prepaid_balance_remaining", remBal.toFixed(6));
    }
  }
}
