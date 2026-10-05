// Converts Anthropic Claude response to standard Gemini candidates structure
// if flow.convert_claude_to_gemini_resp is true
try {
  var needConversion = context.getVariable("flow.convert_claude_to_gemini_resp");
  if (needConversion === "true" || needConversion === true) {
    var respContent = context.getVariable("response.content") || "";
    if (respContent) {
      var claudeJson = JSON.parse(respContent);
      if (claudeJson.content && Array.isArray(claudeJson.content)) {
        var textResult = "";
        for (var i = 0; i < claudeJson.content.length; i++) {
          if (claudeJson.content[i].type === "text" && claudeJson.content[i].text) {
            textResult += claudeJson.content[i].text;
          }
        }
        var promptTokens = (claudeJson.usage && claudeJson.usage.input_tokens) || 0;
        var compTokens = (claudeJson.usage && claudeJson.usage.output_tokens) || 0;
        var geminiCandidate = {
          candidates: [
            {
              content: {
                role: "model",
                parts: [
                  {
                    text: textResult
                  }
                ]
              },
              finishReason: "STOP"
            }
          ],
          usageMetadata: {
            promptTokenCount: promptTokens,
            candidatesTokenCount: compTokens,
            totalTokenCount: promptTokens + compTokens,
            trafficType: "ON_DEMAND"
          },
          modelVersion: claudeJson.model || context.getVariable("flow.target_model") || "claude-opus-4-5"
        };
        context.setVariable("response.content", JSON.stringify(geminiCandidate));
      }
    }
  }
} catch (e) {
  // Continue without conversion on failure
}
