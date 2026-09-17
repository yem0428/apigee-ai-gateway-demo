# Apigee AI & Tools Gateway with Google ADK

[![Apigee X](https://img.shields.io/badge/Apigee-X-blue.svg)](https://cloud.google.com/apigee)
[![Google ADK](https://img.shields.io/badge/Google-ADK-4285F4.svg)](https://google.github.io/adk/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB.svg)](https://reactjs.org/)
[![Node 20](https://img.shields.io/badge/Node-20-339933.svg)](https://nodejs.org/)
[![Cloud Run](https://img.shields.io/badge/Google_Cloud-Cloud_Run-4285F4.svg)](https://cloud.google.com/run)

An enterprise-grade demonstration and development platform showcasing **Apigee API Management**,
the **Apigee AI Gateway**, the **Apigee MCP Tools Gateway**, and **Google ADK (Agent Development Kit)**
microservices — with live policy trace telemetry, identity-driven entitlement governance,
product-driven LLM token quotas, and Apigee native monetization.

---

## 🚀 Live Demo Studio

| Surface | URL | Source of truth |
| :--- | :--- | :--- |
| Interactive UI Playground | `https://ai-ui.maloosatyam.demo.altostrat.com/` | IAP-fronted Cloud Run service |
| AI Gateway | `https://api.maloosatyam.demo.altostrat.com/ai/v1` | `<BasePath>/ai/v1</BasePath>` in [default.xml](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/proxies/default.xml#L184) |
| MCP Tools Gateway | `https://api.maloosatyam.demo.altostrat.com/mcp` | `<BasePath>/mcp</BasePath>` in [mcp/default.xml](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/mcp/apiproxy/proxies/default.xml#L4) |
| MCP OAuth Protected Resource Metadata | `https://api.maloosatyam.demo.altostrat.com/.well-known/oauth-protected-resource/mcp` | [oauth-prm-endpoint.xml](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/mcp/apiproxy/proxies/oauth-prm-endpoint.xml#L4) |
| Legacy Vertex passthrough | `https://api.maloosatyam.demo.altostrat.com/vertexai/v1` | [vertex-ai-v1/default.xml](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/vertex-ai-v1/apiproxy/proxies/default.xml#L69) — superseded by `ai-gateway-v1` |

---

## ✨ Core Features & Architectural Capabilities

### 1. 🧠 Intelligent Model Auto-Routing (`/ai/v1/auto`)

[AutoRouting.js](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/resources/jsc/AutoRouting.js)
classifies the prompt with regex heuristics and then picks a model **based on the caller's API
product tier**. The tier is read from
[`verifyapikey.VA-VerifyAPIKey.apiproduct.tier`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/resources/jsc/AutoRouting.js#L9-L17)
— the `apiproduct` namespace matters, because the bare `…VA-VerifyAPIKey.tier` form addresses *app*
attributes and never resolves. A product **name** containing `enterprise` is used only as a
fallback when the attribute itself is empty.

| Prompt class (heuristic) | Enterprise tier target | Standard tier target | Cost tier |
| :--- | :--- | :--- | :--- |
| Coding (`def `, `class `, `SELECT `, ` ``` `, `refactor`, `regex`, …) | `claude-opus-4-5@20251101` *(anthropic)* | `gemini-3-flash-preview` | high / medium |
| Deep reasoning (`compare`, `architect`, `trade-off`, `benchmark`, `root cause`, …) | `gemini-3.1-pro-preview` | `gemini-3-flash-preview` | high / medium |
| Simple (< 200 chars, no coding or reasoning hits) | `gemini-3.1-flash-lite` | `gemini-3.1-flash-lite` | low |
| Everything else (≥ 200 chars, general) | `gemini-3-flash-preview` | `gemini-3-flash-preview` | medium |

The Standard branch is **capped at `gemini-3-flash-preview`**: it has exactly two outcomes —
`gemini-3.1-flash-lite` for simple prompts and `gemini-3-flash-preview` for everything else. A
Standard key can never be routed to `gemini-3.1-pro-preview` or `claude-opus-4-5@20251101`.

Tier resolution **fails closed**: premium routing requires a positive enterprise signal, so an
unresolved tier is downgraded to the constrained Standard branch rather than handed the expensive
models. The downgrade is visible in the trace via `flow.routingTier`.

Coding heuristics take precedence over deep-reasoning heuristics on the Enterprise branch. The
policy writes `flow.target_model`, `flow.model`, `flow.target_provider`, `flow.autoRouted`,
`flow.costTier` and `flow.routingTier`; `flow.target_provider == "anthropic"` is what selects the
Claude Vertex target at route time.

### 2. 🛡️ Model Armor Guardrails & Zero-Trust Identity

- **Prompt sanitization** — [SUP-UserPrompt.xml](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/SUP-UserPrompt.xml)
  is a `SanitizeUserPrompt` policy bound to Model Armor template
  `projects/bap-apac-demo2/locations/asia-southeast1/templates/apigee-sanitize-user-prompt`.
- **Response sanitization** — `SMR-SanitizeModelResponse` runs on successful non-passthrough responses.
- **Identity first** — the request PreFlow resolves identity from a Bearer JWT
  (`DJWT-ExtractUserIdentity` → `AM-SetUserIdentity`), falls back to the `X-User-Email` header
  (`AM-SetUserEmailFromHeader`), and raises `RF-MissingUserEmail` → **HTTP 401** if neither resolves.
- **API key verification** — `VA-VerifyAPIKey` runs *after* identity resolution and *after* Model Armor.

> [!IMPORTANT]
> Model Armor executes **before** API key verification in the PreFlow. Prompt injection is blocked
> even for requests that would later fail key validation.

### 3. 🎟️ Product-Driven LLM Token Quotas

Token limits are **not hardcoded in the proxy**. Both
[LTQ-TokenEnforce.xml](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/LTQ-TokenEnforce.xml)
and `LTQ-TokenCount.xml` are `LLMTokenQuota` policies that read `limit` / `interval` / `timeUnit`
dynamically from the API Product attached to the verified key:

```xml
<LLMTokenQuota continueOnError="false" enabled="true" name="LTQ-TokenEnforce" type="rollingwindow">
  <Allow count="1000" countRef="verifyapikey.VA-VerifyAPIKey.apiproduct.developer.llmQuota.limit"/>
  <Interval ref="verifyapikey.VA-VerifyAPIKey.apiproduct.developer.llmQuota.interval">1</Interval>
  <TimeUnit ref="verifyapikey.VA-VerifyAPIKey.apiproduct.developer.llmQuota.timeunit">minute</TimeUnit>
  <Distributed>true</Distributed>
  <Synchronous>true</Synchronous>
  <Identifier ref="verifyapikey.VA-VerifyAPIKey.client_id"/>
  <LLMModelSource>{flow.model}</LLMModelSource>
  <EnforceOnly>true</EnforceOnly>
  <SharedName>common-counter</SharedName>
</LLMTokenQuota>
```

The inline `count="1000"` / `1` / `minute` values are fallback defaults only — the `*Ref` attributes win.
`LTQ-TokenEnforce` enforces, `LTQ-TokenCount` counts, and both share the `common-counter` shared name.

> [!WARNING]
> **TODO**: Google Cloud is retiring Gemini 2.5 models across two phases beginning October 20, 2026. Prior to retirement, update all `gemini-2.5-flash` demo model references across API products, proxy flows (`LLMTokenLimitFlow`), and UI presets.
>
> The only **safe** target today is **`gemini-3.1-flash-lite`** — it is entitled by name in both
> Standard and Enterprise AI Tier, priced in `model_rates.properties`, and present in the UI
> `AVAILABLE_MODELS` dropdown.
>
> `gemini-3.5-flash` is **unvalidated and must not be used as a drop-in**. It exists only as a price
> key in [model_rates.properties](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/resources/properties/model_rates.properties),
> a cost-tier entry in `CalculateCost.js`, and a catalog entry in the `apigee-go-gen`
> [values.yaml](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/templates/ai-gateway/values.yaml).
> It appears in **no API product**, **no proxy flow**, and **not** in `AVAILABLE_MODELS`. Before it
> can be recommended it must be confirmed against the live `bap-apac-demo2` publisher catalog and
> added by name to both AI products — four previously-referenced model IDs turned out not to exist
> in this project at all.

**`gemini-2.5-flash` is the deliberate token-limit demo model at 100 tokens / 1 minute.**
Every other operation in [standard_ai_tier.json](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/products/standard_ai_tier.json)
is 2000 tokens / 1 minute. The product declares **12 `operationConfigs` across 5 models**, exactly
one `llmOperation` per config (the Management API rejects more with
`Operations must contain exactly one entity`):

| Resource | Model | Token quota |
| :--- | :--- | :--- |
| `/auto` | `auto` | 2000 / 1 min |
| `/auto:*` | `auto` | 2000 / 1 min |
| `/models/auto` | `auto` | 2000 / 1 min |
| `/models/auto:*` | `auto` | 2000 / 1 min |
| **`/models/gemini-2.5-flash:*`** | `gemini-2.5-flash` | **100 / 1 min** |
| **`/v1/projects/*/locations/*/publishers/google/models/gemini-2.5-flash:*`** | `gemini-2.5-flash` | **100 / 1 min** |
| `/models/gemini-3.1-flash-lite:*` | `gemini-3.1-flash-lite` | 2000 / 1 min |
| `/v1/projects/*/locations/*/publishers/google/models/gemini-3.1-flash-lite:*` | `gemini-3.1-flash-lite` | 2000 / 1 min |
| `/models/gemini-3-flash-preview:*` | `gemini-3-flash-preview` | 2000 / 1 min |
| `/v1/projects/*/locations/*/publishers/google/models/gemini-3-flash-preview:*` | `gemini-3-flash-preview` | 2000 / 1 min |
| `/models/claude-haiku-4-5@20251001:*` | `claude-haiku-4-5@20251001` | 2000 / 1 min |
| `/v1/projects/*/locations/*/publishers/anthropic/models/claude-haiku-4-5@20251001:*` | `claude-haiku-4-5@20251001` | 2000 / 1 min |

Enforcement is wired through the dedicated `LLMTokenLimitFlow` conditional flow, which fires on
`/models/gemini-2.5-flash:generateContent`, on `flow.model == "gemini-2.5-flash"`, or on the
regex `^/models/gemini-2.5-flash.*`. Breaching the limit returns **HTTP 429**.

### 4. 💳 Apigee Native Monetization & Prepaid Wallets

- **Cost calculation** — `KVM-GetModelRates` loads the `ai-model-rates` KVM (`rate_card` entry),
  then [CalculateCost.js](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/resources/jsc/CalculateCost.js)
  computes `flow.tx_cost_micros`.
- **Wallet deduction** — `QC-DeductBudget` debits the developer wallet; `QC-EnforceBudgetLimit` and
  `MLC-EnforceMonetizationLimits` gate the request on the way in.
- **Prepaid provisioning** — [server.js](file:///Users/maloosatyam/Codebase/AI%20Code/ui/server.js#L531-L569)
  sets `billingType: PREPAID` and credits a **$20 USD** starting balance. This now runs from the
  explicit `/api/me/onboard` step rather than silently on sign-in — see
  [First-run developer onboarding](#first-run-developer-onboarding).
- **Rate plans & attribution** — surfaced through the `/api/monetization/*` endpoints
  (rate plans, subscriptions, attributions, credit, config).

### 5. ⚡ Semantic Caching (Vertex AI Vector Search)

[SCL-Semantic-Cache-Lookup.xml](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/SCL-Semantic-Cache-Lookup.xml)
embeds the prompt with Vertex AI `text-embedding-004` and queries a Vertex AI Vector Search index
endpoint (`DeployedIndexID: semantic_cache`) with a similarity **threshold of 0.95**.
`SCP-Semantic-Cache-Populate` writes successful responses back.

Caching is **opt-in per request** — the lookup only runs when the `use-cache` or `x-use-cache`
header is `true`. On a hit, `flow.cached` is `"true"`, which skips `KVM-GetModelRates`,
`JS-CalculateCost`, `QC-DeductBudget` and `LTQ-TokenCount` — so a cache hit costs no tokens and
no wallet balance.

### 6. 📡 `x-gateway-*` Trace Telemetry Contract

Every gateway response carries a block of trace headers set by a single policy,
[AM-SetResponseHeaders.xml](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/AM-SetResponseHeaders.xml).
This is a **contract, not a debugging aid** — the UI trace inspector, the analytics dashboard and
the live test suite all read it, so headers must not be renamed or dropped.

| Header | Source variable | Meaning |
| :--- | :--- | :--- |
| `x-gateway-model` | `flow.target_model` | Model actually invoked upstream |
| `x-gateway-provider` | `flow.target_provider` | `google` or `anthropic` — also selects the Vertex target |
| `x-auto-routed` | `flow.autoRouted` | Whether `AutoRouting.js` chose the model |
| `x-gateway-cost-tier` | `flow.costTier` | `low` / `medium` / `high` routing classification |
| `x-gateway-cost-usd` | `flow.tx_cost_usd` | Computed request cost |
| `x-gateway-currency` | *(literal `USD`)* | Currency for the cost fields |
| `x-gateway-cached` | `flow.cached` | `"true"` on a semantic cache hit |
| `x-gateway-cache-status` | `flow.cacheStatus` | Cache lookup outcome detail |
| `x-gateway-prompt-tokens` | `flow.promptTokenCount` | Input tokens |
| `x-gateway-completion-tokens` | `flow.candidatesTokenCount` | Output tokens |
| `x-gateway-total-tokens` | `flow.totalTokenCount` | Total tokens, and the quota-counted figure |
| `x-gateway-monetization-status` | `mint.limitscheck.status_message` | Monetization limit-check verdict |
| `x-gateway-prepaid-balance` | `mint.limitscheck.prepaid_developer_balance` | Wallet balance at check time |
| `x-gateway-prepaid-currency` | `mint.limitscheck.prepaid_developer_currency` | Wallet currency |
| `x-gateway-balance-remaining` | `flow.prepaid_balance_remaining` | Balance after this request's deduction |

The policy runs with `continueOnError="true"` and `<IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>`,
so an unset variable yields an absent or empty header rather than a fault — clients must treat every
header as optional. On a cache hit the cost and token variables are never populated, which is why
`x-gateway-cached` is the field to branch on.

### 7. 🛠️ MCP Tools Gateway Governance

The [mcp](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/mcp/apiproxy) proxy governs
JSON-RPC 2.0 `tools/list` and `tools/call` traffic with six policies
(`VA-VerifyAPIKey`, `PP-MCP`, `Q-Limit`, `CORS-Allow`, `AM-RemoveAuthorization`, `ML-CloudLogging`).

Authorization is expressed as **per-operation entries in the API product**, so a persona can only
invoke the tools its product enumerates:

| Product | Operations | Quotas |
| :--- | :--- | :--- |
| [Sales Tools MCP](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/products/sales_tools_mcp.json) | `tools/list`, `tools/call/listAllDiscounts`, `tools/call/getDiscountForSku` | 5/min, 1 per 5 s, 2/min |
| [Loans Tools MCP](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/products/loans_tools_mcp.json) | `tools/list`, `tools/call/getLoanApplication`, `tools/call/patchLoanApplication`, `tools/call/submitLoanApplication` | per-operation |
| [Enterprise Tools MCP](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/products/enterprise_tools_mcp.json) | enterprise-domain superset | per-operation |

A Sales-persona key calling a Loans tool is rejected because the operation is absent from its product.

### Entitlement tiers — what the products actually grant

Every grant is enumerated per model. There are **no `model="*"` entitlements and no `**` resource
globs** — both were removed. Each model gets two resources:

```
/models/<model>:*
/v1/projects/*/locations/*/publishers/<google|anthropic>/models/<model>:*
```

| Product | Models | Resources | Token quota |
| :--- | :--- | :--- | :--- |
| **[Standard AI Tier](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/products/standard_ai_tier.json)** | `auto`, `gemini-2.5-flash`, `gemini-3.1-flash-lite`, `gemini-3-flash-preview`, `claude-haiku-4-5@20251001` — **5** | 12 `operationConfigs` | 2000 / min · `gemini-2.5-flash` → **100 / min** |
| **[Enterprise AI Tier](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/products/enterprise_ai_tier.json)** | the Standard 5 plus `gemini-3.1-pro-preview` and `claude-opus-4-5@20251101` — **7** | 16 `operationConfigs` | 10000 / min · `gemini-2.5-flash` → **100 / min** |

`auto` is special-cased with **four exact resources** in both products:

```
/auto        /auto:*        /models/auto        /models/auto:*
```

Apigee's `*` matches within a single path segment and requires **at least one character**, so
`/auto*` does **not** match a bare `/auto` — hence `/auto` must be granted as its own exact
resource. The tightened `:*` suffix form is deliberate too: a trailing `*` placed directly after a
model name leaks siblings (`/models/gemini-2.5-flash*` also granted `gemini-2.5-flash-lite`),
whereas `:*` only absorbs the `:generateContent` / `:streamGenerateContent` suffix.

Only the bare `/auto` path is actually routable: `AutoRoutingFlow` matches
`proxy.pathsuffix MatchesPath "/auto*"` or the regex `^/auto.*`, and that is what the UI calls.
`/models/auto` is entitled by both products but returns **400** — no proxy flow routes it.

> [!NOTE]
> Standard AI Tier **does** include `claude-haiku-4-5@20251001`. It does **not** enumerate
> `gemini-3.1-pro-preview` or `claude-opus-4-5@20251101`, so calls to those models with a Standard
> key are rejected by `VA-VerifyAPIKey`. Both products use
> `llmOperationGroup.operationConfigs[].llmTokenQuota` with exactly one `llmOperation` per config;
> neither uses the classic product `quota` field. The 100 tokens/min `gemini-2.5-flash` demo cap
> applies in **both** tiers.

`gemini-3.1-ultra` is deliberately **unentitled in every product**. It powers the "Restricted Model"
demo scenario: even an Enterprise key is rejected at `VA-VerifyAPIKey` with **HTTP 401** before any
upstream call is made.

---

## 📁 Repository Structure

```
.
├── AGENTS.md                              # Subagent persona registry & playbooks
├── GEMINI.md                              # Repository-level agent instructions
├── README.md
├── scenario_presets_review.md
├── agents/                                # Python Google ADK microservice (FastAPI)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── agent.py                       # DualPatternAgent
│       ├── config.py
│       ├── main.py                        # FastAPI app: "Apigee ADK Agent Service"
│       └── tools/
│           ├── crm_tool.py
│           ├── knowledge_base_tool.py
│           └── order_tool.py
├── apigee/
│   ├── apps/                              # Developer apps (2)
│   │   ├── unified_sales_app.json
│   │   └── unified_loans_app.json
│   ├── products/                          # API products (5)
│   │   ├── standard_ai_tier.json
│   │   ├── enterprise_ai_tier.json
│   │   ├── enterprise_tools_mcp.json
│   │   ├── sales_tools_mcp.json
│   │   └── loans_tools_mcp.json
│   ├── proxies/
│   │   ├── ai-gateway-v1/                 # PRIMARY AI Gateway — 36 policies
│   │   ├── mcp/                           # Native MCP Tools Gateway — 6 policies
│   │   └── vertex-ai-v1/                  # LEGACY, superseded by ai-gateway-v1
│   ├── scripts/
│   │   ├── deploy_all.sh                  deploy_proxy.sh      package_bundle.sh
│   │   ├── provision_unified_credentials.py / .sh
│   │   ├── generate_demo_traffic.py       # Synthetic analytics/monetization traffic generator
│   │   ├── test_autorouting.sh            test_token_limit.sh
│   │   └── validate_bundle.py
│   ├── templates/ai-gateway/              # Helm-style policy templates (YAML)
│   └── dist/ai-gateway-v1.zip             # Packaged bundle output
├── docs/
│   ├── apigee_ai_gateway_demo_design.md
│   ├── best_practices_guide.md
│   ├── cloud_run_iap_deployment_guide.md
│   ├── proxy_architecture_design_plan.md
│   ├── ui_semantic_cache_and_governance_spec.md
│   └── unified_credentials_and_products_reference.md
└── ui/                                    # React 18 + Vite 5 + Tailwind demo studio
    ├── Dockerfile                         # node:20-alpine, serves dist/ via server.js
    ├── server.js                          # Production Node server: static + /api/* + reverse proxy
    ├── vite.config.ts                     # Dev server (port 3000) + dev-only /api/* middleware
    ├── index.html                         # <title>AI &amp; Tools Gateway - Live Playground</title>
    ├── package.json
    ├── public/{apigee-color.svg, env-config.js}
    ├── tests/
    │   ├── autorouting.unit.test.mjs      # Offline unit suite
    │   └── gateway-live.test.mjs          # Live integration suite
    └── src/
        ├── App.tsx                        # Root app, tab routing, SSO bootstrap
        ├── main.tsx  index.css  vite-env.d.ts
        ├── types/index.ts
        ├── components/                    # 15 components
        │   ├── AnalyticsDashboard.tsx     ApigeeLogo.tsx        ArchitectureBlueprintModal.tsx
        │   ├── ChatPlayground.tsx         DeveloperOnboardingModal.tsx
        │   ├── DonutPieChart.tsx          GatewaySettingsModal.tsx
        │   ├── GatewayTraceViewer.tsx     McpPlayground.tsx     McpTraceViewer.tsx
        │   ├── ModelRateCardView.tsx      MonetizationManager.tsx
        │   └── Navbar.tsx  ScenarioPresets.tsx  ThemeSelector.tsx
        └── services/
            ├── api.ts                     # Management/identity client (/api/me, /api/monetization/*)
            ├── apigeeClient.ts            # AI Gateway REST client
            ├── defaultSettings.ts
            └── mcpClient.ts               # JSON-RPC 2.0 tool protocol client
```

> [!NOTE]
> `ui/nginx.conf.template` and `ui/generate-env.sh` still exist in the tree but are **not referenced
> by [ui/Dockerfile](file:///Users/maloosatyam/Codebase/AI%20Code/ui/Dockerfile)** or by any build
> script. They are leftovers from an earlier NGINX-based container and are dead files today.

### UI navigation

[Navbar.tsx](file:///Users/maloosatyam/Codebase/AI%20Code/ui/src/components/Navbar.tsx) renders four
primary tabs: **AI Gateway**, **MCP Gateway**, **Analytics & Cost**, and **Monetization**
(the last is admin-view only), plus an interactive **Architecture** button that opens
[ArchitectureBlueprintModal.tsx](file:///Users/maloosatyam/Codebase/AI%20Code/ui/src/components/ArchitectureBlueprintModal.tsx) — an interactive 3-tab reference diagram (**AI Gateway Flow**, **MCP Tools Flow**, and **ADK Dual-Pattern**) with clickable policy XML inspection and live trace status correlation. Additionally, every tested request in `ChatPlayground` (`Target URL:`) and `McpTraceViewer` (`JSON-RPC 2.0`) includes a **`Request Flow`** button that opens the modal in **`⚡ Tested Request Flow`** mode, dynamically short-circuiting the pipeline diagram at the exact stopping policy (e.g., red perimeter block at Model Armor or green short-circuit at Semantic Cache HIT) and omitting bypassed downstream stages. The underlying `AppTab` union in
[types/index.ts](file:///Users/maloosatyam/Codebase/AI%20Code/ui/src/types/index.ts#L131) also carries
`kvm-pricing` and `rate-cards`, which render inside the Monetization surface.

### First-run developer onboarding

The UI **no longer auto-creates** Apigee developers on sign-in. `provisionUserDeveloperAndApp` is
called from `/api/me` with [`allowCreate: false`](file:///Users/maloosatyam/Codebase/AI%20Code/ui/server.js#L743),
so when the Management API returns 404 for the signed-in email the server responds with
[`needsOnboarding: true`](file:///Users/maloosatyam/Codebase/AI%20Code/ui/server.js#L355-L360) plus a
suggested first/last name derived from the identity token, and creates nothing.

`App.tsx` reacts to that flag by rendering
[DeveloperOnboardingModal.tsx](file:///Users/maloosatyam/Codebase/AI%20Code/ui/src/components/DeveloperOnboardingModal.tsx),
which pre-fills the suggested names, requires a non-empty first name, trims both fields, and falls
back to `lastName = firstName` when only one name is given. Submitting `POST`s to
[`/api/me/onboard`](file:///Users/maloosatyam/Codebase/AI%20Code/ui/server.js#L774-L853), which
re-runs the same provisioning routine with `allowCreate: true` and the user-validated names. That
single call provisions:

| Step | Result |
| :--- | :--- |
| Developer | Created in org `bap-apac-demo2` with the confirmed first/last name |
| Developer app | `Unified Admin <username> App`, with its consumer key returned to the client |
| Monetization config | `billingType: PREPAID` (set or corrected) |
| Wallet | **$20.00 USD** starting balance, credited once (skipped if a balance or prior credit exists) |
| Subscriptions | `Enterprise AI Tier` rate plan (the primary admin account also gets `Standard AI Tier`) |

The response echoes `needsOnboarding: false` along with the new keys, so the UI can dismiss the
modal and continue without a reload.

### Balance display precision

Wallet and consumption figures render to **2 decimal places** with the exact **6-decimal** value in
a hover tooltip — see the `Exact balance: $…` / `Exact consumed: $…` `title` attributes in
[MonetizationManager.tsx](file:///Users/maloosatyam/Codebase/AI%20Code/ui/src/components/MonetizationManager.tsx#L788-L809).
This matters because a single gateway call is priced in micro-dollars: a 2dp display alone would
show `$0.00` for real traffic, while 6dp everywhere is unreadable in summary tiles.

---

## 🛠️ Local Development & Setup

### Prerequisites

- **Node.js** v20+ and **npm**
- **Python** 3.10+ (only for the `agents/` ADK service)
- **gcloud CLI** authenticated against GCP project `bap-apac-demo2` — the dev server shells out to
  `gcloud auth print-access-token` and `gcloud auth print-identity-token` for Management API and
  SSO simulation

### npm scripts

All scripts live in [ui/package.json](file:///Users/maloosatyam/Codebase/AI%20Code/ui/package.json#L6-L15):

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm run dev` | `vite` | Dev server with live `/api/*` middleware |
| `npm run build` | `tsc && vite build` | Type-check then emit `dist/` |
| `npm run preview` | `vite preview` | Preview the built bundle |
| `npm test` | `node --test tests/autorouting.unit.test.mjs` | Alias of `test:unit` |
| `npm run test:unit` | `node --test tests/autorouting.unit.test.mjs` | Offline auto-routing unit suite |
| `npm run test:autorouting` | `node --test tests/autorouting.unit.test.mjs` | Alias of `test:unit` |
| `npm run test:live` | `node --env-file=.env --test tests/gateway-live.test.mjs` | Live gateway integration suite |
| `npm run test:all` | unit suite `&&` live suite | Everything |

### Running the UI playground locally

```bash
cd ui
npm install
npm run dev
```

The Vite dev server listens on **`http://localhost:3000`** — the port is pinned in
[vite.config.ts](file:///Users/maloosatyam/Codebase/AI%20Code/ui/vite.config.ts#L1590-L1591).

[vite.config.ts](file:///Users/maloosatyam/Codebase/AI%20Code/ui/vite.config.ts) registers dev-only
middleware that mirrors the production endpoints (`/api/me`, `/api/kvm/rates`,
`/api/monetization/{balance,credit,rateplans,subscriptions,config,attributions}`,
`/api/analytics/fleet-stats`) plus HTTP proxies for
`/api/ai-dev`, `/api/ai-prod`, `/api/claude-dev`, `/api/claude-prod`, `/api/vertexai-dev`,
`/api/vertexai-prod`, `/api/mcp-dev`, `/api/mcp-prod`, and `/v1`.

Build the production bundle (required before a container build — the Dockerfile copies `dist/`,
it does not build it):

```bash
npm run build
```

### Environment configuration

Copy [ui/.env.example](file:///Users/maloosatyam/Codebase/AI%20Code/ui/.env.example) to `ui/.env`:

```bash
cp .env.example .env
```

Recognised keys: `VITE_DEFAULT_ENV`, `VITE_ADMIN_API_KEY`, `VITE_ADMIN_USER_EMAIL`,
`VITE_SALES_API_KEY`, `VITE_SALES_AGENT_EMAIL`, `VITE_LOANS_API_KEY`, `VITE_LOANS_AGENT_EMAIL`,
`VITE_SSO_USER_EMAIL`. A `.env` file is **mandatory** for `npm run test:live`, which is invoked with
`node --env-file=.env`.

---

## 🧪 Test Suites

Two suites live in [ui/tests/](file:///Users/maloosatyam/Codebase/AI%20Code/ui/tests):

| Suite | File | Command | Network | Current result |
| :--- | :--- | :--- | :--- | :--- |
| Auto-routing unit | [autorouting.unit.test.mjs](file:///Users/maloosatyam/Codebase/AI%20Code/ui/tests/autorouting.unit.test.mjs) | `npm run test:unit` | Offline | **45 tests — 45 pass, 0 fail, 0 skipped** |
| Live gateway integration | [gateway-live.test.mjs](file:///Users/maloosatyam/Codebase/AI%20Code/ui/tests/gateway-live.test.mjs) | `npm run test:live` | Live Apigee | **22 tests — 18 pass, 0 fail, 4 skipped** |

The live suite is organised into four describe blocks:

1. Local Auth & Identity Endpoint (`/api/me`)
2. Apigee AI Gateway — Live Vertex AI (Gemini)
3. Apigee Tools Gateway — Live MCP Backend
4. Apigee AI Gateway — Intelligent Auto-Routing (`/auto`)

It first probes `http://localhost:3000/api/me`; if the dev server is up it routes through the local
proxy and harvests API keys from the `/api/me` response, otherwise it falls back to calling
`https://api.maloosatyam.demo.altostrat.com` directly. It also retries HTTP 429 responses with
backoff, since the `gemini-2.5-flash` quota demo is deliberately tight.

The 4 skips are environmental, not failures — Anthropic Claude upstream not provisioned, MCP upstream
unavailable in the local mock, and Cloud Logging assertions that need an audit-log reader.

```bash
cd ui
npm run test:unit    # offline, no credentials needed
npm run test:live    # requires ui/.env and gcloud auth
npm run test:all
```

---

## ☁️ Deployment

### Deployed Cloud Run configuration

| Setting | Value |
| :--- | :--- |
| Service | `apigee-ai-gateway-ui` |
| Region / platform | `asia-southeast1` / managed |
| Project | `bap-apac-demo2` (number `1058667481809`) |
| Image | `asia-southeast1-docker.pkg.dev/bap-apac-demo2/cloud-run-source-deploy/apigee-ai-gateway-ui:latest` |
| Container port | `8080` |
| Base image | `node:20-alpine`, `CMD ["node", "server.js"]` |
| Service account | `apigee-ui-mgmt-sa@bap-apac-demo2.iam.gserviceaccount.com` |
| Ingress | `internal-and-cloud-load-balancing` |
| Auth | `--no-allow-unauthenticated` (IAP-fronted) |
| Resources | 1000m CPU, 512Mi memory, concurrency 80, max scale 100, min scale 0 |

### Build and deploy

```bash
# 0. Produce dist/ first — the Dockerfile copies it, it does not build it
cd ui && npm run build && cd ..

# 1. Build the container image with Cloud Build
gcloud builds submit --tag asia-southeast1-docker.pkg.dev/bap-apac-demo2/cloud-run-source-deploy/apigee-ai-gateway-ui:latest ui --project=bap-apac-demo2

# 2. Deploy to Cloud Run
gcloud run deploy apigee-ai-gateway-ui \
  --image=asia-southeast1-docker.pkg.dev/bap-apac-demo2/cloud-run-source-deploy/apigee-ai-gateway-ui:latest \
  --region=asia-southeast1 \
  --platform=managed \
  --no-allow-unauthenticated \
  --ingress=internal-and-cloud-load-balancing \
  --service-account=apigee-ui-mgmt-sa@bap-apac-demo2.iam.gserviceaccount.com \
  --project=bap-apac-demo2
```

Full load balancer, IAP, DNS and troubleshooting detail lives in
[cloud_run_iap_deployment_guide.md](file:///Users/maloosatyam/Codebase/AI%20Code/docs/cloud_run_iap_deployment_guide.md).

### Deploying the Apigee proxies

Bundle packaging, validation and deployment are scripted in
[apigee/scripts/](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/scripts):
`package_bundle.sh`, `validate_bundle.py`, `deploy_proxy.sh`, `deploy_all.sh`, plus
`provision_unified_credentials.{sh,py}` for developer/app/product provisioning,
`generate_demo_traffic.py` for seeding demo analytics, and
`test_autorouting.sh` / `test_token_limit.sh` for shell-based smoke tests.

[generate_demo_traffic.py](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/scripts/generate_demo_traffic.py)
populates Apigee Analytics and Monetization with realistic traffic ahead of a demo. It discovers
every active developer and their approved keys through the Management API via `gcloud`
(auto-provisioning a `Unified Admin <username> App` for any developer without one), fans live
requests across `/auto`, `gemini-2.5-flash`, `gemini-3.1-pro-preview` and the other catalog models,
then applies immediate micro-dollar wallet adjustments so prepaid balances reflect the consumption
straight away. No consumer key is ever hardcoded.

```bash
python3 apigee/scripts/generate_demo_traffic.py --requests-per-user 3
```

[test_autorouting.sh](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/scripts/test_autorouting.sh)
runs the offline unit suite and, when `ui/.env` exists, the live suite.

[test_token_limit.sh](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/scripts/test_token_limit.sh)
exercises the 100 tokens/min demo cap against `/models/gemini-2.5-flash:generateContent` — one
request inside the quota and one long prompt expected to trip **HTTP 429**. No consumer key is
committed to the repo, so `API_KEY` is a **required** environment variable: the script prints
`ERROR: API_KEY is not set.` and exits `1` if it is missing. `BASE_URL` and `USER_EMAIL` are
optional overrides, and `-v` enables `set -x` tracing.

```bash
export API_KEY=<consumer key>
./apigee/scripts/test_token_limit.sh
```

---

## 📄 License

This repository is licensed under the Apache 2.0 License.
