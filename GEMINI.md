# Apigee AI & Tools Gateway with Google ADK

This repository is an enterprise demonstration and development platform for:
1. **Apigee API Management**: API governance, security, rate-limiting, and developer enablement.
2. **Apigee AI Gateway**: Intelligent auto-routing across Gemini and Anthropic Claude models, product-driven LLM token quotas, Model Armor prompt guardrails, response sanitization, semantic caching, and per-request cost attribution.
3. **Apigee Tools Gateway**: Centralized tool/function execution governance, agent authentication, and native MCP (Model Context Protocol) serving.
4. **Google ADK (Agent Development Kit)**: Dual-pattern Python agents that consume Apigee gateways for models and tools, and are hosted as managed backend microservices fronted by Apigee.
5. **Interactive Demo UI**: React + Vite + Tailwind playground with real-time gateway trace inspection, token/latency/cost metrics, and live policy toggles.

---

## Repository Structure Overview
- [`.gemini/rules/`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/rules/): Specialized rules for Apigee XML, Python ADK, and React/Tailwind.
- [`.gemini/skills/`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/): On-demand procedural playbooks for proxy generation, policy tuning, and agent scaffolding.
- [`.gemini/agents/`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/agents/): Subagent personas (Apigee Architect, ADK Engineer, Gateway Tester).
- [`apigee/`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/): Apigee X proxy bundles (`proxies/`), API products (`products/`), developer apps (`apps/`), templates, and deployment scripts (`scripts/`).
- [`agents/`](file:///Users/maloosatyam/Codebase/AI%20Code/agents/): Python ADK agent microservice (FastAPI + Cloud Run ready) using the Dual-Pattern.
- [`ui/`](file:///Users/maloosatyam/Codebase/AI%20Code/ui/): React + Vite + Tailwind demo testing playground with live gateway telemetry, served in production by [`server.js`](file:///Users/maloosatyam/Codebase/AI%20Code/ui/server.js) on Node.
- [`docs/`](file:///Users/maloosatyam/Codebase/AI%20Code/docs/): Architecture specs, policy guides, and step-by-step customer demo walkthrough scripts.

### Proxy bundles
| Bundle | Status | Purpose |
| --- | --- | --- |
| `ai-gateway-v1` | **Primary / active** | The AI Gateway. All new work lands here. |
| `mcp` | **Active** | Native MCP Tools Gateway. |
| `vertex-ai-v1` | **Legacy** | Superseded by `ai-gateway-v1`. Do not extend. |

---

## Core Guidelines for Agentic Development

1. **Apigee Standards**: Keep proxy bundles compliant with Apigee X directory structures (`apiproxy/{proxies,targets,policies,resources}`). Name policies with the type prefix already established in the bundle — `AM-`, `CORS-`, `DC-`, `DJWT-`, `EV-`, `JS-`, `KVM-`, `LTQ-`, `ML-`, `MLC-`, `OAS-`, `QC-`, `RF-`, `SCL-`, `SCP-`, `SMR-`, `SUP-`, `VA-` in `ai-gateway-v1`, plus `PP-` and `Q-` in `mcp`.

2. **Quotas come from the API Product, never hardcoded**: LLM token limits are defined in `llmOperationGroup.operationConfigs[].llmTokenQuota` in [`apigee/products/`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/products/). The `LTQ-TokenEnforce` and `LTQ-TokenCount` policies read them dynamically via `countRef="verifyapikey.VA-VerifyAPIKey.apiproduct.developer.llmQuota.limit"` and matching interval/timeunit refs. Literal values in the policy XML are fallback defaults only — do not treat them as the effective limit, and do not introduce per-limit policy variants.

3. **ADK Dual-Pattern**: Ensure agents route model calls through the AI Gateway and tool calls through the Tools Gateway. Avoid hardcoding direct Vertex AI or backend URLs in the agent core.

4. **Traceability**: Gateway responses carry `x-gateway-*` trace metadata set by [`AM-SetResponseHeaders`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/AM-SetResponseHeaders.xml) — including `x-gateway-model`, `x-gateway-provider`, `x-auto-routed`, `x-gateway-cached`, `x-gateway-total-tokens`, and `x-gateway-cost-usd`. Preserve these; the UI trace inspector depends on them.

5. **UI branding constraint**: The word "Apigee" has been deliberately removed from all **user-facing UI text**; the 4-colour logo symbol is retained. Do not reintroduce it into rendered strings. This applies only to visible UI copy — code identifiers (`ApigeeLogo`, `apigeeClient.ts`, `sendPromptToApigee`) and technical prose about the Apigee platform intentionally keep the name.

6. **UI theming hazard**: [`ui/src/index.css`](file:///Users/maloosatyam/Codebase/AI%20Code/ui/src/index.css) carries aggressive light-theme `!important` overrides (e.g. `html[data-theme="light"] .text-slate-200`). Never pair an inline dark `backgroundColor` with Tailwind slate text classes — it renders invisible text in light mode. Use `bg-white dark:bg-slate-900` class pairs instead.

7. **Validation**: Test proxy bundles and Python ADK endpoints before proposing cloud deployment. Run `npm run build` and `npm run test:live` in [`ui/`](file:///Users/maloosatyam/Codebase/AI%20Code/ui/) before shipping UI changes.
