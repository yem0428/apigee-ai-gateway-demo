# Apigee AI & Tools Gateway with Google ADK

This repository is an enterprise demonstration and development platform for:
1. **Apigee API Management**: API governance, security, rate-limiting, spike arrest, and developer enablement.
2. **Apigee AI Gateway**: Model routing (Gemini 1.5 Flash / Pro failover), token-based quota enforcement, prompt guardrails, PII redaction, and semantic caching.
3. **Apigee Tools Gateway**: Centralized tool/function execution governance, input schema validation, agent authentication, and MCP / REST API bridging.
4. **Google ADK (Agent Development Kit)**: Dual-pattern Python agents that consume Apigee gateways for models and tools, and are hosted as managed backend microservices fronted by Apigee.
5. **Interactive Demo UI**: React + Vite + Tailwind playground with real-time gateway trace inspection, token/latency metrics, and live policy toggles.

---

## Repository Structure Overview
- [`.gemini/rules/`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/rules/): Specialized rules for Apigee XML, Python ADK, and React/Tailwind.
- [`.gemini/skills/`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/): On-demand procedural playbooks for proxy generation, policy tuning, and agent scaffolding.
- [`.gemini/agents/`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/agents/): Subagent personas (Apigee Architect, ADK Engineer, Gateway Tester).
- [`apigee/`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/): Production-grade Apigee X proxy bundles, shared flows, and deployment scripts.
- [`agents/`](file:///Users/maloosatyam/Codebase/AI%20Code/agents/): Python ADK agent microservice (FastAPI + Cloud Run ready) using the Dual-Pattern.
- [`ui/`](file:///Users/maloosatyam/Codebase/AI%20Code/ui/): React + Vite + Tailwind demo testing playground with live gateway telemetry.
- [`docs/`](file:///Users/maloosatyam/Codebase/AI%20Code/docs/): Architecture specs, policy guides, and step-by-step customer demo walkthrough scripts.

---

## Core Guidelines for Agentic Development
1. **Apigee Standards**: Keep proxy bundles compliant with Apigee X directory structures (`apiproxy/{proxies,targets,policies,resources}`). Use clear policy prefixes (`VAK-`, `SA-`, `Q-`, `JS-`, `EV-`, `AM-`).
2. **ADK Dual-Pattern**: Ensure agents route model calls through the AI Gateway and tool calls through the Tools Gateway. Avoid hardcoding direct Vertex AI or backend URLs in the agent core.
3. **Traceability**: All gateway calls must output trace metadata (`x-gateway-model`, `x-token-count`, `x-policy-latency-ms`, `x-tool-id`) for the custom UI inspector.
4. **Validation**: Test proxy bundles and Python ADK endpoints before proposing cloud deployment.
