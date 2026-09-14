# Apigee AI & Tools Gateway with Google ADK

[![Apigee X](https://img.shields.io/badge/Apigee-X-blue.svg)](https://cloud.google.com/apigee)
[![Google ADK](https://img.shields.io/badge/Google-ADK-4285F4.svg)](https://google.github.io/adk/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB.svg)](https://reactjs.org/)
[![Cloud Run](https://img.shields.io/badge/Google_Cloud-Cloud_Run-4285F4.svg)](https://cloud.google.com/run)

An enterprise-grade demonstration and development platform showcasing **Apigee API Management**, **Apigee AI Gateway**, **Apigee Tools Gateway**, and **Google ADK (Agent Development Kit)** microservices with live trace telemetry, role-based entitlement governance, and native monetization.

---

## 🚀 Live Demo Studio

- **Interactive UI Playground**: [https://ai-ui.maloosatyam.demo.altostrat.com/](https://ai-ui.maloosatyam.demo.altostrat.com/)
- **AI Gateway Endpoint**: `https://api.maloosatyam.demo.altostrat.com/ai/v1`
- **MCP Tools Gateway Endpoint**: `https://api.maloosatyam.demo.altostrat.com/mcp`

---

## ✨ Core Features & Architectural Capabilities

### 1. 🧠 Intelligent Model Routing (`/ai/v1/auto`)
- **Heuristic Classification**: Automatically analyzes incoming prompts and routes traffic to the optimal model:
  - **Lightweight QA / Fast Queries**: Gemini 3.1 Flash Lite
  - **Deep Reasoning & Benchmarks**: Gemini 3.1 Pro Preview
  - **Code Generation & Implementation**: Claude Opus (`claude-opus-4-5@20251101`)

### 2. 🛡️ Model Armor Guardrails & Security
- **Perimeter Defense**: Intercepts prompt injections, jailbreak attempts, and harmful instructions before reaching upstream LLMs (`SUP-UserPrompt`).
- **Zero-Trust Identity**: Mandatory `X-User-Email` and `x-apikey` header enforcement (`VA-VerifyAPIKey`).
- **Entitlement Tiers**:
  - **Standard AI Tier**: Access to Flash & Flash Lite models (`401 Invalid ApiKey` on restricted Pro/Claude models).
  - **Enterprise AI Tier**: Unrestricted access to all foundation models.

### 3. 💳 Apigee Native Monetization & Prepaid Wallets
- **Prepaid Wallet Engine**: Real-time token consumption calculation (`CalculateCost.js`) and wallet balance deduction.
- **KVM Rate Cards**: Dynamic model pricing managed in Apigee KVM (`ai-model-rates`).
- **Product Rate Plans**: Developer product subscriptions and usage attribution ledger.

### 4. ⚡ Semantic Caching (Vertex Vector Search)
- **Sub-100ms Cache Hits**: Generates vector embeddings for incoming prompts (`SCL-Semantic-Cache-Lookup`).
- **$0 Token Cost**: Bypasses LLM inference on semantically identical queries, returning instant hits from vector cache.

### 5. 🛠️ MCP Tools Gateway Governance
- **JSON-RPC 2.0 Governance**: Intercepts `tools/list` and `tools/call` protocol requests.
- **Role-Based Tool Authorization**:
  - **Sales Agent Persona**: Access to Sales tools; Banking tools blocked (401).
  - **Loans Agent Persona**: Access to Banking tools; Sales tools blocked (401).

---

## 📁 Repository Structure

```
.
├── apigee/                           # Apigee X Proxy Bundles & Automation
│   ├── proxies/
│   │   ├── ai-gateway-v1/            # AI Gateway Proxy (Routing, Guardrails, Monetization)
│   │   └── mcp-tools-gateway-v1/     # MCP Tools Gateway Proxy (JSON-RPC 2.0, Tool Auth)
│   ├── scripts/                      # Deployment & Provisioning Scripts
│   │   ├── provision_unified_credentials.py
│   │   └── test_autorouting.sh
│   └── templates/                    # Helm / Policy Deployment Templates
├── agents/                           # Python Google ADK Microservices
│   ├── app/                          # FastAPI Dual-Pattern Agent Service
│   └── tests/                        # Pytest Integration Test Suite
├── ui/                               # React + Vite + Tailwind Demo Studio
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatPlayground.tsx    # AI Gateway Studio & Interactive Scenario Cards
│   │   │   ├── GatewayTraceViewer.tsx# Live Policy Telemetry & SSO Trace Inspector
│   │   │   ├── McpPlayground.tsx     # MCP Tools Governance Studio
│   │   │   ├── AnalyticsDashboard.tsx# Apigee Analytics Fleet KPIs & Token Spend
│   │   │   └── MonetizationManager.tsx# Developer Prepaid Wallets & KVM Rate Cards
│   │   ├── services/
│   │   │   ├── apigeeClient.ts       # Vertex AI Gateway REST Client
│   │   │   ├── mcpClient.ts          # JSON-RPC 2.0 Tool Protocol Client
│   │   │   └── api.ts                # Management API Client (/api/me, /api/monetization)
│   │   ├── App.tsx                   # Root Application & Dynamic SSO Provisioning
│   │   └── main.tsx
│   ├── server.js                     # Node.js Production Reverse Proxy & OAuth Token Manager
│   └── vite.config.ts
├── docs/                             # Implementation Specs & Architecture Guides
│   ├── apigee_ai_gateway_demo_design.md
│   ├── ui_semantic_cache_and_governance_spec.md
│   └── cloud_run_iap_deployment_guide.md
└── AGENTS.md                         # Subagent Persona Registry & Playbooks
```

---

## 🛠️ Local Development & Setup

### Prerequisites
- **Node.js** v20+ & **npm**
- **Python** 3.10+
- **gcloud CLI** authenticated to GCP project `bap-apac-demo2`

### Running the UI Playground locally

1. Navigate to the `ui/` directory:
   ```bash
   cd ui
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start local development server with Vite:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

4. Build production static bundle:
   ```bash
   npm run build
   ```

---

## ☁️ Deployment

### Deploying the UI Container to Cloud Run

1. Build container image via Google Cloud Build:
   ```bash
   gcloud builds submit --tag asia-southeast1-docker.pkg.dev/bap-apac-demo2/cloud-run-source-deploy/apigee-ai-gateway-ui:latest ui --project=bap-apac-demo2
   ```

2. Deploy container to Cloud Run:
   ```bash
   gcloud run deploy apigee-ai-gateway-ui \
     --image=asia-southeast1-docker.pkg.dev/bap-apac-demo2/cloud-run-source-deploy/apigee-ai-gateway-ui:latest \
     --region=asia-southeast1 \
     --platform=managed \
     --no-allow-unauthenticated \
     --ingress=internal-and-cloud-load-balancing \
     --service-account=apigee-ui-mgmt-sa@bap-apac-demo2.iam.gserviceaccount.com \
     --project=bap-apac-demo2
   ```

---

## 📄 License

This repository is licensed under the Apache 2.0 License.
