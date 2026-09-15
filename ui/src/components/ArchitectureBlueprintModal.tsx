import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Terminal,
  ShieldCheck,
  Database,
  Cpu,
  Coins,
  Key,
  Layers,
  ArrowRight,
  CheckCircle2,
  Zap,
  Server,
  Lock,
  Workflow,
  FileCode2,
  MessageSquare,
  ShieldAlert,
  Ban,
  Eye,
} from 'lucide-react';
import { GatewayTelemetry, McpTelemetry } from '../types';

interface ArchitectureBlueprintModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'ai-gateway' | 'mcp-gateway' | 'dual-pattern';
  initialMode?: 'request-flow' | 'full-blueprint';
  aiTelemetry?: GatewayTelemetry | null;
  mcpTelemetry?: McpTelemetry | null;
}

interface ArchStage {
  id: string;
  step: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
  policies: { name: string; type: string; purpose: string }[];
  talkingPoints: string[];
  liveStatus?: {
    label: string;
    status: 'pass' | 'hit' | 'warn' | 'block' | 'neutral';
    detail?: string;
  };
}

interface TerminationInfo {
  stoppedAtStep: string;
  stoppedAtTitle: string;
  reasonTitle: string;
  reasonDescription: string;
  badgeText: string;
  type: 'blocked-security' | 'blocked-quota' | 'cache-hit';
  skippedStages: string[];
}

export const ArchitectureBlueprintModal: React.FC<ArchitectureBlueprintModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'ai-gateway',
  initialMode = 'full-blueprint',
  aiTelemetry,
  mcpTelemetry,
}) => {
  const [activeFlow, setActiveFlow] = useState<'ai-gateway' | 'mcp-gateway' | 'dual-pattern'>(initialTab);
  const [viewMode, setViewMode] = useState<'request-flow' | 'full-blueprint'>(initialMode);
  const [selectedStageId, setSelectedStageId] = useState<string>('ai-router');

  // Derive live status flags from recent AI Gateway telemetry
  const aiStatus = aiTelemetry?.status || 200;
  const isAiCached = aiTelemetry?.cacheStatus === 'HIT';
  const isAiAutoRouted = aiTelemetry?.autoRouted === true;
  const isAiGuardrailBlocked =
    aiTelemetry?.guardrailStatus === 'BLOCKED' ||
    (aiStatus === 400 && (aiTelemetry?.guardrailMessage || '').length > 0);
  const isAiQuotaBlocked = aiStatus === 429;
  const isAiAuthBlocked = aiStatus === 401 || aiStatus === 403;
  const remainingTokens =
    aiTelemetry?.headersReceived?.['x-gateway-quota-remaining'] ||
    aiTelemetry?.headersReceived?.['x-ratelimit-remaining'];

  // Derive live status flags from recent MCP Gateway telemetry
  const mcpStatus = mcpTelemetry?.status || 200;
  const isMcpAuthOrRateBlocked = mcpStatus === 401 || mcpStatus === 429;
  const isMcpRbacBlocked =
    mcpStatus === 403 ||
    Boolean(mcpTelemetry?.rawResponse?.error && String(mcpTelemetry.rawResponse.error.message || '').includes('Unauthorized'));
  const mcpMethod = mcpTelemetry?.rawRequest?.method || 'JSON-RPC 2.0';
  const mcpToolName = mcpTelemetry?.rawRequest?.params?.name;

  useEffect(() => {
    if (isOpen) {
      setActiveFlow(initialTab);
      setViewMode(initialMode);

      // Automatically highlight the most relevant/stopping stage
      if (initialTab === 'ai-gateway' && aiTelemetry) {
        if (isAiAuthBlocked) setSelectedStageId('ai-auth');
        else if (isAiGuardrailBlocked) setSelectedStageId('ai-armor');
        else if (isAiCached) setSelectedStageId('ai-cache');
        else if (isAiQuotaBlocked) setSelectedStageId('ai-quota');
        else setSelectedStageId('ai-router');
      } else if (initialTab === 'mcp-gateway' && mcpTelemetry) {
        if (isMcpAuthOrRateBlocked) setSelectedStageId('mcp-auth');
        else if (isMcpRbacBlocked) setSelectedStageId('mcp-rbac');
        else setSelectedStageId('mcp-bridge');
      } else {
        setSelectedStageId(initialTab === 'mcp-gateway' ? 'mcp-rbac' : 'ai-router');
      }
    }
  }, [
    isOpen,
    initialTab,
    initialMode,
    aiTelemetry,
    mcpTelemetry,
    isAiAuthBlocked,
    isAiGuardrailBlocked,
    isAiCached,
    isAiQuotaBlocked,
    isMcpAuthOrRateBlocked,
    isMcpRbacBlocked,
  ]);

  if (!isOpen) return null;

  const aiStages: ArchStage[] = [
    {
      id: 'ai-auth',
      step: '01',
      title: 'Identity & Product Entitlements',
      subtitle: 'Verify API Key / JWT & Resolve Tier',
      badge: 'Security & RBAC',
      badgeColor: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800',
      icon: <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
      policies: [
        { name: 'DJWT-ExtractUserIdentity', type: 'DecodeJWT', purpose: 'Extracts user email identity from Cloud IAP / Bearer token for per-user attribution.' },
        { name: 'VA-VerifyAPIKey', type: 'VerifyAPIKey', purpose: 'Validates consumer key & loads API Product metadata (Standard vs Enterprise AI Tier).' },
        { name: 'OAS-ValidateRequest', type: 'OASValidation', purpose: 'Validates incoming OpenAPI 3.0 request structure and enforces named model entitlements.' },
      ],
      talkingPoints: [
        'Every request resolves user identity first (JWT or X-User-Email), failing closed with HTTP 401 if missing.',
        'Model entitlements are strictly named in the API Product (no wildcard *), preventing unauthorized use of costly models.',
        'Extracts developer & user email identity for downstream cost attribution and prepaid wallet debiting.',
      ],
      liveStatus: aiTelemetry
        ? isAiAuthBlocked
          ? { label: `BLOCKED (${aiStatus})`, status: 'block', detail: 'Unauthorized key or model entitlement rejected' }
          : { label: 'VERIFIED', status: 'pass', detail: `Persona: ${aiTelemetry.keyTier || 'Admin Tier'}` }
        : undefined,
    },
    {
      id: 'ai-armor',
      step: '02',
      title: 'Perimeter Guardrails (Model Armor)',
      subtitle: 'Prompt Injection, Jailbreak & PII Defense',
      badge: 'Safety Perimeter',
      badgeColor: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
      icon: <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
      policies: [
        { name: 'SUP-UserPrompt', type: 'SanitizeUserPrompt', purpose: 'Scans incoming prompt against Google Cloud Model Armor template before any LLM invocation.' },
        { name: 'SMR-SanitizeModelResponse', type: 'SanitizeModelResponse', purpose: 'Inspects LLM output in the response flow to redact sensitive PII or unsafe completions.' },
      ],
      talkingPoints: [
        'Inspects prompts at the API edge before spending a single LLM token.',
        'Detects prompt injection, jailbreak attempts, and sensitive PII leakage uniformly across Gemini & Claude.',
        'Eliminates model-specific safety gaps by enforcing a single enterprise Model Armor template.',
      ],
      liveStatus: aiTelemetry
        ? isAiGuardrailBlocked
          ? { label: 'BLOCKED BY MODEL ARMOR', status: 'block', detail: aiTelemetry.guardrailMessage || 'Malicious / destructive prompt blocked at perimeter' }
          : { label: 'PASSED SAFE', status: 'pass', detail: 'Zero prompt injection / jailbreak threats' }
        : undefined,
    },
    {
      id: 'ai-cache',
      step: '03',
      title: 'Semantic Cache Lookup',
      subtitle: 'Vector Similarity Matching (<100ms)',
      badge: 'Latency & Cost Saver',
      badgeColor: 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800',
      icon: <Database className="w-4 h-4 text-purple-600 dark:text-purple-400" />,
      policies: [
        { name: 'SCL-Semantic-Cache-Lookup', type: 'SemanticCacheLookup', purpose: 'Computes embeddings for incoming prompt and queries vector cache store for high-similarity matches.' },
        { name: 'SCP-Semantic-Cache-Populate', type: 'SemanticCachePopulate', purpose: 'Stores downstream LLM responses in cache on cache miss for subsequent similar queries.' },
      ],
      talkingPoints: [
        'Unlike exact-match HTTP caching, Semantic Caching matches intent using vector similarity.',
        'On a Cache HIT, the gateway returns the response in ~60-90ms with $0.00 upstream model cost and 0 token quota consumption.',
        'Ideal for repetitive FAQ, customer support, and agentic reasoning loops.',
      ],
      liveStatus: aiTelemetry
        ? isAiCached
          ? { label: `CACHE HIT (${aiTelemetry.latencyMs} ms)`, status: 'hit', detail: 'Served from Semantic Cache ($0 upstream cost)' }
          : { label: `CACHE ${aiTelemetry.cacheStatus || 'BYPASSED'}`, status: 'neutral', detail: 'Forwarded to upstream model & cached on response' }
        : undefined,
    },
    {
      id: 'ai-router',
      step: '04',
      title: 'Smart Auto-Router & Complexity Scoring',
      subtitle: 'Dynamic Model Selection (/auto)',
      badge: 'Intelligent Routing',
      badgeColor: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
      icon: <Cpu className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
      policies: [
        { name: 'JS-AutoRouting', type: 'JavaScript', purpose: 'Classifies prompt intent (Coding, Deep Reasoning, Simple, General) & selects model based on API Product tier.' },
        { name: 'AM-RouteGeminiTarget', type: 'AssignMessage', purpose: 'Routes request to Vertex AI Gemini endpoint (gemini-3.1-flash-lite, gemini-3-flash-preview, or gemini-3.1-pro-preview).' },
        { name: 'AM-RouteClaudeTarget', type: 'AssignMessage', purpose: 'Routes coding prompts on Enterprise tier to Anthropic Claude on Vertex (claude-opus-4-5@20251101).' },
      ],
      talkingPoints: [
        'Developers call a single logical endpoint (/ai/v1/auto) without hardcoding model versions.',
        'Tier-aware routing: Standard tier is capped at gemini-3-flash-preview; Enterprise tier unlocks Gemini 3.1 Pro & Claude Opus 4.5.',
        'Coding heuristics automatically route Enterprise developers to Claude Opus 4.5, while simple prompts route to low-cost Flash-Lite.',
      ],
      liveStatus: aiTelemetry
        ? {
            label: isAiAutoRouted ? `AUTO: ${aiTelemetry.model}` : `DIRECT: ${aiTelemetry.model}`,
            status: isAiAutoRouted ? 'hit' : 'pass',
            detail: `Provider: ${aiTelemetry.provider || 'Google'} (${aiTelemetry.intent || 'Standard'})`,
          }
        : undefined,
    },
    {
      id: 'ai-quota',
      step: '05',
      title: 'Product-Driven LLM Token Quotas',
      subtitle: 'Dynamic Per-Minute Token Budgets',
      badge: 'FinOps Governance',
      badgeColor: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800',
      icon: <Coins className="w-4 h-4 text-rose-600 dark:text-rose-400" />,
      policies: [
        { name: 'LTQ-TokenEnforce', type: 'LLMTokenQuota (PreFlow)', purpose: 'Checks accumulated token consumption against verifyapikey.VA-VerifyAPIKey.apiproduct.developer.llmQuota.limit.' },
        { name: 'LTQ-TokenCount', type: 'LLMTokenQuota (PostFlow)', purpose: 'Extracts exact totalTokenCount from LLM response and increments the distributed token counter.' },
        { name: 'MLC-EnforceMonetizationLimits', type: 'MonetizationLimitsCheck', purpose: 'Verifies prepaid wallet balance and active rate plan subscription.' },
      ],
      talkingPoints: [
        'Traditional API gateways rate-limit by HTTP requests/min, which fails when 1 prompt can consume 50 tokens or 50,000 tokens.',
        'Token limits are read dynamically from the API Product configuration — never hardcoded in policy XML.',
        'When a tier exceeds its token budget, the gateway returns HTTP 429 with exact reset telemetry.',
      ],
      liveStatus: aiTelemetry
        ? isAiQuotaBlocked
          ? { label: '429 QUOTA EXCEEDED', status: 'block', detail: 'Token budget exhausted for active API Product tier' }
          : {
              label: `${aiTelemetry.totalTokens || 0} TOKENS`,
              status: 'pass',
              detail: remainingTokens ? `Remaining Quota: ${remainingTokens}` : 'Within Product Token Budget',
            }
        : undefined,
    },
    {
      id: 'ai-upstream',
      step: '06',
      title: 'Multi-Model Upstream & Cost Attribution',
      subtitle: 'Vertex AI Gemini & Anthropic Claude + KVM Rate Card',
      badge: 'Multi-Cloud AI',
      badgeColor: 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800',
      icon: <Server className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />,
      policies: [
        { name: 'KVM-GetModelRates', type: 'KeyValueMapOperations', purpose: 'Reads live input/output per-1k token rates from the ai-model-rates KVM.' },
        { name: 'JS-CalculateCost', type: 'JavaScript', purpose: 'Computes exact USD cost for the request and debits prepaid developer wallet if applicable.' },
        { name: 'DC-ModelAnalytics', type: 'DataCapture', purpose: 'Streams model name, token counts, latency, and cost into custom Analytics dimensions.' },
        { name: 'AM-SetResponseHeaders', type: 'AssignMessage', purpose: 'Injects x-gateway-* trace headers (model, provider, cost-usd, total-tokens, cached) for UI inspection.' },
      ],
      talkingPoints: [
        'Abstracts credential management: the gateway authenticates to Vertex AI / Model Garden via Google Cloud Workload Identity.',
        'Calculates real-time per-request USD cost using live KVM rate cards and injects x-gateway-* telemetry headers.',
        'Feeds custom analytics dimensions (dc_model_name, dc_user_email, dc_total_tokens) for the Analytics & Billing dashboard.',
      ],
      liveStatus: aiTelemetry
        ? {
            label: `$${parseFloat(aiTelemetry.costUsd || '0').toFixed(6)} USD`,
            status: 'pass',
            detail: `Round-trip latency: ${aiTelemetry.latencyMs} ms`,
          }
        : undefined,
    },
  ];

  const mcpStages: ArchStage[] = [
    {
      id: 'mcp-client',
      step: '01',
      title: 'MCP Client & ADK Agent Layer',
      subtitle: 'JSON-RPC 2.0 over HTTP POST (/mcp)',
      badge: 'Model Context Protocol',
      badgeColor: 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800',
      icon: <Terminal className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />,
      policies: [
        { name: 'PP-MCP', type: 'MCP Protocol Policy', purpose: 'Parses incoming JSON-RPC 2.0 envelope (jsonrpc, id, method, params) for tools/list and tools/call.' },
        { name: 'CORS-Allow', type: 'CORS', purpose: 'Enables cross-origin browser & web-agent inspection.' },
      ],
      talkingPoints: [
        'Agents communicate using standard Model Context Protocol (MCP) JSON-RPC 2.0 messages over HTTP POST.',
        'Supports both Dynamic Tool Discovery (tools/list) and governed Tool Execution (tools/call).',
        'Decouples agent code from backend microservice URLs, schemas, and authentication protocols.',
      ],
      liveStatus: mcpTelemetry
        ? {
            label: mcpMethod,
            status: 'pass',
            detail: mcpToolName ? `Tool: ${mcpToolName}` : 'Protocol validated',
          }
        : undefined,
    },
    {
      id: 'mcp-auth',
      step: '02',
      title: 'API Key Auth & Request Throttling',
      subtitle: 'Consumer Key Verification & Spike Arrest',
      badge: 'Traffic Control',
      badgeColor: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800',
      icon: <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
      policies: [
        { name: 'VA-VerifyAPIKey', type: 'VerifyAPIKey', purpose: 'Verifies agent consumer key against Enterprise Tools MCP product.' },
        { name: 'Q-Limit', type: 'Quota', purpose: 'Enforces per-app request rate limits to protect downstream core banking & inventory systems.' },
        { name: 'AM-RemoveAuthorization', type: 'AssignMessage', purpose: 'Strips client auth headers before forwarding to internal microservices.' },
      ],
      talkingPoints: [
        'Prevents runaway agent loops from overwhelming enterprise backend systems of record.',
        'Identifies which agent persona (Admin, Sales Agent, or Loans Agent) is making the request via Developer App attributes.',
      ],
      liveStatus: mcpTelemetry
        ? isMcpAuthOrRateBlocked
          ? { label: `BLOCKED (${mcpStatus})`, status: 'block', detail: 'Rate limit or auth check failed' }
          : { label: 'AUTHORIZED', status: 'pass', detail: 'Consumer key & rate limit verified' }
        : undefined,
    },
    {
      id: 'mcp-rbac',
      step: '03',
      title: 'Persona & RBAC Tool Governance',
      subtitle: 'Dynamic Catalog Filtering & Execution Authorization',
      badge: 'Zero-Trust RBAC',
      badgeColor: 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800',
      icon: <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />,
      policies: [
        { name: 'PP-MCP', type: 'MCP Governance', purpose: 'Filters tools/list response and authorizes tools/call based on API Product tool entitlements.' },
      ],
      talkingPoints: [
        'Fine-grained RBAC at the individual tool level — not just coarse API-level access.',
        'Sales Agent persona only discovers & executes Sales/Discount tools (listAllDiscounts, getDiscountForSku).',
        'Loans Agent persona is restricted to Banking/Loan tools (getLoanApplication). Admin persona has full catalog access.',
      ],
      liveStatus: mcpTelemetry
        ? isMcpRbacBlocked
          ? { label: 'RBAC DENIED', status: 'block', detail: 'Persona not authorized for requested tool' }
          : { label: 'RBAC ALLOWED', status: 'hit', detail: 'Tool permitted for active persona' }
        : undefined,
    },
    {
      id: 'mcp-bridge',
      step: '04',
      title: 'JSON-RPC to REST/gRPC Bridge',
      subtitle: 'Protocol Mediation & Schema Validation',
      badge: 'Protocol Bridge',
      badgeColor: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
      icon: <Workflow className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
      policies: [
        { name: 'PP-MCP', type: 'Protocol Bridge', purpose: 'Maps MCP tool name & JSON arguments to target microservice URL, HTTP verb, and query/path parameters.' },
      ],
      talkingPoints: [
        'Legacy and modern REST microservices instantly become MCP-compliant tools without rewriting backend code.',
        'Validates tool input arguments (such as SKU codes or Loan IDs) against JSON schemas at the gateway.',
      ],
      liveStatus: mcpTelemetry
        ? { label: 'BRIDGED TO REST', status: 'pass', detail: `Latency: ${mcpTelemetry.latencyMs} ms` }
        : undefined,
    },
    {
      id: 'mcp-backends',
      step: '05',
      title: 'Enterprise Backend Microservices',
      subtitle: 'Sales & Inventory Service + Loans & Banking Core',
      badge: 'Systems of Record',
      badgeColor: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
      icon: <Server className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
      policies: [
        { name: 'ML-CloudLogging', type: 'MessageLogging', purpose: 'Streams structured MCP tool execution audit logs to Google Cloud Logging.' },
      ],
      talkingPoints: [
        'Backend microservices remain completely isolated on private cloud networks.',
        'All tool invocations are logged centrally with full audit trails, latency metrics, and error codes.',
      ],
      liveStatus: mcpTelemetry
        ? { label: `HTTP ${mcpTelemetry.status}`, status: mcpTelemetry.status === 200 ? 'pass' : 'warn', detail: 'Downstream execution complete' }
        : undefined,
    },
  ];

  // Determine exact executed stages and short-circuit termination info when in 'request-flow' mode
  let visibleStages: ArchStage[] = activeFlow === 'ai-gateway' ? aiStages : mcpStages;
  let terminationInfo: TerminationInfo | null = null;

  if (viewMode === 'request-flow') {
    if (activeFlow === 'ai-gateway' && aiTelemetry) {
      if (isAiAuthBlocked) {
        visibleStages = aiStages.slice(0, 1); // Only Step 01 executed
        terminationInfo = {
          stoppedAtStep: '01',
          stoppedAtTitle: 'Identity & Product Entitlements',
          reasonTitle: `Request Blocked at Step 01 — HTTP ${aiStatus} ${aiStatus === 401 ? 'Unauthorized' : 'Forbidden'}`,
          reasonDescription:
            'Authentication or API Product model entitlement check failed (VA-VerifyAPIKey / OAS-ValidateRequest). Downstream policies (Model Armor, Semantic Cache, Auto-Router, Token Quotas, and Upstream Models) were never executed.',
          badgeText: 'SHORT-CIRCUITED AT AUTH',
          type: 'blocked-security',
          skippedStages: ['02 Perimeter Guardrails', '03 Semantic Cache', '04 Smart Auto-Router', '05 LLM Token Quotas', '06 Upstream LLM'],
        };
      } else if (isAiGuardrailBlocked) {
        visibleStages = aiStages.slice(0, 2); // Only Steps 01 & 02 executed
        terminationInfo = {
          stoppedAtStep: '02',
          stoppedAtTitle: 'Perimeter Guardrails (Model Armor)',
          reasonTitle: 'Perimeter Defense Triggered — Prompt Blocked by Model Armor',
          reasonDescription:
            aiTelemetry.guardrailMessage ||
            'SUP-UserPrompt.xml detected a safety violation (Prompt Injection, Jailbreak, or Destructive intent) and immediately terminated execution. Upstream Semantic Cache, Auto-Router, Token Quotas, and Foundation Models were never invoked ($0.00 cost, 0 tokens consumed).',
          badgeText: 'BLOCKED AT PERIMETER (HTTP 400)',
          type: 'blocked-security',
          skippedStages: ['03 Semantic Cache Lookup', '04 Smart Auto-Router', '05 LLM Token Quotas', '06 Upstream Foundation Models'],
        };
      } else if (isAiCached) {
        visibleStages = aiStages.slice(0, 3); // Steps 01, 02 & 03 executed (Cache Hit short-circuit)
        terminationInfo = {
          stoppedAtStep: '03',
          stoppedAtTitle: 'Semantic Cache Lookup',
          reasonTitle: `Semantic Cache HIT — Response Served in ${aiTelemetry.latencyMs} ms`,
          reasonDescription:
            'SCL-Semantic-Cache-Lookup.xml matched the prompt embedding in the vector store and returned the cached completion immediately. Smart Auto-Router, Token Quota Enforcement, and Upstream LLM inference were completely bypassed ($0.00 upstream model cost, 0 quota tokens deducted).',
          badgeText: 'CACHE SHORT-CIRCUIT ($0 COST)',
          type: 'cache-hit',
          skippedStages: ['04 Smart Auto-Router', '05 LLM Token Quotas', '06 Upstream Foundation Models'],
        };
      } else if (isAiQuotaBlocked) {
        visibleStages = aiStages.slice(0, 5); // Steps 01 -> 05 executed; Step 06 blocked
        terminationInfo = {
          stoppedAtStep: '05',
          stoppedAtTitle: 'Product-Driven LLM Token Quotas',
          reasonTitle: 'FinOps Quota Exhausted — Request Throttled at Step 05 (HTTP 429)',
          reasonDescription:
            'LTQ-TokenEnforce.xml blocked the request because the caller exceeded the per-minute LLM token quota configured on their API Product tier. Upstream Foundation Model invocation was prevented.',
          badgeText: 'THROTTLED AT QUOTA (HTTP 429)',
          type: 'blocked-quota',
          skippedStages: ['06 Upstream Foundation Models (Vertex AI / Claude)'],
        };
      }
    } else if (activeFlow === 'mcp-gateway' && mcpTelemetry) {
      if (isMcpAuthOrRateBlocked) {
        visibleStages = mcpStages.slice(0, 2); // Steps 01 & 02
        terminationInfo = {
          stoppedAtStep: '02',
          stoppedAtTitle: 'API Key Auth & Request Throttling',
          reasonTitle: `MCP Request Blocked at Step 02 — HTTP ${mcpStatus}`,
          reasonDescription:
            'VA-VerifyAPIKey or Q-Limit rejected the request before tool authorization or backend bridging.',
          badgeText: `BLOCKED (HTTP ${mcpStatus})`,
          type: 'blocked-quota',
          skippedStages: ['03 Persona & RBAC Governance', '04 JSON-RPC to REST Bridge', '05 Enterprise Backend Microservices'],
        };
      } else if (isMcpRbacBlocked) {
        visibleStages = mcpStages.slice(0, 3); // Steps 01, 02, 03
        terminationInfo = {
          stoppedAtStep: '03',
          stoppedAtTitle: 'Persona & RBAC Tool Governance',
          reasonTitle: 'Zero-Trust RBAC Denied — Unauthorized Tool Invocation',
          reasonDescription:
            'PP-MCP blocked the tool call because the active persona (Developer App entitlement) is not authorized to execute this tool. Downstream REST bridge and Enterprise Backend Microservices were never invoked.',
          badgeText: 'RBAC DENIED (-32001)',
          type: 'blocked-security',
          skippedStages: ['04 JSON-RPC to REST/gRPC Bridge', '05 Enterprise Backend Microservices'],
        };
      }
    }
  }

  const allCurrentStages = activeFlow === 'ai-gateway' ? aiStages : mcpStages;
  const activeStage =
    visibleStages.find((s) => s.id === selectedStageId) ||
    allCurrentStages.find((s) => s.id === selectedStageId) ||
    visibleStages[visibleStages.length - 1] ||
    allCurrentStages[0];

  const getStatusBadgeClasses = (status: 'pass' | 'hit' | 'warn' | 'block' | 'neutral') => {
    switch (status) {
      case 'hit':
        return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
      case 'pass':
        return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30';
      case 'warn':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
      case 'block':
        return 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 font-bold';
      default:
        return 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 dark:bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  {viewMode === 'request-flow'
                    ? 'Live Request Execution Trace Flow'
                    : 'Enterprise AI & Tools Gateway Architecture Blueprint'}
                </h2>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${
                    viewMode === 'request-flow'
                      ? terminationInfo?.type === 'blocked-security' || terminationInfo?.type === 'blocked-quota'
                        ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                        : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                      : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                  }`}
                >
                  {viewMode === 'request-flow'
                    ? terminationInfo
                      ? terminationInfo.badgeText
                      : 'END-TO-END EXECUTED (ALL STEPS PASSED)'
                    : 'Interactive Demo Reference'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {viewMode === 'request-flow'
                  ? 'Showing the exact policies executed for the tested request. Downstream policies after a block or cache hit are omitted.'
                  : 'Click any stage in the pipeline to inspect active XML policies, governance controls, and demo talking points.'}
              </p>
            </div>
          </div>

          {/* Right Controls: View Mode Toggle + Segmented Switcher + Close Button */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Toggle between Actual Request Flow vs Full Blueprint */}
            {activeFlow !== 'dual-pattern' && (
              <div className="flex items-center bg-slate-200/70 dark:bg-slate-900 p-1 rounded-xl border border-slate-300/80 dark:border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('request-flow')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    viewMode === 'request-flow'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Show only the policies that executed for the last tested request"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Tested Request Flow</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('full-blueprint')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    viewMode === 'full-blueprint'
                      ? 'bg-slate-800 dark:bg-slate-700 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Show all architecture stages in the reference blueprint"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Full Architecture</span>
                </button>
              </div>
            )}

            {/* Gateway Switcher */}
            <div className="flex items-center bg-slate-200/70 dark:bg-slate-900 p-1 rounded-xl border border-slate-300/80 dark:border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveFlow('ai-gateway');
                  setSelectedStageId('ai-router');
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  activeFlow === 'ai-gateway'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Gateway</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveFlow('mcp-gateway');
                  setSelectedStageId('mcp-rbac');
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  activeFlow === 'mcp-gateway'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>MCP Tools</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveFlow('dual-pattern')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  activeFlow === 'dual-pattern'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Workflow className="w-3.5 h-3.5" />
                <span>ADK Dual-Pattern</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition cursor-pointer"
              title="Close Blueprint"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {activeFlow === 'dual-pattern' ? (
            /* Dual-Pattern ADK Architecture View */
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-cyan-500/10 border border-purple-300/60 dark:border-purple-800/60 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
                  <Workflow className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Google ADK (Agent Development Kit) — Enterprise Dual-Pattern Architecture
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Enterprise AI agents require strict governance over both <strong>Reasoning (LLM calls)</strong> and <strong>Action (Tool executions)</strong>. Instead of hardcoding direct Vertex AI or microservice credentials inside agent code, the ADK Agent routes all model calls through the <strong>AI Gateway</strong> and all tool calls through the <strong>MCP Tools Gateway</strong>.
                </p>
              </div>

              {/* Dual-Pattern Visual Diagram Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                {/* Left Column: Agent Microservice */}
                <div className="bg-slate-50 dark:bg-slate-900/90 border-2 border-purple-500/40 rounded-2xl p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                        Cloud Run Microservice
                      </span>
                      <span className="text-xs font-mono text-slate-400">Python FastAPI</span>
                    </div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                      Google ADK Agent Runtime
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      Orchestrates multi-step reasoning loops, state management, and tool invocation using unified developer credentials.
                    </p>
                    <div className="space-y-2.5 text-xs">
                      <div className="p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 mb-0.5">1. Northbound Ingress</div>
                        <div className="text-slate-500 dark:text-slate-400 text-[11px]">Fronted by Enterprise API Gateway for client authentication & rate limiting.</div>
                      </div>
                      <div className="p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 mb-0.5">2. Zero Hardcoded Keys</div>
                        <div className="text-slate-500 dark:text-slate-400 text-[11px]">Uses persona-scoped API Keys (Admin, Sales Agent, Loans Agent) injected at runtime.</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-purple-600 dark:text-purple-400 font-semibold">
                    <span>Dual Outbound Channels</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>

                {/* Middle Column: Two Gateways */}
                <div className="space-y-4 flex flex-col justify-between">
                  {/* Pattern A: AI Gateway */}
                  <div
                    onClick={() => setActiveFlow('ai-gateway')}
                    className="bg-blue-50/50 dark:bg-blue-950/20 border-2 border-blue-500/40 hover:border-blue-500 rounded-2xl p-4 cursor-pointer transition group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-blue-600 text-white">
                        Channel 1: Model Calls
                      </span>
                      <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 group-hover:underline flex items-center gap-1">
                        Inspect Pipeline <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                    <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
                      <Sparkles className="w-4 h-4 text-blue-500" />
                      AI Gateway (ai-gateway-v1)
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                      Intercepts agent LLM prompts for safety, caching, smart routing, and token quota governance.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-2 py-0.5 text-[10px] rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">Model Armor</span>
                      <span className="px-2 py-0.5 text-[10px] rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">Semantic Cache</span>
                      <span className="px-2 py-0.5 text-[10px] rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">Auto-Router</span>
                      <span className="px-2 py-0.5 text-[10px] rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">Token Quotas</span>
                    </div>
                  </div>

                  {/* Pattern B: MCP Gateway */}
                  <div
                    onClick={() => setActiveFlow('mcp-gateway')}
                    className="bg-cyan-50/50 dark:bg-cyan-950/20 border-2 border-cyan-500/40 hover:border-cyan-500 rounded-2xl p-4 cursor-pointer transition group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-cyan-600 text-white">
                        Channel 2: Tool Execution
                      </span>
                      <span className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 group-hover:underline flex items-center gap-1">
                        Inspect Pipeline <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                    <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
                      <Terminal className="w-4 h-4 text-cyan-500" />
                      MCP Tools Gateway (/mcp)
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                      Serves native JSON-RPC 2.0 MCP tools with persona-based RBAC catalog filtering and REST bridging.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-2 py-0.5 text-[10px] rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">JSON-RPC 2.0</span>
                      <span className="px-2 py-0.5 text-[10px] rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">Persona RBAC</span>
                      <span className="px-2 py-0.5 text-[10px] rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">REST Bridge</span>
                      <span className="px-2 py-0.5 text-[10px] rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">Rate Limiting</span>
                    </div>
                  </div>
                </div>

                {/* Right Column: Upstream Providers & Enterprise Systems */}
                <div className="space-y-4 flex flex-col justify-between">
                  <div className="bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                    <div className="text-[10px] font-bold uppercase text-slate-400 mb-2">Upstream Foundation Models</div>
                    <div className="space-y-2">
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Vertex AI Gemini 2.5</div>
                          <div className="text-[11px] text-slate-500">Flash, Flash-Lite & Pro</div>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">Google Cloud</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Anthropic Claude 4.5</div>
                          <div className="text-[11px] text-slate-500">Haiku & Sonnet via Vertex</div>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">Anthropic</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                    <div className="text-[10px] font-bold uppercase text-slate-400 mb-2">Enterprise Backend Systems</div>
                    <div className="space-y-2">
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Sales & Inventory API</div>
                          <div className="text-[11px] text-slate-500">Discounts & SKU Catalog</div>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">REST / JSON</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Loans & Banking Core</div>
                          <div className="text-[11px] text-slate-500">Underwriting & Loan Status</div>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">Core Banking</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Interactive Pipeline Flowchart (AI Gateway OR MCP Tools Gateway) */
            <>
              {/* Pipeline Steps Grid */}
              <div>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {viewMode === 'request-flow'
                        ? `Executed Pipeline Path (${visibleStages.length} of ${allCurrentStages.length} Stages Executed)`
                        : activeFlow === 'ai-gateway'
                          ? 'AI Gateway Proxy Pipeline (PreFlow ➔ Target ➔ PostFlow)'
                          : 'MCP Tools Gateway Proxy Pipeline (JSON-RPC 2.0 Ingress ➔ RBAC ➔ Backend)'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Click any executed step below to inspect its XML policies & telemetry
                  </span>
                </div>

                {/* Dynamic Flow Container */}
                <div className="flex flex-col lg:flex-row items-stretch gap-3">
                  {/* Rendered Executed Stages */}
                  <div
                    className={`grid grid-cols-1 sm:grid-cols-2 ${
                      visibleStages.length === 1
                        ? 'lg:grid-cols-1 lg:w-1/3'
                        : visibleStages.length === 2
                          ? 'lg:grid-cols-2 lg:w-1/2'
                          : visibleStages.length === 3
                            ? 'lg:grid-cols-3 lg:w-3/5'
                            : visibleStages.length === 5
                              ? 'lg:grid-cols-5 flex-1'
                              : 'lg:grid-cols-6 flex-1'
                    } gap-2.5`}
                  >
                    {visibleStages.map((stage, idx) => {
                      const isSelected = stage.id === activeStage.id;
                      const isBlockingStep = stage.liveStatus?.status === 'block';
                      const isCacheHitStep = stage.liveStatus?.status === 'hit' && stage.id === 'ai-cache';

                      return (
                        <div
                          key={stage.id}
                          onClick={() => setSelectedStageId(stage.id)}
                          className={`relative rounded-xl p-3.5 border transition cursor-pointer flex flex-col justify-between ${
                            isBlockingStep
                              ? 'bg-rose-50/90 dark:bg-rose-950/50 border-2 border-rose-600 dark:border-rose-500 ring-4 ring-rose-500/20 shadow-lg'
                              : isCacheHitStep
                                ? 'bg-emerald-50/90 dark:bg-emerald-950/50 border-2 border-emerald-600 dark:border-emerald-500 ring-4 ring-emerald-500/20 shadow-lg'
                                : isSelected
                                  ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-600 dark:border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                                  : 'bg-slate-50/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          <div>
                            {/* Step number & icon */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span
                                className={`text-[11px] font-mono font-bold ${
                                  isBlockingStep
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : isCacheHitStep
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-slate-400 dark:text-slate-500'
                                }`}
                              >
                                STEP {stage.step}
                              </span>
                              <div
                                className={`p-1.5 rounded-lg border shadow-2xs ${
                                  isBlockingStep
                                    ? 'bg-rose-600 text-white border-rose-700'
                                    : isCacheHitStep
                                      ? 'bg-emerald-600 text-white border-emerald-700'
                                      : 'bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700'
                                }`}
                              >
                                {isBlockingStep ? (
                                  <ShieldAlert className="w-4 h-4 text-white" />
                                ) : (
                                  stage.icon
                                )}
                              </div>
                            </div>

                            {/* Badge */}
                            <div className="mb-1.5">
                              <span
                                className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                                  isBlockingStep
                                    ? 'bg-rose-600 text-white border-rose-700'
                                    : stage.badgeColor
                                }`}
                              >
                                {isBlockingStep ? '⛔ BLOCKED HERE' : stage.badge}
                              </span>
                            </div>

                            {/* Title & Subtitle */}
                            <h4
                              className={`text-xs font-bold leading-snug mb-1 ${
                                isBlockingStep
                                  ? 'text-rose-950 dark:text-rose-100'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {stage.title}
                            </h4>
                            <p
                              className={`text-[11px] leading-tight ${
                                isBlockingStep
                                  ? 'text-rose-700 dark:text-rose-300 font-medium'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {stage.subtitle}
                            </p>
                          </div>

                          {/* Live Telemetry Badge if available */}
                          {stage.liveStatus && (
                            <div className="mt-3 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                              <div
                                className={`px-2 py-1 rounded text-[10px] font-bold border flex items-center justify-between ${getStatusBadgeClasses(
                                  stage.liveStatus.status
                                )}`}
                              >
                                <span className="truncate">{stage.liveStatus.label}</span>
                                {stage.liveStatus.status === 'pass' || stage.liveStatus.status === 'hit' ? (
                                  <CheckCircle2 className="w-3 h-3 shrink-0 ml-1" />
                                ) : stage.liveStatus.status === 'block' ? (
                                  <Ban className="w-3 h-3 shrink-0 ml-1" />
                                ) : null}
                              </div>
                            </div>
                          )}

                          {/* Connector arrow indicator on desktop */}
                          {idx < visibleStages.length - 1 && (
                            <div className="hidden lg:flex absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 items-center justify-center text-slate-400 shadow-2xs">
                              <ArrowRight className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Short-Circuit Termination Card (Rendered when downstream policies were NOT executed) */}
                  {terminationInfo && (
                    <div
                      className={`flex-1 rounded-2xl p-4 sm:p-5 border-2 flex flex-col justify-between ${
                        terminationInfo.type === 'cache-hit'
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-500/60 text-emerald-950 dark:text-emerald-100'
                          : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-500/60 text-rose-950 dark:text-rose-100'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span
                            className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${
                              terminationInfo.type === 'cache-hit'
                                ? 'bg-emerald-600 text-white border-emerald-700'
                                : 'bg-rose-600 text-white border-rose-700'
                            }`}
                          >
                            {terminationInfo.badgeText}
                          </span>
                          <span className="text-[11px] font-mono font-semibold opacity-75">
                            Downstream Policies Omitted
                          </span>
                        </div>

                        <h4 className="text-sm font-bold mb-1.5 flex items-center gap-2">
                          {terminationInfo.type === 'cache-hit' ? (
                            <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                          )}
                          <span>{terminationInfo.reasonTitle}</span>
                        </h4>

                        <p className="text-xs leading-relaxed opacity-90 mb-4">
                          {terminationInfo.reasonDescription}
                        </p>
                      </div>

                      {/* List of Omitted Downstream Policies */}
                      <div className="pt-3 border-t border-rose-200/60 dark:border-rose-800/40">
                        <div className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1.5">
                          Policies & Stages Bypassed / Not Executed:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {terminationInfo.skippedStages.map((skipped) => (
                            <span
                              key={skipped}
                              className="px-2 py-0.5 rounded-md text-[10px] font-mono line-through opacity-75 bg-white/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                            >
                              {skipped}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Stage Detailed Inspector Panel */}
              <div className="bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left 7 Cols: Executed Policies Table */}
                  <div className="lg:col-span-7 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileCode2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Stage {activeStage.step}: {activeStage.title} — Active Gateway Policies
                        </h3>
                      </div>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        {activeFlow === 'ai-gateway' ? 'apiproxy/policies/' : 'mcp/apiproxy/policies/'}
                      </span>
                    </div>

                    <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/60 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                            <th className="py-2.5 px-3.5">Policy Name (XML)</th>
                            <th className="py-2.5 px-3">Policy Type</th>
                            <th className="py-2.5 px-3.5">Execution Role</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                          {activeStage.policies.map((pol) => (
                            <tr key={pol.name} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                              <td className="py-2.5 px-3.5 font-mono font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                {pol.name}.xml
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                  {pol.type}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-300 leading-relaxed">
                                {pol.purpose}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right 5 Cols: Presenter Demo Walkthrough Talking Points & Live Trace Correlation */}
                  <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          Customer Demo Talking Points
                        </h4>
                      </div>

                      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
                        {activeStage.talkingPoints.map((point, i) => (
                          <div key={i} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                            <div className="w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
                              {i + 1}
                            </div>
                            <span>{point}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Live Telemetry Correlation Box */}
                    {activeStage.liveStatus && (
                      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-bold uppercase text-slate-400">
                            Last Playground Request Status
                          </div>
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                            {activeStage.liveStatus.detail}
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getStatusBadgeClasses(activeStage.liveStatus.status)}`}>
                          {activeStage.liveStatus.label}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>
              {viewMode === 'request-flow'
                ? 'Viewing exact execution flow for the tested request. Switch to "Full Architecture" in the top bar to see all stages.'
                : 'Tip: Click "Request Flow" next to any Target URL in the playground to see the exact flow for that request.'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition cursor-pointer shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
