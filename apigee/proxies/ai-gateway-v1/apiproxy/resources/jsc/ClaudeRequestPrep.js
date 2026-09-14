// Prepares request payload for Anthropic Claude on Vertex Model Garden
try {
  var targetModel = context.getVariable("flow.target_model") || context.getVariable("flow.model") || "";
  if (!targetModel || targetModel.indexOf("claude-3-5-sonnet") !== -1 || targetModel.indexOf("claude-default") !== -1) {
    targetModel = "claude-opus-4-5@20251101";
  }
  context.setVariable("flow.target_model", targetModel);

  var rawContent = context.getVariable("request.content") || "";
  if (rawContent) {
    var body = JSON.parse(rawContent);

    // 1. If payload is in Gemini format (contents), convert to Claude messages format
    if (body.contents && Array.isArray(body.contents)) {
      var claudeMessages = [];
      for (var c = 0; c < body.contents.length; c++) {
        var item = body.contents[c];
        var role = (item.role === "model") ? "assistant" : "user";
        var textParts = [];
        if (item.parts && Array.isArray(item.parts)) {
          for (var p = 0; p < item.parts.length; p++) {
            if (item.parts[p] && item.parts[p].text) {
              textParts.push(item.parts[p].text);
            }
          }
        }
        claudeMessages.push({
          role: role,
          content: textParts.join(" ")
        });
      }

      var claudePayload = {
        anthropic_version: "vertex-2023-10-16",
        messages: claudeMessages,
        max_tokens: 1024
      };
      if (body.generationConfig && body.generationConfig.temperature !== undefined) {
        claudePayload.temperature = body.generationConfig.temperature;
      }
      var outStr = JSON.stringify(claudePayload);
      context.setVariable("request.content", outStr);
      request.content = outStr;
      context.setVariable("flow.convert_claude_to_gemini_resp", "true");
    } 
    // 2. If already in Anthropic format (messages), ensure vertex headers & fields
    else if (body.messages && Array.isArray(body.messages)) {
      if (!body.anthropic_version) {
        body.anthropic_version = "vertex-2023-10-16";
      }
      if (!body.max_tokens) {
        body.max_tokens = 1024;
      }
      if (body.model !== undefined) {
        delete body.model;
      }
      var outStr2 = JSON.stringify(body);
      context.setVariable("request.content", outStr2);
      request.content = outStr2;
    }
  }
} catch (e) {
  // Allow to proceed
}
