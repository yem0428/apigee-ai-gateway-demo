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
  Users,
  Bot,
  Globe,
  Cloud,
  Network,
  Building2,
} from 'lucide-react';
import { GatewayTelemetry, McpTelemetry } from '../types';
import { GoogleLogo, AnthropicLogo } from './ProviderLogos';

interface ArchitectureBlueprintModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'ai-gateway' | 'mcp-gateway' | 'overview';
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
  const [activeFlow, setActiveFlow] = useState<'ai-gateway' | 'mcp-gateway' | 'overview'>(initialTab);
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
      title: 'Access Control',
      subtitle: 'Model & Tool Access by User / Agent Permission',
      badge: 'Security & RBAC',
      badgeColor: 'bg-blue-100 text-blue-700 border-blue-300',
      icon: <Key className="w-4 h-4 text-blue-600" />,
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
      title: 'Model Armor',
      subtitle: 'Prompt Injection, Jailbreak & PII Defense',
      badge: 'Safety Perimeter',
      badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-300',
      icon: <ShieldCheck className="w-4 h-4 text-emerald-600" />,
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
      title: 'Cache',
      subtitle: 'Semantic Vector Similarity Matching (<100ms)',
      badge: 'Latency & Cost Saver',
      badgeColor: 'bg-purple-100 text-purple-700 border-purple-300',
      icon: <Database className="w-4 h-4 text-purple-600" />,
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
      title: 'Model Routing',
      subtitle: 'Dynamic Routing Across Providers & Private Models (/auto)',
      badge: 'Intelligent Routing',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
      icon: <Cpu className="w-4 h-4 text-amber-600" />,
      policies: [
        { name: 'JS-PrepRouterRequest', type: 'JavaScript', purpose: 'Builds the classifier payload: prompt excerpt, temperature 0, and a response schema constraining the answer to coding | deep_reasoning | simple | general.' },
        { name: 'SC-ModelRouter', type: 'ServiceCallout', purpose: 'Calls a small, fast router model (gemini-3.1-flash-lite) to classify the prompt. 2.5s timeout and continue-on-error, so a router blip degrades to the product default instead of failing the request.' },
        { name: 'JS-AutoRouting', type: 'JavaScript', purpose: 'Maps the returned category to a concrete model using the API Product’s routing.model.* custom attributes. Holds no model names of its own.' },
        { name: 'AM-RouteGeminiTarget', type: 'AssignMessage', purpose: 'Routes request to Vertex AI Gemini endpoint (gemini-3.1-flash-lite, gemini-3-flash-preview, or gemini-3.1-pro-preview).' },
        { name: 'AM-RouteClaudeTarget', type: 'AssignMessage', purpose: 'Routes coding prompts on Enterprise tier to Anthropic Claude on Vertex (claude-opus-4-5@20251101).' },
      ],
      talkingPoints: [
        'Developers call a single logical endpoint (/ai/v1/auto) without hardcoding model versions.',
        'Tier-aware routing: Standard tier is capped at gemini-3-flash-preview; Enterprise tier unlocks Gemini 3.1 Pro & Claude Opus 4.5.',
        'A small router model classifies each prompt on intent, so coding work lands on Claude Opus 4.5 and trivial lookups on low-cost Flash-Lite — no keyword or length rules to maintain.',
        'The category-to-model map lives on the API Product as custom attributes, so entitlements and model choices change without redeploying the proxy.',
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
      title: 'Tokenomics',
      subtitle: 'Product-Driven Token Limits & Per-Minute Budgets',
      badge: 'FinOps Governance',
      badgeColor: 'bg-rose-100 text-rose-700 border-rose-300',
      icon: <Coins className="w-4 h-4 text-rose-600" />,
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
      badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-300',
      icon: <Server className="w-4 h-4 text-cyan-600" />,
      policies: [
        { name: 'KVM-GetModelRates', type: 'KeyValueMapOperations', purpose: 'Reads live input/output per-1k token rates from the ai-model-rates KVM.' },
        { name: 'JS-CalculateCost', type: 'JavaScript', purpose: 'Computes exact USD cost for the request and debits prepaid developer wallet if applicable.' },
        { name: 'DC-ModelAnalytics', type: 'DataCapture', purpose: 'Streams model name, token counts, latency, and cost into custom Analytics dimensions.' },
        { name: 'AM-SetResponseHeaders', type: 'AssignMessage', purpose: 'Injects x-gateway-* trace headers (model, provider, cost-usd, total-tokens, cached) for UI inspection.' },
      ],
      talkingPoints: [
        'Abstracts credential management: the gateway authenticates to Vertex AI / Model Garden via Google Cloud Workload Identity.',
        'Calculates real-time per-request USD cost using live KVM rate cards and injects x-gateway-* telemetry headers.',
        'Feeds the Analytics & Cost dashboard with custom analytics dimensions (dc_model_name, dc_user_email, dc_total_tokens) to track consumption across tools and models.',
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
      badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-300',
      icon: <Terminal className="w-4 h-4 text-cyan-600" />,
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
      title: 'Tokenomics',
      subtitle: 'Agent Key Verification & Granular Tool Call Rate Limits',
      badge: 'Traffic Control',
      badgeColor: 'bg-blue-100 text-blue-700 border-blue-300',
      icon: <Lock className="w-4 h-4 text-blue-600" />,
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
      title: 'Access Control',
      subtitle: 'Persona-Based Tool Visibility & Execution Authorization',
      badge: 'Zero-Trust RBAC',
      badgeColor: 'bg-purple-100 text-purple-700 border-purple-300',
      icon: <ShieldCheck className="w-4 h-4 text-purple-600" />,
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
      title: 'Native MCP Server',
      subtitle: 'Existing REST APIs Served as MCP Tools — No New Infrastructure',
      badge: 'Protocol Bridge',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
      icon: <Workflow className="w-4 h-4 text-amber-600" />,
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
      badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-300',
      icon: <Server className="w-4 h-4 text-emerald-600" />,
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
          stoppedAtTitle: 'Access Control',
          reasonTitle: `Request Blocked at Step 01 — HTTP ${aiStatus} ${aiStatus === 401 ? 'Unauthorized' : 'Forbidden'}`,
          reasonDescription:
            'Authentication or API Product model entitlement check failed (VA-VerifyAPIKey / OAS-ValidateRequest). Downstream policies (Model Armor, Cache, Model Routing, Tokenomics, and Upstream Models) were never executed.',
          badgeText: 'SHORT-CIRCUITED AT AUTH',
          type: 'blocked-security',
          skippedStages: ['02 Model Armor', '03 Cache', '04 Model Routing', '05 Tokenomics', '06 Upstream LLM'],
        };
      } else if (isAiGuardrailBlocked) {
        visibleStages = aiStages.slice(0, 2); // Only Steps 01 & 02 executed
        terminationInfo = {
          stoppedAtStep: '02',
          stoppedAtTitle: 'Model Armor',
          reasonTitle: 'Perimeter Defense Triggered — Prompt Blocked by Model Armor',
          reasonDescription:
            aiTelemetry.guardrailMessage ||
            'SUP-UserPrompt.xml detected a safety violation (Prompt Injection, Jailbreak, or Destructive intent) and immediately terminated execution. Cache, Model Routing, Tokenomics, and Foundation Models were never invoked ($0.00 cost, 0 tokens consumed).',
          badgeText: 'BLOCKED AT PERIMETER (HTTP 400)',
          type: 'blocked-security',
          skippedStages: ['03 Cache', '04 Model Routing', '05 Tokenomics', '06 Upstream Foundation Models'],
        };
      } else if (isAiCached) {
        visibleStages = aiStages.slice(0, 3); // Steps 01, 02 & 03 executed (Cache Hit short-circuit)
        terminationInfo = {
          stoppedAtStep: '03',
          stoppedAtTitle: 'Cache',
          reasonTitle: `Semantic Cache HIT — Response Served in ${aiTelemetry.latencyMs} ms`,
          reasonDescription:
            'SCL-Semantic-Cache-Lookup.xml matched the prompt embedding in the vector store and returned the cached completion immediately. Model Routing, Tokenomics enforcement, and Upstream LLM inference were completely bypassed ($0.00 upstream model cost, 0 quota tokens deducted).',
          badgeText: 'CACHE SHORT-CIRCUIT ($0 COST)',
          type: 'cache-hit',
          skippedStages: ['04 Model Routing', '05 Tokenomics', '06 Upstream Foundation Models'],
        };
      } else if (isAiQuotaBlocked) {
        visibleStages = aiStages.slice(0, 5); // Steps 01 -> 05 executed; Step 06 blocked
        terminationInfo = {
          stoppedAtStep: '05',
          stoppedAtTitle: 'Tokenomics',
          reasonTitle: 'Token Quota Exhausted — Request Throttled at Step 05 (HTTP 429)',
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
          stoppedAtTitle: 'Tokenomics',
          reasonTitle: `MCP Request Blocked at Step 02 — HTTP ${mcpStatus}`,
          reasonDescription:
            'VA-VerifyAPIKey or Q-Limit rejected the request before tool authorization or backend bridging.',
          badgeText: `BLOCKED (HTTP ${mcpStatus})`,
          type: 'blocked-quota',
          skippedStages: ['03 Access Control', '04 Native MCP Server', '05 Enterprise Backend Microservices'],
        };
      } else if (isMcpRbacBlocked) {
        visibleStages = mcpStages.slice(0, 3); // Steps 01, 02, 03
        terminationInfo = {
          stoppedAtStep: '03',
          stoppedAtTitle: 'Access Control',
          reasonTitle: 'Zero-Trust RBAC Denied — Unauthorized Tool Invocation',
          reasonDescription:
            'PP-MCP blocked the tool call because the active persona (Developer App entitlement) is not authorized to execute this tool. Downstream REST bridge and Enterprise Backend Microservices were never invoked.',
          badgeText: 'RBAC DENIED (-32001)',
          type: 'blocked-security',
          skippedStages: ['04 Native MCP Server', '05 Enterprise Backend Microservices'],
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
        return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30';
      case 'pass':
        return 'bg-blue-500/15 text-blue-700 border-blue-500/30';
      case 'warn':
        return 'bg-amber-500/15 text-amber-700 border-amber-500/30';
      case 'block':
        return 'bg-rose-500/20 text-rose-700 border-rose-500/40 font-bold';
      default:
        return 'bg-slate-500/15 text-slate-700 border-slate-500/30';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-600">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  {activeFlow === 'overview'
                    ? 'Enterprise AI & Agent Platform — Solution Architecture'
                    : viewMode === 'request-flow'
                      ? 'Live Request Execution Trace Flow'
                      : 'Enterprise AI & Tools Gateway Architecture Blueprint'}
                </h2>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${
                    activeFlow === 'overview'
                      ? 'bg-purple-100 text-purple-700 border-purple-300'
                      : viewMode === 'request-flow'
                        ? terminationInfo?.type === 'blocked-security' || terminationInfo?.type === 'blocked-quota'
                          ? 'bg-rose-100 text-rose-700 border-rose-300'
                          : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                        : 'bg-blue-100 text-blue-700 border-blue-300'
                  }`}
                >
                  {activeFlow === 'overview'
                    ? 'Start Here · High-Level View'
                    : viewMode === 'request-flow'
                      ? terminationInfo
                        ? terminationInfo.badgeText
                        : 'END-TO-END EXECUTED (ALL STEPS PASSED)'
                      : 'Interactive Demo Reference'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {activeFlow === 'overview'
                  ? 'How consumers, agents and enterprise systems connect through Apigee. Click the AI Gateway or MCP Gateway to drill into its pipeline.'
                  : viewMode === 'request-flow'
                    ? 'Showing the exact policies executed for the tested request. Downstream policies after a block or cache hit are omitted.'
                    : 'Click any stage in the pipeline to inspect active XML policies, governance controls, and demo talking points.'}
              </p>
            </div>
          </div>

          {/* Right Controls: View Mode Toggle + Segmented Switcher + Close Button */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Toggle between Actual Request Flow vs Full Blueprint */}
            {activeFlow !== 'overview' && (
              <div className="flex items-center bg-slate-200/70 p-1 rounded-xl border border-slate-300/80 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('request-flow')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    viewMode === 'request-flow'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
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
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Show all architecture stages in the reference blueprint"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Full Architecture</span>
                </button>
              </div>
            )}

            {/* Gateway Switcher */}
            <div className="flex items-center bg-slate-200/70 p-1 rounded-xl border border-slate-300/80 text-xs">
              <button
                type="button"
                onClick={() => setActiveFlow('overview')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  activeFlow === 'overview'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="High-level solution architecture — the starting point"
              >
                <Network className="w-3.5 h-3.5" />
                <span>Solution Overview</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveFlow('ai-gateway');
                  setSelectedStageId('ai-router');
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  activeFlow === 'ai-gateway'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
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
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>MCP Tools</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition cursor-pointer"
              title="Close Blueprint"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {activeFlow === 'overview' ? (
            /* High-Level Solution Architecture (conversation starting point) */
            <div className="space-y-5">
              <div className="bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-cyan-500/10 border border-purple-300/60 rounded-2xl p-4 sm:p-5">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">
                  <Network className="w-4 h-4 text-purple-600" />
                  One platform, two enforcement points
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Every consumer — users, apps, agents and external MCP/A2A clients — enters through an <strong>external Apigee layer</strong>. Agents and internal apps then reach models and tools only through the <strong>internal Apigee layer</strong>, where the <strong>AI Gateway</strong> governs reasoning (LLM calls) and the <strong>MCP Gateway</strong> governs action (tool calls). No credentials, model endpoints or backend URLs are ever hardcoded in application or agent code.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-semibold">Drill down:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFlow('ai-gateway');
                      setViewMode('full-blueprint');
                      setSelectedStageId('ai-router');
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Gateway pipeline
                    <ArrowRight className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFlow('mcp-gateway');
                      setViewMode('full-blueprint');
                      setSelectedStageId('mcp-rbac');
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-cyan-300 text-cyan-700 hover:bg-cyan-50 transition cursor-pointer"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    MCP Gateway pipeline
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Layered Flow Diagram */}
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_auto_minmax(0,1.05fr)_auto_minmax(0,1.05fr)_auto_minmax(0,1fr)] gap-3 items-stretch">
                {/* ---------- Column 1: Consumers ---------- */}
                <div className="flex flex-col">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Consumers</div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-2.5 space-y-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 leading-snug">External Users</div>
                          <div className="text-[10px] text-slate-500 leading-snug">Web &amp; mobile apps</div>
                        </div>
                        <span className="ml-auto shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded bg-white border border-slate-200 text-slate-600">REST</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-cyan-100 text-cyan-700 flex items-center justify-center shrink-0">
                          <Terminal className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 leading-snug">External MCP Clients</div>
                          <div className="text-[10px] text-slate-500 leading-snug">Claude, IDEs, partner agents</div>
                        </div>
                        <span className="ml-auto shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded bg-white border border-slate-200 text-slate-600">MCP</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                          <Bot className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 leading-snug">External A2A Clients</div>
                          <div className="text-[10px] text-slate-500 leading-snug">Partner agent-to-agent</div>
                        </div>
                        <span className="ml-auto shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded bg-white border border-slate-200 text-slate-600">A2A</span>
                      </div>
                    </div>

                    <div className="pt-1.5 mt-1 border-t border-dashed border-slate-300">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Internal</div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 leading-snug">Internal Users</div>
                            <div className="text-[10px] text-slate-500 leading-snug">Gemini Enterprise &amp; business apps</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden xl:flex items-center justify-center text-slate-300 pt-6">
                  <ArrowRight className="w-5 h-5" />
                </div>

                {/* ---------- Column 2: External Layer + Agent Runtime ---------- */}
                <div className="flex flex-col">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-2">External Layer</div>
                  <div className="rounded-2xl border-2 border-blue-500/40 bg-blue-50/50 p-3">
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                        <Globe className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">Apigee X</div>
                        <div className="text-[10px] text-slate-500">AuthN/Z, rate limits, threat protection</div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5">
                        <code className="text-[11px] font-mono font-bold text-slate-800">/rest-api/v1</code>
                        <span className="text-[9px] text-slate-400">→ rest backend</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-lg bg-white border border-cyan-200 px-2.5 py-1.5">
                        <code className="text-[11px] font-mono font-bold text-cyan-700">/mcp</code>
                        <span className="text-[9px] text-slate-400">→ mcp backend</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-lg bg-white border border-purple-200 px-2.5 py-1.5">
                        <code className="text-[11px] font-mono font-bold text-purple-700">/a2a</code>
                        <span className="text-[9px] text-slate-400">→ agent runtime</span>
                      </div>
                    </div>
                  </div>

                  <div className="hidden xl:flex justify-center py-1.5 text-slate-300">
                    <ArrowRight className="w-4 h-4 rotate-90" />
                  </div>

                  <div className="rounded-2xl border-2 border-purple-500/40 bg-purple-50/40 p-3 mt-3 xl:mt-0 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0">
                        <Workflow className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">Agent Runtime</div>
                        <div className="text-[10px] text-slate-500">Google ADK on Cloud Run</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mb-2">
                      <div className="rounded-lg bg-white border border-emerald-200 px-2 py-1.5 text-[11px] font-semibold text-emerald-800 text-center">
                        Agent 1
                      </div>
                      <div className="rounded-lg bg-white border border-emerald-200 px-2 py-1.5 text-[11px] font-semibold text-emerald-800 text-center">
                        Agent 2
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 leading-snug">
                      Agents hold <strong>persona-scoped API keys only</strong> — every model call and every tool call exits to the internal layer.
                    </div>
                  </div>
                </div>

                <div className="hidden xl:flex items-center justify-center text-slate-300 pt-6">
                  <ArrowRight className="w-5 h-5" />
                </div>

                {/* ---------- Column 3: Internal Layer (governance plane) ---------- */}
                <div className="flex flex-col">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-2">Internal Layer</div>
                  <div className="flex-1 rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/40 p-3 flex flex-col">
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">Apigee X — Governance Plane</div>
                        <div className="text-[10px] text-slate-500">Where AI &amp; tool policy is enforced</div>
                      </div>
                    </div>

                    <div className="space-y-2 flex-1">
                      {/* AI Gateway (clickable) */}
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFlow('ai-gateway');
                          setViewMode('full-blueprint');
                          setSelectedStageId('ai-router');
                        }}
                        className="w-full text-left rounded-xl bg-white border-2 border-blue-400 hover:border-blue-600 hover:shadow-md transition p-2.5 cursor-pointer group"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-xs font-bold text-slate-900">AI Gateway</span>
                          </div>
                          <span className="text-[10px] font-semibold text-blue-600 group-hover:underline flex items-center gap-0.5">
                            Inspect <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                        <code className="block text-[11px] font-mono font-bold text-blue-700 mb-1.5">{'/llm/<model>'}</code>
                        <div className="flex flex-wrap gap-1">
                          <span className="px-1.5 py-0.5 text-[9px] rounded bg-slate-100 text-slate-700">Model Armor</span>
                          <span className="px-1.5 py-0.5 text-[9px] rounded bg-slate-100 text-slate-700">Semantic Cache</span>
                          <span className="px-1.5 py-0.5 text-[9px] rounded bg-slate-100 text-slate-700">Auto-Routing</span>
                          <span className="px-1.5 py-0.5 text-[9px] rounded bg-slate-100 text-slate-700">Token Quotas</span>
                        </div>
                      </button>

                      {/* MCP Gateway (clickable) */}
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFlow('mcp-gateway');
                          setViewMode('full-blueprint');
                          setSelectedStageId('mcp-rbac');
                        }}
                        className="w-full text-left rounded-xl bg-white border-2 border-cyan-400 hover:border-cyan-600 hover:shadow-md transition p-2.5 cursor-pointer group"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5">
                            <Terminal className="w-3.5 h-3.5 text-cyan-600" />
                            <span className="text-xs font-bold text-slate-900">MCP Gateway</span>
                          </div>
                          <span className="text-[10px] font-semibold text-cyan-600 group-hover:underline flex items-center gap-0.5">
                            Inspect <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                        <code className="block text-[11px] font-mono font-bold text-cyan-700 mb-1.5">/mcp</code>
                        <div className="flex flex-wrap gap-1">
                          <span className="px-1.5 py-0.5 text-[9px] rounded bg-slate-100 text-slate-700">JSON-RPC 2.0</span>
                          <span className="px-1.5 py-0.5 text-[9px] rounded bg-slate-100 text-slate-700">Persona RBAC</span>
                          <span className="px-1.5 py-0.5 text-[9px] rounded bg-slate-100 text-slate-700">REST → MCP</span>
                          <span className="px-1.5 py-0.5 text-[9px] rounded bg-slate-100 text-slate-700">Tool Catalog</span>
                        </div>
                      </button>

                      <div className="flex items-center justify-between gap-2 rounded-xl bg-white border border-slate-200 px-2.5 py-1.5">
                        <code className="text-[11px] font-mono font-bold text-slate-700">/rest-api/v1</code>
                        <span className="text-[9px] text-slate-400">system APIs</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 mt-2.5 pt-2.5 border-t border-emerald-200">
                      <div className="flex items-center justify-center gap-1 rounded-lg bg-white border border-slate-200 py-1 text-[9px] font-semibold text-slate-600">
                        <Lock className="w-3 h-3" /> Security
                      </div>
                      <div className="flex items-center justify-center gap-1 rounded-lg bg-white border border-slate-200 py-1 text-[9px] font-semibold text-slate-600">
                        <Coins className="w-3 h-3" /> Analytics
                      </div>
                      <div className="flex items-center justify-center gap-1 rounded-lg bg-white border border-slate-200 py-1 text-[9px] font-semibold text-slate-600">
                        <FileCode2 className="w-3 h-3" /> Registry
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden xl:flex items-center justify-center text-slate-300 pt-6">
                  <ArrowRight className="w-5 h-5" />
                </div>

                {/* ---------- Column 4: Upstream Providers & Systems ---------- */}
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Models &amp; Tools</div>
                    <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-2.5">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-blue-600 mb-1.5">Foundation Models</div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 p-2">
                          <GoogleLogo className="w-4 h-4 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold text-slate-800 leading-snug">Vertex AI — Gemini</div>
                            <div className="text-[9px] text-slate-500 leading-snug">Flash-Lite, Flash &amp; Pro</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 p-2">
                          <AnthropicLogo className="w-4 h-4 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold text-slate-800 leading-snug">Anthropic — Claude</div>
                            <div className="text-[9px] text-slate-500 leading-snug">Haiku &amp; Opus via Vertex</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-cyan-200 bg-cyan-50/40 p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-cyan-700 mb-1.5">Enterprise APIs → MCP</div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 p-2">
                        <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                          <Server className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-slate-800 leading-snug">Sales &amp; Inventory API</div>
                          <div className="text-[9px] text-slate-500 leading-snug">REST bridged to MCP tools</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 p-2">
                        <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                          <Building2 className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-slate-800 leading-snug">Loans &amp; Banking Core</div>
                          <div className="text-[9px] text-slate-500 leading-snug">REST bridged to MCP tools</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5 flex-1">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Third-Party MCP Servers</div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 p-2">
                        <div className="w-6 h-6 rounded-md bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                          <Cloud className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-slate-800 leading-snug">Salesforce</div>
                          <div className="text-[9px] text-slate-500 leading-snug">CRM records &amp; opportunities</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 p-2">
                        <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                          <Database className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-slate-800 leading-snug">BigQuery</div>
                          <div className="text-[9px] text-slate-500 leading-snug">Governed analytics queries</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Legend / talking points */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Reasoning is governed
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Prompts are screened, cached and routed to the cheapest capable model, with token quotas per product tier.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 mb-1">
                    <Terminal className="w-3.5 h-3.5 text-cyan-600" /> Action is governed
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Existing REST APIs are exposed as MCP tools, alongside third-party MCP servers, filtered per persona.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 mb-1">
                    <Key className="w-3.5 h-3.5 text-amber-600" /> One identity everywhere
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    The same API key drives entitlements, spend and audit across models and tools — no provider keys in code.
                  </p>
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
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      {viewMode === 'request-flow'
                        ? `Executed Pipeline Path (${visibleStages.length} of ${allCurrentStages.length} Stages Executed)`
                        : activeFlow === 'ai-gateway'
                          ? 'AI Gateway Proxy Pipeline (PreFlow ➔ Target ➔ PostFlow)'
                          : 'MCP Tools Gateway Proxy Pipeline (JSON-RPC 2.0 Ingress ➔ RBAC ➔ Backend)'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
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
                              ? 'bg-rose-50/90 border-2 border-rose-600 ring-4 ring-rose-500/20 shadow-lg'
                              : isCacheHitStep
                                ? 'bg-emerald-50/90 border-2 border-emerald-600 ring-4 ring-emerald-500/20 shadow-lg'
                                : isSelected
                                  ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-500/20 shadow-md'
                                  : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div>
                            {/* Step number & icon */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span
                                className={`text-[11px] font-mono font-bold ${
                                  isBlockingStep
                                    ? 'text-rose-600'
                                    : isCacheHitStep
                                      ? 'text-emerald-600'
                                      : 'text-slate-400'
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
                                      : 'bg-white border-slate-200/80'
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
                                  ? 'text-rose-950'
                                  : 'text-slate-900'
                              }`}
                            >
                              {stage.title}
                            </h4>
                            <p
                              className={`text-[11px] leading-tight ${
                                isBlockingStep
                                  ? 'text-rose-700 font-medium'
                                  : 'text-slate-500'
                              }`}
                            >
                              {stage.subtitle}
                            </p>
                          </div>

                          {/* Live Telemetry Badge if available */}
                          {stage.liveStatus && (
                            <div className="mt-3 pt-2 border-t border-slate-200/80">
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
                            <div className="hidden lg:flex absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full bg-white border border-slate-300 items-center justify-center text-slate-400 shadow-2xs">
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
                          ? 'bg-emerald-50/70 border-emerald-500/60 text-emerald-950'
                          : 'bg-rose-50/70 border-rose-500/60 text-rose-950'
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
                            <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                          )}
                          <span>{terminationInfo.reasonTitle}</span>
                        </h4>

                        <p className="text-xs leading-relaxed opacity-90 mb-4">
                          {terminationInfo.reasonDescription}
                        </p>
                      </div>

                      {/* List of Omitted Downstream Policies */}
                      <div className="pt-3 border-t border-rose-200/60">
                        <div className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1.5">
                          Policies & Stages Bypassed / Not Executed:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {terminationInfo.skippedStages.map((skipped) => (
                            <span
                              key={skipped}
                              className="px-2 py-0.5 rounded-md text-[10px] font-mono line-through opacity-75 bg-white/80 border border-slate-300 text-slate-600"
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
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left 7 Cols: Executed Policies Table */}
                  <div className="lg:col-span-7 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileCode2 className="w-4 h-4 text-blue-600" />
                        <h3 className="text-sm font-bold text-slate-900">
                          Stage {activeStage.step}: {activeStage.title} — Active Gateway Policies
                        </h3>
                      </div>
                      <span className="text-xs font-mono text-slate-500">
                        {activeFlow === 'ai-gateway' ? 'apiproxy/policies/' : 'mcp/apiproxy/policies/'}
                      </span>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-100/70 text-[11px] font-bold uppercase text-slate-500">
                            <th className="py-2.5 px-3.5">Policy Name (XML)</th>
                            <th className="py-2.5 px-3">Policy Type</th>
                            <th className="py-2.5 px-3.5">Execution Role</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-xs">
                          {activeStage.policies.map((pol) => (
                            <tr key={pol.name} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-3.5 font-mono font-semibold text-blue-600 whitespace-nowrap">
                                {pol.name}.xml
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-700 border border-slate-200">
                                  {pol.type}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 text-slate-600 leading-relaxed">
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
                        <MessageSquare className="w-4 h-4 text-emerald-600" />
                        <h4 className="text-sm font-bold text-slate-900">
                          Customer Demo Talking Points
                        </h4>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
                        {activeStage.talkingPoints.map((point, i) => (
                          <div key={i} className="flex items-start gap-2.5 text-xs text-slate-700 leading-relaxed">
                            <div className="w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
                              {i + 1}
                            </div>
                            <span>{point}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Live Telemetry Correlation Box */}
                    {activeStage.liveStatus && (
                      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-bold uppercase text-slate-400">
                            Last Playground Request Status
                          </div>
                          <div className="text-xs font-semibold text-slate-800 mt-0.5">
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
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
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
