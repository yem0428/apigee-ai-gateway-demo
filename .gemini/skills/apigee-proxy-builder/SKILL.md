---
name: apigee-proxy-builder
description: >
  Comprehensive skill for developing, reviewing, debugging, packaging, and validating Apigee X API proxy
  configurations — proxy bundles, policies (42+ policy types), flows, endpoints, shared flows,
  fault handling, and JavaScript callouts.
---

# Apigee X API Proxy Development

Comprehensive skill for building API proxies on Google Cloud's Apigee X platform. Covers the full proxy development lifecycle: bundle structure, endpoint configuration, flow design, policy implementation, fault handling, JavaScript extensibility, shared flows, and advanced patterns.

**This skill covers:** API proxy bundle authoring, policy configuration (42+ policy types), flow execution design, conditional routing, fault handling, JavaScript callouts, shared flows, automated bundle validation, and advanced development patterns.

**This skill does NOT cover:** Apigee Hybrid-specific infrastructure provisioning, CI/CD pipeline server setup, or GCP IAM role creation. Focus is on proxy development artifacts and gateway execution logic.

---

## When to Use This Skill

Use this skill when the user is:
- Building new API proxy bundles from scratch for API Management, AI Gateway, or Tools Gateway
- Writing or configuring Apigee policies (security, mediation, traffic management, caching, integration)
- Designing flow pipelines (PreFlow, conditional flows, PostFlow, PostClientFlow)
- Configuring ProxyEndpoints, TargetEndpoints, or RouteRules
- Implementing fault handling (FaultRules, DefaultFaultRule, RaiseFault)
- Writing JavaScript callout code for Apigee proxies
- Creating or consuming shared flows
- Debugging proxy execution or policy errors
- Reviewing existing proxy configurations for correctness or best practices
- Asking about Apigee X policy behavior, flow variables, or conditions

---

## Consulting Official Documentation

When you need to look up specific policy syntax, verify behavior, or find recent changes:
- **Web search**: Use `site:cloud.google.com/apigee` to restrict results to official Apigee X docs
- **Policy reference**: Fetch `https://cloud.google.com/apigee/docs/api-platform/reference/policies/[policy-name]-policy`
- **Configuration reference**: Fetch `https://cloud.google.com/apigee/docs/api-platform/reference/api-proxy-configuration-reference`
- **Flow variables**: Fetch `https://cloud.google.com/apigee/docs/api-platform/reference/variables-reference`
- **Conditions**: Fetch `https://cloud.google.com/apigee/docs/api-platform/reference/conditions-reference`
- **Vetted examples**: Browse `https://github.com/GoogleCloudPlatform/apigee-samples` for production patterns

> [!IMPORTANT]
> Do NOT use `docs.apigee.com` — that is legacy Apigee Edge documentation. Always use `cloud.google.com/apigee` for Apigee X.

---

## API Proxy Bundle Quick Reference

```text
apiproxy/
├── <ProxyName>.xml                # Root proxy definition (name + revision)
├── proxies/                       # ProxyEndpoint definitions
│   └── default.xml
├── targets/                       # TargetEndpoint definitions
│   └── default.xml
├── policies/                      # All policy XML files
│   ├── AM-SetHeaders.xml
│   ├── EV-ExtractPath.xml
│   ├── VAK-VerifyApiKey.xml
│   └── ...
└── resources/                     # Custom code and resources
    ├── jsc/                       # JavaScript files
    ├── java/                      # Java JAR files
    └── xsl/                       # XSLT transformations
```

### Policy Naming Conventions

Follow the `[Abbreviation]-[Purpose].xml` pattern:

| Abbreviation | Policy Type | Example |
|---|---|---|
| **AM** | AssignMessage | [`AM-SetHeaders.xml`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/AM-SetTelemetryHeaders.xml) |
| **EV** | ExtractVariables | [`EV-ExtractTokenUsage.xml`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/EV-ExtractTokenUsage.xml) |
| **SC** | ServiceCallout | `SC-CallBackend.xml` |
| **RF** | RaiseFault | `RF-InvalidInput.xml` |
| **FC** | FlowCallout | `FC-AuthSharedFlow.xml` |
| **SA** | SpikeArrest | [`SA-SpikeArrest.xml`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/SA-SpikeArrest.xml) |
| **Q** | Quota | [`Q-TokenQuota.xml`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/Q-TokenQuota.xml) |
| **RC** | ResponseCache | [`RC-ResponseCache.xml`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/RC-ResponseCache.xml) |
| **LC** | LookupCache | `LC-GetCachedValue.xml` |
| **PC** | PopulateCache | `PC-StoreValue.xml` |
| **IC** | InvalidateCache | `IC-ClearCache.xml` |
| **KVM** | KeyValueMapOperations | `KVM-GetConfig.xml` |
| **JS** | JavaScript | [`JS-RedactPII.xml`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/JS-RedactPII.xml) |
| **JWT** | JWT policies | `JWT-VerifyToken.xml` |
| **OAuth** | OAuthV2 | `OAuth-VerifyToken.xml` |
| **VAK** | VerifyAPIKey | [`VAK-VerifyApiKey.xml`](file:///Users/maloosatyam/Codebase/AI%20Code/apigee/proxies/ai-gateway-v1/apiproxy/policies/VAK-VerifyApiKey.xml) |
| **ML** | MessageLogging | `ML-LogToCloud.xml` |
| **DC** | DataCapture | `DC-CaptureMetrics.xml` |
| **CORS** | CORS | `CORS-AllowOrigins.xml` |
| **JTP** | JSONThreatProtection | `JTP-ValidatePayload.xml` |
| **XTP** | XMLThreatProtection | `XTP-ValidateXML.xml` |
| **OAS** | OASValidation | `OAS-ValidateRequest.xml` |

See [proxy_bundle_anatomy.md](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/proxy_bundle_anatomy.md) for full details.

---

## Development Workflow

### Phase 1: Define Proxy Structure
1. Create the `apiproxy/` directory with root XML, `proxies/`, `targets/`, `policies/`.
2. Configure ProxyEndpoint: set BasePath, define HTTPProxyConnection.
3. Configure TargetEndpoint: set backend URL or LoadBalancer.
4. Set up RouteRules to connect proxy to target.

*Reference:* [proxy_bundle_anatomy.md](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/proxy_bundle_anatomy.md), [endpoints_and_routing.md](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/endpoints_and_routing.md)

### Phase 2: Design Flow Pipeline
1. Map API operations to conditional flows using verb + path conditions.
2. Place security policies in PreFlow (execute for every request).
3. Place business logic in conditional flows (execute per operation).
4. Place response headers and caching in PostFlow.
5. Place MessageLogging in PostClientFlow (guarantees execution even on fault).

*Reference:* [flows_and_execution.md](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/flows_and_execution.md), [flow_variables_and_conditions.md](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/flow_variables_and_conditions.md)

### Phase 3: Implement Policies
Follow this ordering within flows — security first, then mediation, then traffic:
1. **Security**: VerifyAPIKey, OAuthV2, VerifyJWT, AccessControl, threat protection
2. **Mediation**: ExtractVariables, AssignMessage, transformations
3. **Traffic Management**: SpikeArrest, Quota
4. **Caching**: ResponseCache (typically in PostFlow response)
5. **Logging**: MessageLogging (typically in PostClientFlow)

*Reference:* [policies_security.md](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/policies_security.md), [policies_mediation.md](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/policies_mediation.md), [policies_traffic_management.md](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/policies_traffic_management.md), [policies_caching.md](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/policies_caching.md), [policies_integration.md](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/policies_integration.md)

### Phase 4: Add Fault Handling
1. Define FaultRules for known error types (auth failures, quota exceeded, backend errors).
2. Add DefaultFaultRule as catch-all with consistent error format.
3. Use RaiseFault for custom validation errors.
4. Set `continueOnError` only for policies where failure is acceptable.

*Reference:* [fault_handling.md](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/fault_handling.md)

### Phase 5: Optimize and Extend
1. Extract reusable policy sequences into shared flows.
2. Add response caching where appropriate.
3. Consider advanced patterns: proxy chaining, composite APIs, circuit breakers.
4. Add JavaScript callouts for complex transformations only when policies don't suffice.

*Reference:* [shared_flows.md](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/shared_flows.md), [javascript_development.md](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/javascript_development.md), [advanced_patterns.md](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/advanced_patterns.md), [anti_patterns_and_best_practices.md](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/anti_patterns_and_best_practices.md)

---

## Flow Execution Model

```text
CLIENT REQUEST
     │
     ▼
┌─────────────────────────────────────────────────┐
│  PROXY ENDPOINT                                 │
│  ┌──────────┐  ┌────────────────┐  ┌─────────┐ │
│  │ PreFlow  │→ │ Conditional    │→ │PostFlow │ │
│  │ (Request)│  │ Flows (Request)│  │(Request)│ │
│  └──────────┘  └────────────────┘  └─────────┘ │
│                                                 │
│  RouteRule evaluation → select TargetEndpoint   │
└─────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────┐
│  TARGET ENDPOINT                                │
│  ┌──────────┐  ┌────────────────┐  ┌─────────┐ │
│  │ PreFlow  │→ │ Conditional    │→ │PostFlow │ │
│  │ (Request)│  │ Flows (Request)│  │(Request)│ │
│  └──────────┘  └────────────────┘  └─────────┘ │
└─────────────────────────────────────────────────┘
     │
     ▼
  BACKEND SERVICE (request sent, response received)
     │
     ▼
┌─────────────────────────────────────────────────┐
│  TARGET ENDPOINT                                │
│  ┌──────────┐  ┌─────────────────┐ ┌─────────┐ │
│  │ PreFlow  │→ │ Conditional     │→│PostFlow │ │
│  │(Response)│  │ Flows (Response)│ │(Response│ │
│  └──────────┘  └─────────────────┘ └─────────┘ │
└─────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────┐
│  PROXY ENDPOINT                                 │
│  ┌──────────┐  ┌─────────────────┐ ┌─────────┐ │
│  │ PreFlow  │→ │ Conditional     │→│PostFlow │ │
│  │(Response)│  │ Flows (Response)│ │(Response│ │
│  └──────────┘  └─────────────────┘ └─────────┘ │
└─────────────────────────────────────────────────┘
     │
     ▼
CLIENT RESPONSE SENT
     │
     ▼
┌─────────────────────────────────────────────────┐
│  PostClientFlow (async — after response sent)   │
│  Only: MessageLogging, FlowCallout              │
└─────────────────────────────────────────────────┘
```

---

## Comprehensive Reference Index

| Document | Focus Area |
|---|---|
| [**`proxy_bundle_anatomy.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/proxy_bundle_anatomy.md) | Bundle directory structure, file types, naming conventions |
| [**`endpoints_and_routing.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/endpoints_and_routing.md) | ProxyEndpoint, TargetEndpoint, RouteRules, proxy chaining |
| [**`flows_and_execution.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/flows_and_execution.md) | Flow pipeline, PreFlow/PostFlow/conditional flows, execution order |
| [**`flow_variables_and_conditions.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/flow_variables_and_conditions.md) | Variable system, conditions syntax, message templates |
| [**`policies_traffic_management.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/policies_traffic_management.md) | SpikeArrest, Quota, ResetQuota |
| [**`policies_caching.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/policies_caching.md) | ResponseCache, cache-aside pattern, PopulateCache, LookupCache, InvalidateCache |
| [**`policies_security.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/policies_security.md) | API keys, OAuth 2.0, JWT, CORS, threat protection, IAM |
| [**`policies_mediation.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/policies_mediation.md) | AssignMessage, ExtractVariables, JSON/XML transforms |
| [**`policies_integration.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/policies_integration.md) | ServiceCallout, FlowCallout, KVM deep dive, PropertySets, logging, RaiseFault |
| [**`load_balancing_and_routing.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/load_balancing_and_routing.md) | Target servers, load balancing algorithms, health monitors, advanced routing |
| [**`fault_handling.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/fault_handling.md) | FaultRules, DefaultFaultRule, error flows, error responses |
| [**`javascript_development.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/javascript_development.md) | JavaScript object model, patterns, best practices |
| [**`shared_flows.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/shared_flows.md) | Creating and consuming shared flows, flow hooks |
| [**`advanced_patterns.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/advanced_patterns.md) | Proxy chaining, composite APIs, circuit breaker, AI/LLM token policies |
| [**`anti_patterns_and_best_practices.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/anti_patterns_and_best_practices.md) | Common mistakes, production best practices |
| [**`debugging_and_performance.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/debugging_and_performance.md) | Debug sessions, trace methodology, performance optimization |
| [**`multi_tenant_patterns.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/multi_tenant_patterns.md) | Multi-tenant routing, isolation, per-tenant config and rate limiting |
| [**`websockets_and_streaming.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/websockets_and_streaming.md) | WebSocket proxying, SSE, HTTP streaming, timeout gotchas |
| [**`end_to_end_examples.md`**](file:///Users/maloosatyam/Codebase/AI%20Code/.gemini/skills/apigee-proxy-builder/references/end_to_end_examples.md) | 4 complete proxy bundle walkthroughs |

---

## Validation & Packaging Commands

```bash
# Validate bundle XML & structure
python3 apigee/scripts/validate_bundle.py <proxy-name>

# Package into deployable ZIP
bash apigee/scripts/package_bundle.sh <proxy-name>

# Deploy revision to Apigee X
bash apigee/scripts/deploy_proxy.sh --org $APIGEE_ORG --env $APIGEE_ENV --proxy <proxy-name>
```
