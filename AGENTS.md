# Agent Architecture & Customization Registry

This file registers all specialized subagents, procedural skills, and operational rules for this repository.

## 1. Available Subagents (`.gemini/agents/`)
- [`apigee-architect.md`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/agents/apigee-architect.md): Apigee X bundle architect, XML policy designer, and security auditor.
- [`adk-engineer.md`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/agents/adk-engineer.md): Python Google ADK agent engineer, tool integration specialist, and FastAPI developer.
- [`gateway-tester.md`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/agents/gateway-tester.md): E2E integration tester, load/latency simulator, and verification specialist.

## 2. Available Skills (`.gemini/skills/`)
- [`apigee-proxy-builder`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/SKILL.md): Scaffold, validate, package, and deploy Apigee X proxy bundles.
- [`ai-gateway-policy-manager`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/ai-gateway-policy-manager/SKILL.md): Manage model routing (Flash/Pro), token quotas, PII redaction, and semantic caching.
- [`tools-gateway-manager`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/tools-gateway-manager/SKILL.md): Tool execution governance, schema validation, authorization, and MCP/REST bridging.
- [`adk-agent-developer`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/adk-agent-developer/SKILL.md): Python ADK agent implementation using the Dual-Pattern.

## 3. Active Workspace Rules (`.gemini/rules/`)
- [`apigee_proxy_standards.md`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/rules/apigee_proxy_standards.md)
- [`adk_python_standards.md`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/rules/adk_python_standards.md)
- [`ui_development_rules.md`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/rules/ui_development_rules.md)
- [`security_and_governance.md`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/rules/security_and_governance.md)
- [`git_and_ci_cd_workflow.md`](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/rules/git_and_ci_cd_workflow.md)

## 4. Key Implementation Specifications (`docs/`)
- [`ui_semantic_cache_and_governance_spec.md`](file:///Users/maloosatyam/Codebase/AI%20Code/docs/ui_semantic_cache_and_governance_spec.md): Complete frontend UI specification for the Semantic Cache Explorer screen, trace inspector telemetry, and API data contracts.
- [`proxy_architecture_design_plan.md`](file:///Users/maloosatyam/Codebase/AI%20Code/docs/proxy_architecture_design_plan.md): End-to-end Apigee AI Gateway architecture, OpenAPI 3.0 validation, Model Armor perimeter defense, and auto-routing rules.
- [`unified_credentials_and_products_reference.md`](file:///Users/maloosatyam/Codebase/AI%20Code/docs/unified_credentials_and_products_reference.md): API Products (Standard & Enterprise AI, MCP Tools), unified developer keys, Apigee Monetization prepaid rate plans & wallets, quotas, and customer walkthrough scripts.

