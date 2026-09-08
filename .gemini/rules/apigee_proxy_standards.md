---
trigger: glob
globs: "apigee/**/*.xml,apigee/**/*.sh,apigee/**/*.json"
description: "Rules and best practices for creating and modifying Apigee X proxy bundles and shared flows."
---

# Apigee X Proxy Development Standards

When generating or modifying Apigee X proxy bundles, strictly adhere to the following conventions:

## 1. Directory Structure
All proxy bundles must follow the standard Apigee X hierarchy:
```text
apiproxy/
├── <proxy-name>.xml              # Root proxy definition
├── proxies/
│   └── default.xml               # ProxyEndpoint definition (PreFlow, Flows, PostFlow, HTTPProxyConnection)
├── targets/
│   └── default.xml               # TargetEndpoint definition (HTTPTargetConnection, PreFlow, PostFlow)
├── policies/                     # XML Policy files (one per policy instance)
│   ├── VAK-VerifyApiKey.xml
│   ├── SA-SpikeArrest.xml
│   ├── Q-QuotaTier.xml
│   └── JS-TokenAccounting.xml
└── resources/
    └── jsc/                      # JavaScript callout scripts
        └── token_accounting.js
```

## 2. Policy Naming Conventions
Always prefix policy file names and `name` attributes with standard Apigee abbreviations:
- `VAK-`: Verify API Key (`VerifyAPIKey`)
- `OA-`: OAuth v2 (`OAuthV2`)
- `SA-`: Spike Arrest (`SpikeArrest`)
- `Q-`: Quota (`Quota`)
- `AM-`: Assign Message (`AssignMessage`)
- `EV-`: Extract Variables (`ExtractVariables`)
- `JS-`: JavaScript (`Javascript`)
- `PY-`: Python Script (`PythonScript`)
- `RC-`: Response Cache (`ResponseCache`)
- `FC-`: Flow Callout (`FlowCallout`)
- `ML-`: Message Logging (`MessageLogging`)
- `RF-`: Raise Fault (`RaiseFault`)

## 3. AI Gateway Specific Conventions
- **Model Routing**: Use conditional RouteRules or AssignMessage dynamically setting `target.url` to the appropriate Vertex AI model endpoint (`publishers/google/models/gemini-1.5-flash` vs `gemini-1.5-pro`).
- **Token Quotas**: Extract token usage from Vertex AI response (`usageMetadata.promptTokenCount` and `usageMetadata.candidatesTokenCount`) and apply dynamic token rate limiting.
- **Trace Headers**: Inject standard telemetry headers in `PostFlow` response:
  - `x-gateway-model`
  - `x-gateway-latency-ms`
  - `x-prompt-tokens`
  - `x-candidate-tokens`
  - `x-gateway-cached` (true/false)

## 4. Tools Gateway Conventions
- Validate tool parameters using JSON Schema or ExtractVariables before proxying to backend endpoints.
- Check tool execution scopes (`tool:crm:read`, `tool:order:write`) against client API keys or OAuth scopes.
