---
name: ai-gateway-policy-manager
description: >-
  Configure and manage Apigee AI Gateway policies for Google Vertex AI (Gemini 1.5 Flash / Pro).
  Use when setting up model routing, fallback/failover, token rate limiting, prompt guardrails,
  PII redaction, and semantic response caching.
---

# AI Gateway Policy Manager Skill

This skill guides the design and configuration of AI Gateway capabilities in Apigee X.

## 1. Dynamic Model Routing
Route requests dynamically based on incoming headers (`x-target-model`) or prompt complexity:
- If `header.x-target-model == "gemini-1.5-pro"`, target `publishers/google/models/gemini-1.5-pro:generateContent`
- Otherwise default to `publishers/google/models/gemini-1.5-flash:generateContent`

## 2. Token-Aware Rate Limiting & Quota
1. **Response Token Extraction**: Extract token counts in `PostFlow` of TargetEndpoint using `ExtractVariables`:
   ```xml
   <ExtractVariables name="EV-ExtractTokenUsage">
       <JSONPayload>
           <Variable name="promptTokens">
               <JSONPath>$.usageMetadata.promptTokenCount</JSONPath>
           </Variable>
           <Variable name="candidatesTokens">
               <JSONPath>$.usageMetadata.candidatesTokenCount</JSONPath>
           </Variable>
           <Variable name="totalTokens">
               <JSONPath>$.usageMetadata.totalTokenCount</JSONPath>
           </Variable>
       </JSONPayload>
   </ExtractVariables>
   ```
2. **Quota Counter**: Increment the client's token consumption counter via `Quota` policy using `<Weight ref="totalTokens"/>`.

## 3. PII Redaction & Prompt Guardrails
Use a JavaScript callout (`JS-RedactPII.js`) in the `PreFlow` to mask credit card numbers, Social Security numbers, and sensitive email patterns before sending the request to the upstream LLM.

## 4. Response Caching
Apply `ResponseCache` on idempotent queries:
- Cache key: Hash of prompt content + model ID + temperature.
- Injects header `x-gateway-cached: true` on cache hits to skip LLM billing and reduce latency to <20ms.
