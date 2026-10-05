---
name: tools-gateway-manager
description: >-
  Design and manage Apigee Tools Gateway proxies for agent tool execution, authorization,
  schema validation, and bridging between MCP (Model Context Protocol) / REST APIs.
  Use when registering new backend tools, configuring tool execution policies, or securing tool calls.
---

# Tools Gateway Manager Skill

This skill guides the implementation of Apigee as an enterprise Tools Gateway for AI agents.

## 1. Core Architecture of Tools Gateway
The Tools Gateway sits between autonomous agents (e.g. Google ADK) and backend systems (CRM, ERP, SQL databases, Cloud APIs, MCP servers):
1. **Tool Discovery**: Exposes an OpenAPI or MCP tool definition catalog via `/tools/catalog`.
2. **Tool Execution**: Routes `/tools/{tool_id}/execute` to the appropriate backend service.
3. **Governance & Authorization**: Validates whether the agent or client key has permission to execute the requested tool.
4. **Input Schema Validation**: Ensures tool arguments conform to the registered JSON schema before hitting sensitive backends.

## 2. Tool Execution Workflow
1. **PreFlow (Security & Validation)**:
   - `VAK-VerifyApiKey`: Validate calling agent credential.
   - `EV-ExtractToolName`: Parse `{tool_id}` from URI path.
   - `JS-ValidateToolScope`: Verify that the API Key has scope `tools:{tool_id}:execute`.
2. **Routing (Target Selection)**:
   - Conditional RouteRules route to specific backend targets based on `{tool_id}` (e.g. `crm-backend`, `order-db`, `knowledge-base`).
3. **PostFlow (Logging & Masking)**:
   - Log tool execution time, response status, and mask any sensitive PII in tool results.
