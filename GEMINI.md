# Apigee AI & Tools Gateway with Google ADK

This repository is an enterprise demonstration and development platform for:
1. **Apigee API Management**: API governance, security, rate-limiting, and developer enablement.
2. **Apigee AI Gateway**: Intelligent auto-routing across Gemini and Anthropic Claude models, product-driven LLM token quotas, Model Armor prompt guardrails, response sanitization, semantic caching, and per-request cost attribution.
3. **Apigee Tools Gateway**: Centralized tool/function execution governance, agent authentication, and native MCP (Model Context Protocol) serving.
4. **Google ADK (Agent Development Kit)**: Dual-pattern Python agents that consume Apigee gateways for models and tools, and are hosted as managed backend microservices fronted by Apigee.
5. **Interactive Demo UI**: React + Vite + Tailwind playground with real-time gateway trace inspection, token/latency/cost metrics, and live policy toggles.

> [!WARNING]
> **TODO**: Google Cloud is retiring Gemini 2.5 models across two phases beginning October 20, 2026. Migrate `gemini-2.5-flash` references in API products, proxy flows (`LLMTokenLimitFlow`), and UI presets before retirement. The only **safe** target today is **`gemini-3.1-flash-lite`** — entitled by name in both AI products, priced, and present in `AVAILABLE_MODELS`.
>
> **`gemini-3.5-flash` — partially validated as of 2026-09-19.** It **does** exist: `GET https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.5-flash` returns `launchStage: GA` (control: a fabricated ID and the known-bad `gemini-3-flash` both return 404 on the same endpoint). That resolves the Rule 12 catalog question. **It is still not usable**: it appears only as a price key in `model_rates.properties`, a cost-tier entry in `CalculateCost.js`, and a catalog entry in the `apigee-go-gen` `values.yaml` — it is in **no API product**, no proxy flow, and not in `AVAILABLE_MODELS`. It must be granted by name in both AI products before use. Note the publisher catalog is global; project/region callability through `bap-apac-demo2` was **not** proven, because the project-scoped read URL 404s even for known-good models, so confirming it costs a real `generateContent` call.

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

1. **Apigee Standards**: Keep proxy bundles compliant with Apigee X directory structures (`apiproxy/{proxies,targets,policies,resources}`). Name policies with the type prefix already established in the bundle — `AM-`, `CORS-`, `DC-`, `DJWT-`, `EV-`, `JS-`, `KVM-`, `LTQ-`, `ML-`, `MLC-`, `OAS-`, `QC-`, `RF-`, `SCL-`, `SCP-`, `SMR-`, `SUP-`, `VA-` in `ai-gateway-v1`, plus `PP-` and `Q-` in `mcp`. **This list scopes only the two hand-maintained XML bundles.** [`apigee/templates/ai-gateway/policies/`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/templates/ai-gateway/policies/) is a separate `apigee-go-gen` YAML policy set with its own conventions — it adds an `SC-` prefix (`SC-LLMJudge.yaml`) that appears in neither XML bundle, and uses lowercase, hyphenated suffixes (`AM-model.yaml`, `JS-extract-prompt.yaml`) instead of PascalCase. Match whichever set you are editing; do not normalise one to the other.

2. **Quotas come from the API Product, never hardcoded**: LLM token limits are defined in `llmOperationGroup.operationConfigs[].llmTokenQuota` in [`apigee/products/`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/products/). The `LTQ-TokenEnforce` and `LTQ-TokenCount` policies read them dynamically via `countRef="verifyapikey.VA-VerifyAPIKey.apiproduct.developer.llmQuota.limit"` and matching interval/timeunit refs. Literal values in the policy XML are fallback defaults only — do not treat them as the effective limit, and do not introduce per-limit policy variants.

3. **ADK Dual-Pattern**: Ensure agents route model calls through the AI Gateway and tool calls through the Tools Gateway. Avoid hardcoding direct Vertex AI or backend URLs in the agent core.

4. **Traceability**: Gateway responses carry `x-gateway-*` trace metadata set by [`AM-SetResponseHeaders`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/AM-SetResponseHeaders.xml) — including `x-gateway-model`, `x-gateway-provider`, `x-auto-routed`, `x-gateway-cached`, `x-gateway-total-tokens`, and `x-gateway-cost-usd`. Preserve these; the UI trace inspector depends on them.

5. **UI branding constraint**: The word "Apigee" has been deliberately removed from all **user-facing UI text**; the 4-colour logo symbol is retained. Do not reintroduce it into rendered strings. This applies only to visible UI copy — code identifiers (`ApigeeLogo`, `apigeeClient.ts`, `sendPromptToApigee`) and technical prose about the Apigee platform intentionally keep the name.

6. **UI theming hazard**: [`ui/src/index.css`](file:///Users/maloosatyam/Codebase/AI%20Code/ui/src/index.css) carries aggressive light-theme `!important` overrides (e.g. `html[data-theme="light"] .text-slate-200`). Never pair an inline dark `backgroundColor` with Tailwind slate text classes — it renders invisible text in light mode. Use `bg-white dark:bg-slate-900` class pairs instead.

7. **Validation**: Test proxy bundles and Python ADK endpoints before proposing cloud deployment. Run `npm run build` and `npm run test:live` in [`ui/`](file:///Users/maloosatyam/Codebase/AI%20Code/ui/) before shipping UI changes.

8. **Documentation is part of the change — always update the docs.** Any change to proxy policies, API products, the model catalog, rate cards, or UI behaviour MUST update the affected files in [`docs/`](file:///Users/maloosatyam/Codebase/AI%20Code/docs/) and [`README.md`](file:///Users/maloosatyam/Codebase/AI%20Code/README.md) in the *same* change. Do not defer this or offer it as a follow-up.

9. **Never commit credentials.** No consumer key, token, or secret may appear as a literal in a version-controlled file — not even as a convenience fallback such as `${API_KEY:-<literal>}`. Scripts and tests must read from the environment or `/api/me` and fail loudly when unset. Note that removing a committed secret does **not** purge it from git history; it must also be revoked in Apigee.

10. **Entitlements are named models only.** API products must never grant `model="*"` or use a `**` resource glob. Each model is granted explicitly by name.

11. **Apigee resource glob trap**: `*` matches within a single path segment and requires **at least one** trailing character — so `/auto*` does **not** match a bare `/auto`. A trailing `*` placed directly after a model name also leaks siblings (`/models/gemini-2.5-flash*` grants `gemini-2.5-flash-lite`). Use the `:*` form, which absorbs only the `:generateContent` suffix, and grant suffix-less paths such as `/auto` as exact resources.

12. **Verify model IDs against the live publisher catalog before referencing them.** Four IDs (`gemini-3-flash`, `claude-3-5-haiku`, `claude-3-5-sonnet`, `claude-3-7-sonnet`) were referenced throughout the proxy, products, UI and docs but do not exist in `bap-apac-demo2` and returned 404. There is no `claude-3-x` generation in this project at all.

13. **API products carry no custom attributes.** The only attribute on any product is `access: private`, which Apigee itself interprets. Do **not** reintroduce `tier`, `description`, `domain` or any other custom attribute, and do not write policies or JavaScript that read `verifyapikey.VA-VerifyAPIKey.apiproduct.<custom>` — that variable will not resolve. Routing tier is derived **solely from the API product name** (`...apiproduct.name` containing `"enterprise"`), and [`AutoRouting.js`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/resources/jsc/AutoRouting.js) fails closed to `standard` when the name does not resolve. Related Apigee constraint: an `operationConfig` must contain **exactly one** `llmOperation` — zero is rejected with `400 Operations must contain exactly one entity but found 0 entities`, so when removing an operation delete its wrapper too.

14. **One AI ingress surface — do not re-add native passthrough.** `ai-gateway-v1` exposes exactly two paths: `POST /ai/v1/auto` and `POST /ai/v1/models/{model}:generateContent` (plus `:streamGenerateContent`, declared for OAS validation but not implemented). The native `/v1/projects/**` and `/v1/messages` shapes and the unroutable `/models/auto` grant were deliberately removed from the proxy flows, the OpenAPI spec and every API product. **Claude uses the same path and the same Gemini `contents` body as Gemini** — the gateway converts the request and `SMR-SanitizeModelResponse` normalises the reply, so an Anthropic-shaped `messages` body is now correctly rejected with 400 by `OAS-ValidateRequest`. Note `/v1/projects/...` and `:rawPredict` legitimately remain in the **upstream target templates** (`AM-RouteGeminiTarget` / `AM-RouteClaudeTarget`); those are outbound URLs, not ingress paths, and must not be touched.
