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

### 1. 🧠 Model Routing (`/ai/v1/auto`)

Routing is a **two-stage decision**: a small LLM classifies the prompt, and the caller's API
product decides which model that classification is allowed to reach.

**Stage 1 — classify.** [PrepRouterRequest.js](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/resources/jsc/PrepRouterRequest.js)
builds a classification request and `SC-ModelRouter` calls **`gemini-3.1-flash-lite`** on Vertex AI
with a strict `responseSchema` pinning the answer to one of four categories — `coding`,
`deep_reasoning`, `simple`, `general` — at `temperature: 0`. Only the first 500 characters of the
prompt are sent, which bounds classifier latency and cost.

**Stage 2 — entitle.** [AutoRouting.js](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/resources/jsc/AutoRouting.js)
reads the category and resolves the model from a **custom attribute on the caller's API product**:

```
verifyapikey.VA-VerifyAPIKey.apiproduct.routing.model.<category>
```

The policy contains **no model names and no prompt heuristics**. The model map lives entirely on
the product, so the same classification yields a different model per tier:

| Router category | Enterprise AI Tier | Standard AI Tier | Cost tier |
| :--- | :--- | :--- | :--- |
| `coding` | `claude-opus-4-5@20251101` *(anthropic)* | `gemini-3-flash-preview` | high / medium |
| `deep_reasoning` | `gemini-3.1-pro-preview` | `gemini-3-flash-preview` | high / medium |
| `simple` | `gemini-3.1-flash-lite` | `gemini-3.1-flash-lite` | low |
| `general` | `gemini-3-flash-preview` | `gemini-3-flash-preview` | medium |

The Standard branch is **capped at `gemini-3-flash-preview`** — a Standard key can never reach
`gemini-3.1-pro-preview` or `claude-opus-4-5@20251101`, because those names appear nowhere in its
product. Changing the routing map is a **product edit, not a code change**; re-run
`apigee/scripts/provision_unified_credentials.py` and the new mapping takes effect in ~10s with no
proxy redeploy.

**Degradation is explicit.** `SC-ModelRouter` is `continueOnError="true"` with a 2.5s timeout, and
an empty prompt skips the callout entirely. If the classifier times out, errors, or returns
something unparseable, the category stays unresolved and the request falls back to the product's
`routing.model.general`. There is no hidden second classifier: a product that declares no routing
attributes resolves **no model at all** rather than quietly serving one it may not entitle.

`flow.target_provider` is derived from the resolved model name (`claude…` → `anthropic`) and is what
selects the Claude Vertex target at route time. The policy writes `flow.target_model`, `flow.model`,
`flow.target_provider`, `flow.autoRouted`, `flow.routerCategory` and `flow.routingTier`; the chosen
category is echoed to the caller as `x-gateway-category`. `flow.routingTier` is **tracing only** —
it no longer selects a model.

**Routing selects a model; it does not do costing.** `flow.costTier` is set in exactly one place,
[CalculateCost.js](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/resources/jsc/CalculateCost.js),
which derives it from the rate resolved out of the `ai-model-rates` KVM — on cache hits too. The
router used to carry a hardcoded `costTier` literal beside each decision that beat the KVM on the
`/auto` path; that, and the hardcoded zero cost in `AM-SetCacheHitExpected`, have been removed.

### 2. 🛡️ Access Control & Model Armor

- **Prompt sanitization** — [SUP-UserPrompt.xml](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/SUP-UserPrompt.xml)
  is a `SanitizeUserPrompt` policy bound to Model Armor template
  `projects/bap-apac-demo2/locations/asia-southeast1/templates/apigee-sanitize-user-prompt`.
- **Response sanitization** — `SMR-SanitizeModelResponse` runs on successful non-passthrough responses.
- **Identity first** — the request PreFlow resolves identity from a Bearer JWT
  (`DJWT-ExtractUserIdentity` → `AM-SetUserIdentity`) and raises `RF-MissingUserEmail` →
  **HTTP 401** if no `email` claim resolves. The JWT is the **only** accepted source: there is no
  `X-User-Email` header fallback, and a request bearing only that header is rejected.
- **API key verification** — `VA-VerifyAPIKey` runs *after* identity resolution and *before* Model Armor.
- **Blocked calls stay attributable** — the proxy's `DefaultFaultRule` runs `DC-FaultAnalytics`,
  re-emitting `dc_user_email` and `dc_model_name` on the fault path. Without it, faults skip the
  response flow and a blocked request would be counted fleet-wide but belong to no caller.

Anything calling the AI Gateway must send **both** an `x-apikey` *and* an identity JWT. The key
authorises (product, models, quota); the JWT identifies (`email` claim). The
[`agents/`](file:///Users/maloosatyam/Codebase/AI%20Code/agents/) ADK service forwards the end
user's own token from the inbound `/chat` request so ledger, wallet and token-quota spend are
attributed to the real person, and falls back to `APIGEE_IDENTITY_TOKEN` for headless runs.

> [!IMPORTANT]
> API key verification executes **before** Model Armor in the PreFlow. A request that fails key
> validation — including one naming a model its API Product does not entitle — is rejected with
> **HTTP 401** before any prompt is sent for safety evaluation, so an unauthenticated caller
> cannot drive a billable Model Armor call.

### 3. 🎟️ Tokenomics — Product-Driven LLM Token Quotas

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
  <Identifier ref="flow.emailId"/>
  <LLMModelSource>{flow.model}</LLMModelSource>
  <EnforceOnly>true</EnforceOnly>
  <SharedName>common-counter</SharedName>
</LLMTokenQuota>
```

The inline `count="1000"` / `1` / `minute` values are fallback defaults only — the `*Ref` attributes win.
`LTQ-TokenEnforce` enforces, `LTQ-TokenCount` counts, and both share the `common-counter` shared name.

> [!NOTE]
> **Token-quota demo model: `claude-haiku-4-5@20251001`, 50 tokens/min on both AI tiers.**
> It moved off `gemini-2.5-flash` ahead of that model's 2026-10-20 retirement. Claude hosts the
> demo correctly because `JS-FormatClaudeResponse` synthesises `usageMetadata.totalTokenCount`
> in the *target* response flow, before `LTQ-TokenCount` reads it in PostFlow — so the demo now
> also proves token governance works across providers, not just on Google's response shape.
>
> `gemini-2.5-flash` has since been **retired outright**: its `operationConfig` was removed from
> both AI tiers, so it is entitled by no product and now returns **401** at `VA-VerifyAPIKey`.
> Its rate-card entry, `model_rates.properties` rate, `CalculateCost.js` prefix entry and
> analytics colour are deliberately kept, because `server.js` re-costs historical analytics from
> the rate card and deleting them would silently re-price past traffic at the `default` rate.
>
> `gemini-3.5-flash` was **removed** from the `ai-gateway-v1` bundle and the rate card: it was in
> no API product, so it was unreachable and its price key could never be used. It is still a live
> default inside the separate `apigee-go-gen` template set
> ([_helpers.tmpl](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/templates/ai-gateway/_helpers.tmpl)
> routing tiers and several JS resources), which was deliberately left alone.

**`claude-haiku-4-5@20251001` is the deliberate token-limit demo model at 50 tokens / 1 minute.**
Every other operation in [standard_ai_tier.json](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/products/standard_ai_tier.json)
is 2000 tokens / 1 minute. The product declares **5 `operationConfigs` across 4 models**, exactly
one `llmOperation` per config (the Management API rejects more with
`Operations must contain exactly one entity`, and rejects an empty config with
`Operations must contain exactly one entity but found 0 entities` — which is why retiring a model
means deleting its whole wrapper, not just its operation):

| Resource | Model | Token quota |
| :--- | :--- | :--- |
| `/auto` | `auto` | 2000 / 1 min |
| `/auto:*` | `auto` | 2000 / 1 min |
| `/models/gemini-3.1-flash-lite:*` | `gemini-3.1-flash-lite` | 2000 / 1 min |
| `/models/gemini-3-flash-preview:*` | `gemini-3-flash-preview` | 2000 / 1 min |
| **`/models/claude-haiku-4-5@20251001:*`** | `claude-haiku-4-5@20251001` | **50 / 1 min** |

Enforcement is wired through the dedicated `LLMTokenLimitFlow` conditional flow, which fires on
`/models/claude-haiku-4-5@20251001:generateContent`, on
`flow.model == "claude-haiku-4-5@20251001"`, or on the regex `^/models/claude-haiku-4-5.*` — the
last clause deliberately omits the `@date` suffix so a future revision of the same model still
matches. Breaching the limit returns **HTTP 429**.

> [!IMPORTANT]
> The counter is keyed on `flow.emailId`, the SSO-derived caller identity — **not** on the consumer
> key. Every demo user shares the same `Unified Admin … App` credential, so a key-keyed window
> meant two people demoing at once shared one 50-token budget and the second got a 429 they did
> not cause. `LTQ-TokenEnforce` and `LTQ-TokenCount` must declare an **identical** `<Identifier>`:
> they share `common-counter`, and if they diverge the enforcer reads a counter nobody writes to
> and the quota silently stops working.

### 4. 💳 Apigee Native Monetization & Prepaid Wallets

- **Cost calculation** — `KVM-GetModelRates` loads the `ai-model-rates` KVM (`rate_card` entry),
  then [CalculateCost.js](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/resources/jsc/CalculateCost.js)
  computes `flow.tx_cost_micros`.
- **Wallet deduction** — `QC-DeductBudget` debits the developer wallet, and
  `JS-AuditBudgetAccounting` records the outcome in `flow.budget_status`.
  `MLC-EnforceMonetizationLimits` gates the request on the way in with a 403.

- **Budget enforcement** — `QC-EnforceBudgetLimit` checks the counter on the way in and
  `RF-BudgetExceeded` returns **HTTP 429 `RESOURCE_EXHAUSTED`** when it is exhausted.

  > [!IMPORTANT]
  > The quota policy is `continueOnError="true"` on purpose, so its raw
  > `policies.ratelimit.QuotaViolation` never reaches the client; `RF-BudgetExceeded` raises the
  > 429 instead, in the same envelope as every other guardrail. **Deleting that step silently
  > disables budget enforcement entirely** — which is exactly the state this proxy was in until
  > it was added. There is no `ratelimit.<policy>.exceeded` variable; the working signal is
  > `ratelimit.<policy>.failed = true and ratelimit.<policy>.exceed.count > 0`.
- **Prepaid provisioning** — [server.js](file:///Users/maloosatyam/Codebase/AI%20Code/ui/server.js#L531-L569)
  sets `billingType: PREPAID` and credits a **$20 USD** starting balance. This now runs from the
  explicit `/api/me/onboard` step rather than silently on sign-in — see
  [First-run developer onboarding](#first-run-developer-onboarding).
- **Rate plans & attribution** — surfaced through the `/api/monetization/*` endpoints
  (rate plans, subscriptions, attributions, credit, config).

### 5. ⚡ Cache (Vertex AI Vector Search)

[SCL-Semantic-Cache-Lookup.xml](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/SCL-Semantic-Cache-Lookup.xml)
embeds the prompt with Vertex AI `text-embedding-004` and queries a Vertex AI Vector Search index
endpoint (`DeployedIndexID: semantic_cache`) with a similarity **threshold of 0.95**.
`SCP-Semantic-Cache-Populate` writes successful responses back.

Caching is **opt-in per request** — the lookup only runs when the `use-cache` or `x-use-cache`
header is `true`. On a hit, `flow.cached` is `"true"`, which skips `QC-DeductBudget` and
`LTQ-TokenCount` — so a cache hit costs no tokens and no wallet balance.

`KVM-GetModelRates` and `JS-CalculateCost` **do** still run on a hit; they are gated on
`response.status.code = 200` alone. That is what populates `x-gateway-cost-tier` on a cached
response, which was previously empty. `CalculateCost.js` zeroes the cost itself on a hit rather
than being skipped. A hit reports `x-gateway-budget-status: skipped_cached`.

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
| `x-gateway-category` | `flow.routerCategory` | Category the router model returned: `coding` / `deep_reasoning` / `simple` / `general`. Empty when the classifier was skipped or failed |
| `x-gateway-router-category` | `flow.routerCategory` | Alias of the above, kept so the UI trace inspector and the analytics dashboard can read either name |
| `x-gateway-cost-tier` | `flow.costTier` | `low` / `medium` / `high` routing classification |
| `x-gateway-cost-usd` | `flow.tx_cost_usd` | Computed request cost |
| `x-gateway-currency` | *(literal `USD`)* | Currency for the cost fields |
| `x-gateway-cached` | `flow.cached` | `"true"` on a semantic cache hit |
| `x-gateway-cache-status` | `flow.cacheStatus` | Cache lookup outcome detail |
| `x-gateway-prompt-tokens` | `flow.promptTokenCount` | Input tokens |
| `x-gateway-completion-tokens` | `flow.candidatesTokenCount` | Output tokens |
| `x-gateway-total-tokens` | `flow.totalTokenCount` | Total tokens, and the quota-counted figure |
| `x-gateway-budget-status` | `flow.budget_status` | Budget accounting outcome — see below |
| `x-gateway-budget-used-usd` | `flow.budget_used_usd` | Developer spend recorded this interval |
| `x-gateway-budget-limit-usd` | `flow.budget_limit_usd` | Budget cap the counter is measured against |
| `x-gateway-monetization-status` | `mint.limitscheck.status_message` | Monetization limit-check verdict |
| `x-gateway-prepaid-balance` | `mint.limitscheck.prepaid_developer_balance` | Wallet balance at check time |
| `x-gateway-prepaid-currency` | `mint.limitscheck.prepaid_developer_currency` | Wallet currency |
| `x-gateway-balance-remaining` | `flow.prepaid_balance_remaining` | Balance after this request's deduction |

`x-gateway-budget-status` exists because budget accounting is fail-open by design and every way
it can break is otherwise silent — `QC-DeductBudget` swallows its own faults, and a
`JS-CalculateCost` failure skips the step with no fault raised at all.
[AuditBudgetAccounting.js](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/resources/jsc/AuditBudgetAccounting.js)
runs unconditionally after the deduction and names the outcome:

| Value | Meaning |
| :--- | :--- |
| `ok` | Cost computed, counter incremented |
| `skipped_cached` | Semantic cache hit — deliberately not charged |
| `skipped_no_cost` | **Silent failure** — costing produced no weight |
| `skipped_not_run` | Step condition matched nothing, or policy disabled |
| `violation` | Quota raised, but the spend *was* recorded — cap now crossed |
| `error` | **Silent failure** — quota faulted before counting; spend lost |

The same values are logged to Cloud Logging as `budgetStatus`, which is the surface to alert on.

The policy runs with `continueOnError="true"` and `<IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>`,
so an unset variable yields an absent or empty header rather than a fault — clients must treat every
header as optional. On a cache hit the cost and token variables are never populated, which is why
`x-gateway-cached` is the field to branch on.

### 7. 🛠️ Native MCP Server & Tools Governance

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
globs** — both were removed. Each model gets a single gateway-shaped resource:

```
/models/<model>:*
```

| Product | Models | Resources | Token quota |
| :--- | :--- | :--- | :--- |
| **[Standard AI Tier](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/products/standard_ai_tier.json)** | `auto`, `gemini-3.1-flash-lite`, `gemini-3-flash-preview`, `claude-haiku-4-5@20251001` — **4** | 5 `operationConfigs` | 2000 / min · `claude-haiku-4-5@20251001` → **50 / min** |
| **[Enterprise AI Tier](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/products/enterprise_ai_tier.json)** | the Standard 4 plus `gemini-3.1-pro-preview`, `gemini-3.7-flash`, `gemini-3.8-flash` and `claude-opus-4-5@20251101` — **8** | 9 `operationConfigs` | 10000 / min · `claude-haiku-4-5@20251001` → **50 / min** |

`auto` is special-cased with **two exact resources** in both products:

```
/auto        /auto:*
```

Apigee's `*` matches within a single path segment and requires **at least one character**, so
`/auto*` does **not** match a bare `/auto` — hence `/auto` must be granted as its own exact
resource. The tightened `:*` suffix form is deliberate too: a trailing `*` placed directly after a
model name leaks siblings (`/models/gemini-2.5-flash*` also granted `gemini-2.5-flash-lite`),
whereas `:*` only absorbs the `:generateContent` / `:streamGenerateContent` suffix.

Bare `/auto` is the only auto surface: `AutoRoutingFlow` matches
`proxy.pathsuffix MatchesPath "/auto*"` or the regex `^/auto.*`, and that is what the UI calls.
`/models/auto` is no longer entitled by either product and is rejected with **400** at
`OAS-ValidateRequest`, because the path is absent from the OpenAPI spec.

> [!NOTE]
> Standard AI Tier **does** include `claude-haiku-4-5@20251001`. It does **not** enumerate
> `gemini-3.1-pro-preview` or `claude-opus-4-5@20251101`, so calls to those models with a Standard
> key are rejected by `VA-VerifyAPIKey`. Both products use
> `llmOperationGroup.operationConfigs[].llmTokenQuota` with exactly one `llmOperation` per config;
> neither uses the classic product `quota` field. The 50 tokens/min `claude-haiku-4-5@20251001` demo cap
> applies in **both** tiers.

`gemini-3.1-ultra` is deliberately **unentitled in every product**. It powers the "Restricted Model"
demo scenario: even an Enterprise key is rejected at `VA-VerifyAPIKey` with **HTTP 401** before any
upstream call is made.

---

### 8. 📜 Full Audit Logs

Every governed call is written to Cloud Logging by
[`ML-CloudLogging`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/ML-CloudLogging.xml)
at `projects/bap-apac-demo2/logs/apigee`. The policy sits in **`PostClientFlow`**, which runs after
the response is flushed **and still fires on faults** — so successful, blocked and failed calls are
all captured.

Each record carries the identity (`userEmail`), the resolved `model` and path-derived
`requestedModel`, `targetProvider`, `autoRouted`, `cached`, `costUsd`, token counts, the full
`prompt` and `response`, plus `faultName` / `errorMessage`.

In the UI, the **Model Consumption Ledger** (Analytics & Cost) has a **View logs** link on every
`(user, model)` row. It opens a per-call table — timestamp, status, request, response, tokens, cost
and auto-routed / cached flags — with an **Open in Cloud Logging** deep link. Rows expand to reveal
the untruncated request and response.

The window selector offers `1h / 24h / 7d / 30d` and **opens on whichever range is selected on the
Analytics & Cost tab** (`24h` by default), so the drill-down always covers the same period as the
ledger row that spawned it. Narrowing it inside the modal does not change the dashboard.

| Piece | Location |
| :--- | :--- |
| Log policy | [`ML-CloudLogging.xml`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/ML-CloudLogging.xml) |
| Response-text extraction | [`EV-ModelResponse.xml`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/EV-ModelResponse.xml) |
| Read API | `GET /api/logs/calls` in [`server.js`](file:///Users/maloosatyam/Codebase/AI%20Code/ui/server.js) |
| UI | [`CallLogsModal.tsx`](file:///Users/maloosatyam/Codebase/AI%20Code/ui/src/components/CallLogsModal.tsx) |

> [!IMPORTANT]
> The server identity (`apigee-ui-mgmt-sa@bap-apac-demo2.iam.gserviceaccount.com`) needs
> `roles/logging.viewer`. The same service account backs both local development and Cloud Run, so a
> single grant covers both.

> [!CAUTION]
> `prompt` and `response` persist **full, untruncated** user content to Cloud Logging. This is a
> deliberate demo-fidelity choice. Redact or drop those two fields before handling real user data.

Model Armor blocks at `SUP-UserPrompt` in PreFlow, *before* the target model is resolved — such a
record has an empty `model`, which is why `requestedModel` is logged and why the read API matches
**either** field.

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
        │   └── Navbar.tsx  ScenarioPresets.tsx
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
| `npm test` | `node --test tests/autorouting.unit.test.mjs tests/calculatecost.unit.test.mjs` | Alias of `test:unit` |
| `npm run test:unit` | `node --test tests/autorouting.unit.test.mjs tests/calculatecost.unit.test.mjs` | Both offline unit suites (72 tests) |
| `npm run test:autorouting` | `node --test tests/autorouting.unit.test.mjs` | Model-selection suite only (46 tests) |
| `npm run test:cost` | `node --test tests/calculatecost.unit.test.mjs` | Cost-calculation suite only (26 tests) |
| `npm run test:live` | `node --env-file=.env --test tests/gateway-live.test.mjs` | Live gateway integration suite |
| `npm run test:all` | unit suites `&&` live suite | Everything |

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
`/api/ai-dev`, `/api/ai-prod`, `/api/vertexai-dev`,
`/api/vertexai-prod`, `/api/mcp-dev`, and `/api/mcp-prod`.

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

Three suites live in [ui/tests/](file:///Users/maloosatyam/Codebase/AI%20Code/ui/tests):

| Suite | File | Command | Network | Current result |
| :--- | :--- | :--- | :--- | :--- |
| Auto-routing unit | [autorouting.unit.test.mjs](file:///Users/maloosatyam/Codebase/AI%20Code/ui/tests/autorouting.unit.test.mjs) | `npm run test:autorouting` | Offline | **46 tests — 46 pass, 0 fail, 0 skipped** |
| Cost calculation unit | [calculatecost.unit.test.mjs](file:///Users/maloosatyam/Codebase/AI%20Code/ui/tests/calculatecost.unit.test.mjs) | `npm run test:cost` | Offline | **26 tests — 26 pass, 0 fail, 0 skipped** |
| Live gateway integration | [gateway-live.test.mjs](file:///Users/maloosatyam/Codebase/AI%20Code/ui/tests/gateway-live.test.mjs) | `npm run test:live` | Live Apigee | **22 tests — see modes below** |

`npm run test:unit` runs both offline suites together (**72 tests**).

The live suite is organised into four describe blocks:

1. Local Auth & Identity Endpoint (`/api/me`)
2. Apigee AI Gateway — Live Vertex AI (Gemini)
3. Apigee Tools Gateway — Live MCP Backend
4. Apigee AI Gateway — Intelligent Auto-Routing (`/auto`)

It first probes `http://localhost:3000/api/me`; if the dev server is up it routes through the local
proxy and harvests API keys from the `/api/me` response, otherwise it falls back to calling
`https://api.maloosatyam.demo.altostrat.com` directly. It also retries HTTP 429 responses with
backoff, since the `claude-haiku-4-5@20251001` quota demo is deliberately tight.

**The result depends on which target it picked**, so the suite prints a provenance banner naming the
target, the JWT identity, and the source of each API key before any test runs:

| Target | Result |
| :--- | :--- |
| Local proxy (`node server.js` on `:3000`) | **22 pass, 0 fail, 0 skipped** |
| Direct Apigee (no local server) | **18 pass, 0 fail, 4 skipped** |

The 4 skips are the tests that can only run against the local proxy — the two `/api/me` checks, the
proxy route check, and the SSO-token test, which cannot obtain a token without `/api/me`. They are
not upstream or provisioning failures.

When keys are not supplied via `.env` or `/api/me` the suite discovers them from Apigee with
`gcloud`. Two separate developers are involved, and they are selected independently:

| Variable | Default | Selects |
| :--- | :--- | :--- |
| `APIGEE_ORG` | `bap-apac-demo2` | Org queried for apps and keys |
| `APIGEE_DEVELOPER` | `VITE_SSO_USER_EMAIL` | Developer owning the **admin** app → `ADMIN_KEY` |
| `APIGEE_PERSONA_DEVELOPER` | `maloosatyam@gmail.com` | Developer owning the **sales/loans** apps (MCP personas only) |

> [!IMPORTANT]
> The admin key must belong to the same developer as the JWT identity. The AI Gateway attributes LLM
> token quota to the JWT email (`flow.emailId`) but developer budget to the key's developer
> (`verifyapikey.VA-VerifyAPIKey.developer.id`). If they diverge, the suite still passes while
> measuring two different subjects. A duplicate admin app exists under `maloosatyam@gmail.com`, so
> the banner prints a `!!` warning whenever the discovered admin key's developer is not the JWT
> identity. The sales/loans divergence is expected — those personas exist only for the MCP Gateway
> demo and are deliberately owned by a different developer.

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
requests across `/auto`, `gemini-3.1-flash-lite`, `gemini-3.1-pro-preview` and the other catalog models,
then applies immediate micro-dollar wallet adjustments so prepaid balances reflect the consumption
straight away. No consumer key is ever hardcoded.

```bash
python3 apigee/scripts/generate_demo_traffic.py --requests-per-user 3
```

[test_autorouting.sh](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/scripts/test_autorouting.sh)
runs the offline unit suite and, when `ui/.env` exists, the live suite.

[test_token_limit.sh](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/scripts/test_token_limit.sh)
exercises the 50 tokens/min demo cap against `/models/claude-haiku-4-5@20251001:generateContent` — one
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
