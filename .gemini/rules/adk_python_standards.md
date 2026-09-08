---
trigger: glob
globs: "agents/**/*.py,agents/**/*.txt,agents/Dockerfile"
description: "Rules for developing Google ADK (Agent Development Kit) agents, tools, and FastAPI wrappers."
---

# Google ADK Python Development Standards

When developing Python ADK agents and backend services, follow these standards:

## 1. Dual-Pattern Architecture
1. **Consuming Apigee**:
   - The ADK Agent MUST NOT call Vertex AI directly in production mode; it must route all LLM completions through the configured Apigee AI Gateway (`APIGEE_AI_GATEWAY_URL`).
   - The ADK Agent MUST NOT call backend databases/APIs directly for agentic tool calls; it must invoke tools via the Apigee Tools Gateway (`APIGEE_TOOLS_GATEWAY_URL`).
2. **Exposed via Apigee**:
   - The agent service is exposed as a stateless REST / SSE streaming API via FastAPI.
   - Apigee APIM fronts this service to provide OAuth authentication, rate limiting, and analytics.

## 2. Code Structure
```text
agents/
├── app/
│   ├── main.py          # FastAPI app with POST /chat and GET /health endpoints
│   ├── agent.py         # ADK agent orchestrator, prompt definitions, tool bindings
│   ├── config.py        # Pydantic BaseSettings for gateway URLs, API keys, and timeouts
│   └── tools/           # Tool descriptors and execution clients calling Apigee Tools Gateway
│       ├── crm_tool.py
│       └── order_tool.py
├── requirements.txt     # Pinned Python dependencies
└── Dockerfile           # Multi-stage production container for Cloud Run
```

## 3. Error Handling & Observability
- Propagate gateway correlation headers (`x-request-id`, `x-session-id`, `x-agent-id`) on all outgoing HTTP requests to Apigee.
- Log tool execution inputs, outputs, and latencies.
- Ensure graceful fallbacks if a tool call or model call exceeds latency budgets or returns rate-limit (429) errors.
