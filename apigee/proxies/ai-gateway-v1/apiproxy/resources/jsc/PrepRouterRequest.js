// Prepares the router classification request payload for gemini-3.1-flash-lite
var userPrompt = context.getVariable("flow.userPrompt") || "";
var trimmedPrompt = userPrompt.trim();

if (!trimmedPrompt) {
  // If prompt is empty, skip callout to save latency and tokens
  context.setVariable("flow.skipRouterCallout", "true");
  context.setVariable("flow.routerPayload", "{}");
} else {
  context.setVariable("flow.skipRouterCallout", "false");

  // Truncate to first 500 characters for classification to ensure sub-second evaluation
  var promptExcerpt = trimmedPrompt.length > 500 ? trimmedPrompt.substring(0, 500) : trimmedPrompt;

  var classifierInstruction =
    "Classify the following user prompt into exactly one category: coding, deep_reasoning, simple, general.\n\n" +
    "- coding: programming, software engineering, writing/debugging/refactoring code, SQL queries, regex, API development.\n" +
    "- deep_reasoning: complex analysis, system architecture trade-offs, multi-step planning, root cause evaluation, benchmarking.\n" +
    "- simple: short greetings, factual trivia, definitions, quick lookups, basic single-sentence questions.\n" +
    "- general: open-ended writing, summarization, general discussion not requiring specialized code or deep architectural analysis.\n\n" +
    "User Prompt:\n" + promptExcerpt;

  var routerBody = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: classifierInstruction
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.0,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          category: {
            type: "STRING",
            enum: ["coding", "deep_reasoning", "simple", "general"]
          }
        },
        required: ["category"]
      }
    }
  };

  context.setVariable("flow.routerPayload", JSON.stringify(routerBody));
}
