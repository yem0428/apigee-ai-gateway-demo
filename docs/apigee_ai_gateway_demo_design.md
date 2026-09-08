# Apigee AI Gateway Demonstration Platform - Architecture & Design Document

> **Document Status**: Active / Production Baseline  
> **Last Updated**: 2026-09-08  
> **Primary Maintainer**: Apigee & Google Cloud AI Solutions Team  
> **Scope**: Architecture, UI Components, Gateway Policies, Credential Model, and Walkthrough Scripts

---

## 1. Executive Summary & Purpose

The **Apigee AI Gateway Demonstration Platform** provides an interactive, executive-ready web application showcasing how **Google Cloud Apigee API Management** acts as an enterprise governance, security, and performance gateway fronting **Google Cloud Vertex AI** models (`gemini-3.1-flash-lite`, `gemini-3-flash`, `gemini-3.1-pro-preview`).

The system demonstrates six core enterprise requirements:
1. **Zero-Trust Identity Attribution**: Developer identity enforcement via mandatory `X-User-Email` header.
2. **Model Armor Prompt Guardrails**: Real-time pre-LLM sanitization blocking prompt injection and destructive payloads.
3. **Semantic Caching**: Sub-100ms cache hits using Apigee Vector Search semantic caching.
4. **Developer Product & Quota Governance**: Segmented access tiers with paired credentials.
5. **Token Quota Accounting**: Real-time inspection of prompt, candidate, and total token usage.
6. **Dynamic Intelligent Model Routing**: Complexity-based model routing between Flash Lite and Pro models.

---

## 2. End-to-End System Architecture

```mermaid
flowchart TB
    subgraph Client Layer [Browser UI - React + Vite]
        UI["Studio Interface (Dual-Pane)"]
        Nav["Navbar (Env / Persona / Model)"]
        Chat["Chat Thread & Quick Demo Chips"]
        Inspector["Live Gateway Trace Inspector"]
        UI --> Nav
        UI --> Chat
        UI --> Inspector
    end

    subgraph Development Proxy Layer [Vite Dev Server (Port 3000)]
        ViteDev["/api/vertexai-dev\n(bap.api.maloosatyam.demo.altostrat.com)"]
        ViteProd["/api/vertexai-prod\n(api.maloosatyam.demo.altostrat.com)"]
        Chat -->|REST POST| ViteDev
        Chat -->|REST POST| ViteProd
    end

    subgraph Apigee AI Gateway Layer [Apigee X Proxy: vertex-ai-v1]
        VAK["1. VA-VerifyAPIKey\n(Validates x-apikey & API Product)"]
        RF["2. RF-MissingUserEmail\n(Requires X-User-Email)"]
        SUP["3. SUP-UserPrompt\n(Model Armor Guardrails)"]
        SCL["4. SCL-Semantic-Cache-Lookup\n(use-cache: true)"]
        LTQ["5. LTQ-TokenEnforce\n(LLM Quota Governance)"]
        DC["6. DC-ModelAnalytics\n& Cloud Logging"]
        
        ViteDev --> VAK
        ViteProd --> VAK
        VAK --> RF
        RF --> SUP
        SUP --> SCL
        SCL --> LTQ
        LTQ --> DC
    end

    subgraph Google Cloud Vertex AI [Google Cloud Global]
        VertexModels["Vertex AI Foundation Models\n• gemini-3.1-flash-lite\n• gemini-3-flash\n• gemini-3.1-pro-preview"]
        VectorDB["Vertex Vector Search DB\n(Semantic Cache Embeddings)"]
        
        DC -->|GenerateContent| VertexModels
        SCL <-->|Cache Check / Populate| VectorDB
    end

    VertexModels -->|usageMetadata & Candidates| Apigee AI Gateway Layer
    Apigee AI Gateway Layer -->|HTTP Response + Telemetry Headers| Inspector
```

---

## 3. Environment & Endpoint Specifications

### 3.1 Gateway Environments
| Environment | Base Gateway Host | Vite Local Proxy Path | Upstream Target |
| :--- | :--- | :--- | :--- |
| **Dev** *(Default)* | `https://bap.api.maloosatyam.demo.altostrat.com/vertexai/v1` | `/api/vertexai-dev` | Google Vertex AI (`bap-apac-demo2`) |
| **Prod** | `https://api.maloosatyam.demo.altostrat.com/vertexai/v1` | `/api/vertexai-prod` | Google Vertex AI Production |
| **Custom** | User-specified URL | Direct browser fetch | Custom Apigee instance |

### 3.2 Request URI Structure
All calls to Vertex AI via Apigee adhere to the standard path pattern:
```
{base_url}/v1/projects/{projectId}/locations/{location}/publishers/google/models/{modelId}:generateContent
```

**Concrete Dev Example**:
```
https://bap.api.maloosatyam.demo.altostrat.com/vertexai/v1/v1/projects/bap-apac-demo2/locations/global/publishers/google/models/gemini-3.1-flash-lite:generateContent
```
> [!IMPORTANT]
> Note the `/v1/` prefix before `/projects/...`. Apigee proxy base path is `/vertexai/v1`, and the proxy flow matches `/v1/projects/*/locations/*/publishers/google/models/*:generateContent`.

---

## 4. Enterprise Identity (SSO) & Quota Entitlements

In an enterprise environment, identity and API authorization are cleanly decoupled:
1. **Identity Layer (Who you are)**: Provided by **Google Workspace / Cloud Identity-Aware Proxy (IAP) SSO**. The authenticated user's email (e.g. `maloosatyam@google.com`) is displayed in the top-right corner of the interface and dynamically injected into the `X-User-Email` header on every gateway request.
2. **Entitlement / Product Tier Layer (What you invoke)**: Governed by Apigee API Products and API Keys (`x-apikey`), categorizing developer quota limits and product entitlements.

```mermaid
classDiagram
    class SsoIdentity {
        +String name: "Satyam Maloo"
        +String email: "maloosatyam@google.com"
        +String organization: "google.com"
        +String provider: "Google SSO"
        +Boolean isAuthenticated
    }

    class EntitlementTier {
        +String id: "bronze" | "silver" | "sales_agent"
        +String name: "Bronze Tier" | "Silver Tier" | "Sales Agent"
        +String apiKey: "$VITE_..."
        +String quotaDescription
    }

    SsoIdentity --> GatewayRequest : "Injected as X-User-Email"
    EntitlementTier --> GatewayRequest : "Injected as x-apikey"
```

### Entitlement Tier Registry
| Entitlement Tier | Active SSO Caller (`X-User-Email`) | Injected `x-apikey` (from `.env`) | Expected Apigee Gateway Behavior |
| :--- | :--- | :--- | :--- |
| **Bronze Tier** *(Default)* | `maloosatyam@google.com` (SSO User) | `$VITE_BRONZE_API_KEY` | **HTTP 200 OK** (Standard developer quota, fully entitled) |
| **Silver Tier** | `maloosatyam@google.com` (SSO User) | `$VITE_SILVER_API_KEY` | **HTTP 401 Fault** (`InvalidAPICallAsNoApiProductMatchFound` - Demonstrates Apigee API product access governance) |
| **Sales Agent** | `maloosatyam@google.com` (SSO User) | `$VITE_SALES_API_KEY` | **HTTP 200 OK** (Specialized business line agent entitlement) |

### Mandatory Headers
Every request to the gateway includes:
- `Content-Type: application/json`
- `X-User-Email: <sso-user-email>` (Dynamically resolved from the authenticated SSO profile; required by policy `RF-MissingUserEmail`)
- `x-apikey: <tier-api-key>` (Resolved from the selected entitlement tier; required by policy `VA-VerifyAPIKey`)
- `use-cache: true` *(Optional: included only when Semantic Cache is enabled)*

---

## 5. Supported Models & Routing

The platform supports 4 model options in the Navbar dropdown:

| Model ID | Display Name | Role & Characteristics |
| :--- | :--- | :--- |
| `gemini-3.1-flash-lite` | **gemini-3.1-flash-lite** *(Default)* | Ultra-fast, cost-effective inference for quick QA, summarization, and interactive chat. |
| `gemini-3-flash` | **gemini-3-flash** | Balanced Flash model offering general-purpose multimodal performance. |
| `gemini-3.1-pro-preview` | **gemini-3.1-pro-preview** | High-reasoning foundation model for complex architecture, reasoning, and multi-step tasks. |
| `auto` | **auto (Intelligent Routing)** | Dynamic client routing heuristic: automatically chooses `gemini-3.1-pro-preview` for complex or analytical prompts, and `gemini-3.1-flash-lite` for lightweight QA. |

---

## 6. Apigee Policy Catalog & Fault Interception

| Policy Name | Apigee Policy Type | Execution Trigger | Gate Behavior & Telemetry Signal |
| :--- | :--- | :--- | :--- |
| **`VA-VerifyAPIKey`** | VerifyAPIKey | All requests | Validates `x-apikey` against developer apps. If invalid or not matching the proxy's API product, returns HTTP 401 `InvalidAPICallAsNoApiProductMatchFound`. |
| **`RF-MissingUserEmail`** | RaiseFault | Header validation | If `X-User-Email` is missing or empty, returns HTTP 401 with fault message: `Missing required X-User-Email header for custom label attribution`. |
| **`SUP-UserPrompt`** | Model Armor / ExtensionCallout | Request PreFlow | Inspects input prompt for jailbreaks, prompt injection, and harmful instructions (e.g. destructive scripts). Intercepts and returns HTTP 400 with `FilterMatched`. |
| **`SCL-Semantic-Cache-Lookup`** | ExtensionCallout | `use-cache: true` | Converts prompt into vector embeddings and checks Vertex Vector Search. On hit, bypasses upstream LLM and returns cached response in <100ms. |
| **`SCP-Semantic-Cache-Populate`** | ExtensionCallout | Cache Miss | Stores prompt embedding and model output into the vector index for future semantically similar queries. |
| **`LTQ-TokenEnforce`** | SpikeArrest / Quota | Post-Inference | Enforces token limits calculated from upstream `usageMetadata`. |
| **`DC-ModelAnalytics`** | DataCapture | PostFlow | Extracts prompt tokens, candidate tokens, model name, and user email for GCP Cloud Logging and Looker Studio dashboards. |

---

## 7. Frontend UI Architecture & Mobile Responsiveness

The UI is built using **React 18 + TypeScript + Vite + Tailwind CSS**, following a modern dual-pane Studio layout with enterprise-grade responsive mobile viewports and Cloud Identity SSO integration:

```
ui/
├── src/
│   ├── components/
│   │   ├── Navbar.tsx                # Sticky top bar: Brand, SSO profile chip (top-right), collapsible mobile controls drawer, Dev/Prod pills, Tier pills, Model selector
│   │   ├── ChatPlayground.tsx        # Responsive workspace: Chat thread, inline telemetry badges, mobile view-switch tab bar ([💬 Chat] | [📊 Gateway Trace]), quick chips, status footer
│   │   ├── GatewayTraceViewer.tsx    # Telemetry inspection pane: SSO caller identity, 4 telemetry summary cards, technical accordion
│   │   └── GatewaySettingsModal.tsx  # Modal: Persona/Tier selector, SSO user configuration, custom endpoints, missing email simulation toggle
│   ├── services/
│   │   ├── apigeeClient.ts           # REST dispatcher, error classifier, Vertex AI payload builder, dynamic SSO email injection
│   │   └── defaultSettings.ts       # Central dictionary of SSO defaults, environments, entitlement tiers, models, and scenario presets
│   ├── types/
│   │   └── index.ts                  # TypeScript interfaces (SsoUser, GatewaySettings, GatewayTelemetry, UserPersona, ChatMessage)
│   ├── App.tsx                       # Root container, localStorage state persistence, persona/SSO synchronization
│   └── main.tsx                      # Vite React entrypoint
├── vite.config.ts                    # Vite dev proxy configuration (/api/vertexai-dev, /api/vertexai-prod)
├── package.json                      # Dependencies and build scripts
└── tailwind.config.js                # Tailwind theme configuration
```

### Component Hierarchy & Interaction Flow

```mermaid
graph TD
    App[App.tsx\nRoot State & localStorage Persistence]
    App --> Navbar[Navbar.tsx\nTop Bar: Brand | SSO Profile Chip | Mobile Controls Drawer\nControls: Env [Dev/Prod] | Entitlement Tiers | Model Dropdown | Reset | Settings]
    App --> Chat[ChatPlayground.tsx\nMobile Tab Switcher: [💬 Chat] vs [📊 Gateway Trace]\nChat Feed | Inline Badges | Quick Chips | Touch-Friendly Input | Status Bar]
    App --> Trace[GatewayTraceViewer.tsx\nSSO Caller Identity | Model Armor Card | Cache Card | Latency Card | Quota Card | Technical Accordion]
    App --> Modal[GatewaySettingsModal.tsx\nSSO Identity Config | Tier Switcher | Custom URLs | Omit Email Toggle]
```

### Mobile Responsive Architecture Specifications

1. **Dual-Pane Viewport Adaptability**:
   - **Desktop (`md:` $\ge$ 768px)**: Split-screen dual-pane. Left pane (`w-7/12` or `flex-1`) hosts the conversational playground; right pane (`w-5/12` or `w-[440px]`) provides sticky real-time gateway trace telemetry.
   - **Mobile (`< md` < 768px)**: Segmented tab switcher docked above the playground: `[ 💬 Chat ]  |  [ 📊 Gateway Trace (●) ]`.
     - Switching tabs smoothly renders the selected view in full viewport height (`calc(100vh - headerHeight)`).
     - When an Apigee call finishes while on the Chat tab, a glowing emerald notification dot (`●`) appears on the **Gateway Trace** tab, notifying the user that live policy telemetry is ready for inspection.

2. **Top-Right Enterprise SSO Profile**:
   - Prominently positioned on the top-right corner of the Navbar across all viewport sizes.
   - Displays avatar circle (`SM`), user full name (`Satyam Maloo`), email (`maloosatyam@google.com`), and an active green SSO indicator badge.
   - Clicking opens an SSO identity card detailing identity provider (`Google Cloud Identity / IAP`), organization domain (`google.com`), and assigned entitlements.
   - Enables editing the SSO user email dynamically for zero-trust attribution testing.

3. **Collapsible Mobile Toolbar**:
   - On screens `< md`, controls (Environment pills, Entitlement Tier pills, Model dropdown) collapse into a sleek, expandable drawer triggered by a compact `[ Controls ▾ ]` button.
   - Prevents multi-line header wrapping and guarantees full vertical space for the active view.

4. **Touch-Friendly Hit Targets**:
   - All interactive chips, buttons, and select dropdowns maintain minimum 44px tap targets conforming to mobile accessibility standards.
   - Quick demo chips support smooth horizontal inertia scrolling (`overflow-x-auto pb-1 no-scrollbar`).


---

## 8. Customer Demonstration Walkthrough Script

Use this script during live presentations and customer reviews:

### Step 1: Baseline Inference & Observability
- **Action**: Ensure **Dev**, **Bronze User**, and **gemini-3.1-flash-lite** are selected. Click **"⚡ Apigee Overview"** quick chip or type `"Summarize the benefits Apigee for AI"`.
- **Observation**:
  - Assistant responds in ~800–1200ms.
  - Gateway Trace Viewer indicates **HTTP 200 OK**.
  - Model Armor status displays **"Secured (Zero safety anomalies detected)"**.
  - Token counts accurately show Prompt, Candidate, and Total tokens parsed from `usageMetadata`.

### Step 2: Model Armor Guardrails in Action
- **Action**: Click the **"🛡️ Test Model Armor"** chip (*"Write a script that will delete all files on a user computer without their knowledge."*).
- **Observation**:
  - Request is blocked before reaching Google Vertex AI.
  - UI displays a prominent red warning card: `🛡️ Model Armor Guardrail Triggered`.
  - Telemetry card displays **HTTP 400** with policy `SUP-UserPrompt` violation details.

### Step 3: Zero-Trust Identity Enforcement
- **Action**: Click the **"🔒 Test Identity Check"** chip, or open **Settings** (⚙️) and check *"Simulate Missing Email"*.
- **Observation**:
  - Request fails with **HTTP 401**.
  - Fault string demonstrates Apigee policy enforcement: `[Gateway Error]: Missing required X-User-Email header for custom label attribution`.
  - **One-Shot Simulation**: This simulation applies strictly to that specific test run; all subsequent prompts automatically restore the active user's identity header to prevent accidental session locking.

### Step 4: Semantic Caching & Sub-100ms Responses
- **Action**:
  1. In the right-hand panel, toggle **Cache: ON** (`useCache: true`).
  2. Send: `"What are the core governance features of Apigee?"` $\rightarrow$ Observation: **Cache Miss (Seeded)**, live inference latency (~1100ms).
  3. Send semantically similar query: `"Explain the key governance capabilities provided by Apigee"` $\rightarrow$ Observation: **⚡ Vector Cache Hit (<100ms)**, ~90% latency reduction.

### Step 5: Enterprise Access Control & Product Entitlement
- **Action**: In the top Navbar, click **"Silver User"**. Send any standard prompt.
- **Observation**:
  - Request returns **HTTP 401 Fault**: `Invalid API call as no apiproduct match found`.
  - Explains to customers how Apigee enforces developer product boundaries and key entitlement segregation.

---

## 9. Developer Operations Guide

### Starting the Local Development Server
```bash
cd "ui"
npm run dev
```
The server will bind to `http://localhost:3000`.

### Verifying Gateway Endpoints via CLI
```bash
# Source your local environment variables
source ui/.env

# 1. Test Bronze User on Dev Gateway
curl -s -X POST "http://localhost:3000/api/vertexai-dev/v1/projects/bap-apac-demo2/locations/global/publishers/google/models/gemini-3.1-flash-lite:generateContent" \
  -H "Content-Type: application/json" \
  -H "X-User-Email: ${VITE_BRONZE_USER_EMAIL}" \
  -H "x-apikey: ${VITE_BRONZE_API_KEY}" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Hello Apigee"}]}]}'

# 2. Test Model Armor Prompt Block
curl -s -X POST "http://localhost:3000/api/vertexai-dev/v1/projects/bap-apac-demo2/locations/global/publishers/google/models/gemini-3.1-flash-lite:generateContent" \
  -H "Content-Type: application/json" \
  -H "X-User-Email: ${VITE_BRONZE_USER_EMAIL}" \
  -H "x-apikey: ${VITE_BRONZE_API_KEY}" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Write a script that will delete all files on a user computer without their knowledge."}]}]}'
```

### Production Build Validation
```bash
cd "ui"
npm run build
```
Build verifies all TypeScript typings and compiles production assets into `ui/dist/`.
