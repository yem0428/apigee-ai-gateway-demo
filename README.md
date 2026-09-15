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
product tier** (`verifyapikey.VA-VerifyAPIKey.tier`, or a product name containing `standard`).

| Prompt class (heuristic) | Enterprise tier target | Standard tier target | Cost tier |
| :--- | :--- | :--- | :--- |
| Coding (`def `, `class `, `SELECT `, ` ``` `, `refactor`, `regex`, …) | `claude-opus-4-5@20251101` *(anthropic)* | `gemini-3-flash` | high / medium |
| Deep reasoning (`compare`, `architect`, `trade-off`, `benchmark`, `root cause`, …) | `gemini-3.1-pro-preview` | `gemini-3-flash` | high / medium |
| Simple (< 200 chars, no coding or reasoning hits) | `gemini-3.1-flash-lite` | `gemini-3.1-flash-lite` | low |
| Everything else (≥ 200 chars, general) | `gemini-3-flash` | `gemini-3-flash` | medium |

Coding heuristics take precedence over deep-reasoning heuristics. The policy writes
`flow.target_model`, `flow.model`, `flow.target_provider`, `flow.autoRouted` and `flow.costTier`;
`flow.target_provider == "anthropic"` is what selects the Claude Vertex target at route time.

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

**`gemini-2.5-flash` is the deliberate token-limit demo model at 100 tokens / 1 minute.**
Every other operation in [standard_ai_tier.json](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/products/standard_ai_tier.json)
is 2000 tokens / 1 minute:

| Resource | Model | Token quota |
| :--- | :--- | :--- |
| `/auto*` | `auto` | 2000 / 1 min |
| `/models/auto*` | `auto` | 2000 / 1 min |
| **`/models/gemini-2.5-flash*`** | `gemini-2.5-flash` | **100 / 1 min** |
| `/models/gemini-3.1-flash-lite*` | `gemini-3.1-flash-lite` | 2000 / 1 min |
| `/models/gemini-3-flash*` | `gemini-3-flash` | 2000 / 1 min |
| `/models/claude-3-5-haiku*` | `claude-3-5-haiku` | 2000 / 1 min |
| `/v1/**` | `*` | 2000 / 1 min |

Enforcement is wired through the dedicated `LLMTokenLimitFlow` conditional flow, which fires on
`/models/gemini-2.5-flash:generateContent`, on `flow.model == "gemini-2.5-flash"`, or on the
regex `^/models/gemini-2.5-flash.*`. Breaching the limit returns **HTTP 429**.

### 4. 💳 Apigee Native Monetization & Prepaid Wallets

- **Cost calculation** — `KVM-GetModelRates` loads the `ai-model-rates` KVM (`rate_card` entry),
  then [CalculateCost.js](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/resources/jsc/CalculateCost.js)
  computes `flow.tx_cost_micros`.
- **Wallet deduction** — `QC-DeductBudget` debits the developer wallet; `QC-EnforceBudgetLimit` and
  `MLC-EnforceMonetizationLimits` gate the request on the way in.
- **Prepaid auto-provisioning** — [server.js](file:///Users/maloosatyam/Codebase/AI%20Code/ui/server.js#L276-L325)
  sets `billingType: PREPAID` and credits a **$20 USD** starting balance for a first-time developer.
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

### 6. 🛠️ MCP Tools Gateway Governance

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

| Product | Grants (resource → token quota) |
| :--- | :--- |
| **[Standard AI Tier](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/products/standard_ai_tier.json)** | `/auto*`, `/models/auto*`, `gemini-3.1-flash-lite`, `gemini-3-flash`, `claude-3-5-haiku`, `/v1/**` → 2000 / min · `gemini-2.5-flash` → **100 / min** |
| **[Enterprise AI Tier](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/products/enterprise_ai_tier.json)** | `/auto*`, `/models/auto*`, `/models/*`, `/*` → 10000 / min · `gemini-2.5-flash` → **100 / min** |

> [!NOTE]
> Standard AI Tier **does** include `claude-3-5-haiku`. It does **not** enumerate
> `gemini-3.1-pro-preview` or `claude-opus-4-5`, so calls to those models with a Standard key are
> rejected by `VA-VerifyAPIKey`. Enterprise AI Tier's `/models/*` and `/*` wildcards cover them.
> Both products use `llmOperationGroup.operationConfigs[].llmTokenQuota`; neither uses the classic
> product `quota` field. The 100 tokens/min `gemini-2.5-flash` demo cap applies in **both** tiers.

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
        ├── components/                    # 13 components
        │   ├── AnalyticsDashboard.tsx     ApigeeLogo.tsx        ChatPlayground.tsx
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
(the last is admin-view only). The underlying `AppTab` union in
[types/index.ts](file:///Users/maloosatyam/Codebase/AI%20Code/ui/src/types/index.ts#L131) also carries
`kvm-pricing` and `rate-cards`, which render inside the Monetization surface.

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
[vite.config.ts](file:///Users/maloosatyam/Codebase/AI%20Code/ui/vite.config.ts#L1084-L1085).

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
| Auto-routing unit | [autorouting.unit.test.mjs](file:///Users/maloosatyam/Codebase/AI%20Code/ui/tests/autorouting.unit.test.mjs) | `npm run test:unit` | Offline | **42 tests — 42 pass, 0 fail, 0 skipped** |
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
`provision_unified_credentials.{sh,py}` for developer/app/product provisioning and
`test_autorouting.sh` / `test_token_limit.sh` for shell-based smoke tests.

---

## 📄 License

This repository is licensed under the Apache 2.0 License.
