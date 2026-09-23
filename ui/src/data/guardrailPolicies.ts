import type { LucideIcon } from 'lucide-react';
import {
  Key,
  ShieldCheck,
  Database,
  Split,
  Gauge,
  Receipt,
  Plug,
  Users,
  Workflow,
  ScrollText,
} from 'lucide-react';

export type GuardrailGateway = 'ai' | 'mcp';

export type GuardrailCategory =
  | 'Security'
  | 'Safety'
  | 'Cost Control'
  | 'Traffic Shaping'
  | 'Observability';

export interface GuardrailPolicyRef {
  /** Policy name as it appears in the proxy bundle. */
  name: string;
  /** Apigee policy type. */
  type: string;
  purpose: string;
}

export interface GuardrailControl {
  id: string;
  gateway: GuardrailGateway;
  proxy: string;
  title: string;
  category: GuardrailCategory;
  summary: string;
  /** Where in the proxy the control runs. */
  attachPoint: string;
  /** What the caller sees when the control trips. */
  onViolation: string;
  /** Where the tunable values come from (product attrs, KVM, template...). */
  configSource: string;
  icon: LucideIcon;
  policies: GuardrailPolicyRef[];
}

export const CATEGORY_STYLES: Record<GuardrailCategory, string> = {
  Security: 'bg-blue-50 text-blue-700 border-blue-200',
  Safety: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Cost Control': 'bg-amber-50 text-amber-800 border-amber-200',
  'Traffic Shaping': 'bg-purple-50 text-purple-700 border-purple-200',
  Observability: 'bg-slate-100 text-slate-700 border-slate-300',
};

export const AI_PROXY = 'ai-gateway-v1';
export const MCP_PROXY = 'mcp-gateway-v1';

/**
 * Read-only catalog of the guardrails currently enforced by the two gateway
 * proxies. Policy names/types mirror the deployed proxy bundles so the
 * Architecture blueprint and this console never drift apart.
 */
export const GUARDRAIL_CONTROLS: GuardrailControl[] = [
  {
    id: 'ai-auth',
    gateway: 'ai',
    proxy: AI_PROXY,
    title: 'Identity & Model Entitlement',
    category: 'Security',
    summary:
      'Resolves the calling user, verifies the API key, and rejects any model that is not explicitly named on the caller’s API Product.',
    attachPoint: 'Proxy PreFlow',
    onViolation: 'HTTP 401 / 403 — request never reaches a model',
    configSource: 'API Product model entitlements',
    icon: Key,
    policies: [
      {
        name: 'DJWT-ExtractUserIdentity',
        type: 'DecodeJWT',
        purpose: 'Extracts the end-user identity from the Cloud IAP / Bearer token for per-user attribution.',
      },
      {
        name: 'VA-VerifyAPIKey',
        type: 'VerifyAPIKey',
        purpose: 'Validates the consumer key and loads API Product metadata (Standard vs Enterprise AI Tier).',
      },
      {
        name: 'OAS-ValidateRequest',
        type: 'OASValidation',
        purpose: 'Validates the OpenAPI 3.0 request structure and enforces named model entitlements (no wildcards).',
      },
    ],
  },
  {
    id: 'ai-armor',
    gateway: 'ai',
    proxy: AI_PROXY,
    title: 'Prompt & Response Safety',
    category: 'Safety',
    summary:
      'Screens every prompt before a token is spent and inspects every completion on the way out, using one enterprise Model Armor template across all providers.',
    attachPoint: 'Request PreFlow + Response Flow',
    onViolation: 'HTTP 403 — blocked at the perimeter with a safety reason',
    configSource: 'Google Cloud Model Armor template',
    icon: ShieldCheck,
    policies: [
      {
        name: 'SUP-UserPrompt',
        type: 'SanitizeUserPrompt',
        purpose: 'Scans the incoming prompt for injection, jailbreak, and PII before any LLM invocation.',
      },
      {
        name: 'SMR-SanitizeModelResponse',
        type: 'SanitizeModelResponse',
        purpose: 'Inspects the model output to redact sensitive PII or unsafe completions.',
      },
    ],
  },
  {
    id: 'ai-cache',
    gateway: 'ai',
    proxy: AI_PROXY,
    title: 'Semantic Cache',
    category: 'Cost Control',
    summary:
      'Matches semantically equivalent prompts against a vector cache and serves them without an upstream call — zero model cost, zero token quota.',
    attachPoint: 'Request PreFlow + Response Flow',
    onViolation: 'No rejection — a hit short-circuits the upstream call',
    configSource: 'Similarity threshold & TTL on the cache policy',
    icon: Database,
    policies: [
      {
        name: 'SCL-Semantic-Cache-Lookup',
        type: 'SemanticCacheLookup',
        purpose: 'Embeds the incoming prompt and queries the vector store for a high-similarity match.',
      },
      {
        name: 'SCP-Semantic-Cache-Populate',
        type: 'SemanticCachePopulate',
        purpose: 'Stores the LLM response on a cache miss so later similar prompts are served locally.',
      },
    ],
  },
  {
    id: 'ai-router',
    gateway: 'ai',
    proxy: AI_PROXY,
    title: 'Auto-Routing Model Mapping',
    category: 'Traffic Shaping',
    summary:
      'Classifies each prompt with a small, fast router model and maps the result to a concrete model the caller is entitled to — no model names hardcoded in the proxy.',
    attachPoint: 'Request PreFlow (/auto route)',
    onViolation: 'Fails open — falls back to the product default model',
    configSource: 'API Product routing.model.* custom attributes',
    icon: Split,
    policies: [
      {
        name: 'JS-PrepRouterRequest',
        type: 'JavaScript',
        purpose: 'Builds the classifier payload and constrains the answer to coding | deep_reasoning | simple | general.',
      },
      {
        name: 'SC-ModelRouter',
        type: 'ServiceCallout',
        purpose: 'Calls the router model with a 2.5s timeout and continue-on-error so a blip degrades rather than fails.',
      },
      {
        name: 'JS-AutoRouting',
        type: 'JavaScript',
        purpose: 'Maps the returned category to a model using the API Product attributes. Holds no model names of its own.',
      },
      {
        name: 'AM-RouteGeminiTarget',
        type: 'AssignMessage',
        purpose: 'Routes the request to the selected Vertex AI Gemini endpoint.',
      },
      {
        name: 'AM-RouteClaudeTarget',
        type: 'AssignMessage',
        purpose: 'Routes coding prompts on the Enterprise tier to Anthropic Claude on Vertex.',
      },
    ],
  },
  {
    id: 'ai-quota',
    gateway: 'ai',
    proxy: AI_PROXY,
    title: 'Token Quotas & Spend Limits',
    category: 'Cost Control',
    summary:
      'Budgets by tokens and dollars rather than requests, and checks the prepaid wallet plus active rate plan before the call is allowed through.',
    attachPoint: 'PreFlow (enforce) + PostFlow (count)',
    onViolation: 'HTTP 429 quota exceeded / HTTP 403 wallet exhausted',
    configSource: 'API Product token quota + wallet balance & rate plan',
    icon: Gauge,
    policies: [
      {
        name: 'LTQ-TokenEnforce',
        type: 'LLMTokenQuota (PreFlow)',
        purpose: 'Checks accumulated token consumption against the limit resolved from the API Product.',
      },
      {
        name: 'LTQ-TokenCount',
        type: 'LLMTokenQuota (PostFlow)',
        purpose: 'Reads the exact token count from the model response and increments the distributed counter.',
      },
      {
        name: 'MLC-EnforceMonetizationLimits',
        type: 'MonetizationLimitsCheck',
        purpose: 'Verifies the prepaid wallet balance and an active rate plan subscription.',
      },
    ],
  },
  {
    id: 'ai-upstream',
    gateway: 'ai',
    proxy: AI_PROXY,
    title: 'Cost Attribution & Telemetry',
    category: 'Observability',
    summary:
      'Prices every request from the live rate card, debits the wallet, and emits the analytics dimensions and x-gateway-* trace headers the dashboards run on.',
    attachPoint: 'Target & Response Flow',
    onViolation: 'Non-blocking — records cost and telemetry',
    configSource: 'ai-model-rates KVM',
    icon: Receipt,
    policies: [
      {
        name: 'KVM-GetModelRates',
        type: 'KeyValueMapOperations',
        purpose: 'Reads the live input/output per-1k token rates from the ai-model-rates KVM.',
      },
      {
        name: 'JS-CalculateCost',
        type: 'JavaScript',
        purpose: 'Computes the exact USD cost for the request and debits the prepaid developer wallet.',
      },
      {
        name: 'DC-ModelAnalytics',
        type: 'DataCapture',
        purpose: 'Streams model, token counts, latency, and cost into custom analytics dimensions.',
      },
      {
        name: 'AM-SetResponseHeaders',
        type: 'AssignMessage',
        purpose: 'Injects the x-gateway-* trace headers used by the trace viewer.',
      },
    ],
  },
  {
    id: 'mcp-client',
    gateway: 'mcp',
    proxy: MCP_PROXY,
    title: 'MCP Protocol Validation',
    category: 'Security',
    summary:
      'Parses and validates the JSON-RPC 2.0 envelope for tools/list and tools/call so malformed or unsupported agent traffic is rejected at the edge.',
    attachPoint: 'Proxy PreFlow',
    onViolation: 'JSON-RPC error response — request is not bridged',
    configSource: 'MCP protocol policy configuration',
    icon: Plug,
    policies: [
      {
        name: 'PP-MCP',
        type: 'MCP Protocol Policy',
        purpose: 'Parses the incoming JSON-RPC 2.0 envelope (jsonrpc, id, method, params).',
      },
      {
        name: 'CORS-Allow',
        type: 'CORS',
        purpose: 'Enables cross-origin browser and web-agent inspection.',
      },
    ],
  },
  {
    id: 'mcp-auth',
    gateway: 'mcp',
    proxy: MCP_PROXY,
    title: 'Agent Keys & Tool Call Rate Limits',
    category: 'Traffic Shaping',
    summary:
      'Verifies the agent’s consumer key and caps tool-call rates so a runaway agent loop cannot overwhelm core banking or inventory systems.',
    attachPoint: 'Proxy PreFlow',
    onViolation: 'HTTP 401 unauthorized / HTTP 429 rate limited',
    configSource: 'Developer App credentials + product quota',
    icon: Users,
    policies: [
      {
        name: 'VA-VerifyAPIKey',
        type: 'VerifyAPIKey',
        purpose: 'Verifies the agent consumer key against the Enterprise Tools MCP product.',
      },
      {
        name: 'Q-Limit',
        type: 'Quota',
        purpose: 'Enforces per-app request rate limits protecting downstream systems of record.',
      },
      {
        name: 'AM-RemoveAuthorization',
        type: 'AssignMessage',
        purpose: 'Strips client auth headers before forwarding to internal microservices.',
      },
    ],
  },
  {
    id: 'mcp-rbac',
    gateway: 'mcp',
    proxy: MCP_PROXY,
    title: 'Persona Tool RBAC',
    category: 'Security',
    summary:
      'Filters the tool catalog per persona and authorizes each execution, so a Sales agent never discovers — let alone calls — a banking tool.',
    attachPoint: 'Request & Response Flow',
    onViolation: 'RBAC denied — tool hidden from tools/list, tools/call rejected',
    configSource: 'API Product tool entitlements',
    icon: ShieldCheck,
    policies: [
      {
        name: 'PP-MCP',
        type: 'MCP Governance',
        purpose: 'Filters the tools/list response and authorizes tools/call against the product’s tool entitlements.',
      },
    ],
  },
  {
    id: 'mcp-bridge',
    gateway: 'mcp',
    proxy: MCP_PROXY,
    title: 'REST → MCP Tool Bridge',
    category: 'Traffic Shaping',
    summary:
      'Turns existing REST microservices into MCP tools and validates tool arguments against JSON schemas at the gateway — no backend rewrite.',
    attachPoint: 'Target Flow',
    onViolation: 'Schema validation error returned to the agent',
    configSource: 'Tool-to-endpoint mapping in the MCP policy',
    icon: Workflow,
    policies: [
      {
        name: 'PP-MCP',
        type: 'Protocol Bridge',
        purpose: 'Maps the MCP tool name and JSON arguments to the target URL, HTTP verb, and parameters.',
      },
    ],
  },
  {
    id: 'mcp-backends',
    gateway: 'mcp',
    proxy: MCP_PROXY,
    title: 'Tool Execution Audit Log',
    category: 'Observability',
    summary:
      'Streams a structured audit record of every tool invocation — persona, tool, latency, status — to Cloud Logging.',
    attachPoint: 'PostFlow',
    onViolation: 'Non-blocking — always logs',
    configSource: 'Cloud Logging sink',
    icon: ScrollText,
    policies: [
      {
        name: 'ML-CloudLogging',
        type: 'MessageLogging',
        purpose: 'Streams structured MCP tool execution audit logs to Google Cloud Logging.',
      },
    ],
  },
];
