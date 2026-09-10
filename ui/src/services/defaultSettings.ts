import { GatewaySettings, ScenarioPreset, GatewayEnvironment, UserPersona, UserInfo, KeyTier, SsoUser, McpPresetScenario } from '../types';

export interface EnvironmentInfo {
  id: GatewayEnvironment;
  name: string;
  proxyPath: string;
  upstreamUrl: string;
  mcpProxyPath: string;
  mcpUpstreamUrl: string;
  tag: string;
}

export const ENVIRONMENTS: Record<string, EnvironmentInfo> = {
  dev: {
    id: 'dev',
    name: 'Dev Gateway',
    proxyPath: '/api/vertexai-dev',
    upstreamUrl: 'https://bap.api.maloosatyam.demo.altostrat.com/vertexai/v1',
    mcpProxyPath: '/api/mcp-dev',
    mcpUpstreamUrl: 'https://bap.api.maloosatyam.demo.altostrat.com/mcp',
    tag: 'Dev',
  },
  prod: {
    id: 'prod',
    name: 'Production Gateway',
    proxyPath: '/api/vertexai-prod',
    upstreamUrl: 'https://api.maloosatyam.demo.altostrat.com/vertexai/v1',
    mcpProxyPath: '/api/mcp-prod',
    mcpUpstreamUrl: 'https://api.maloosatyam.demo.altostrat.com/mcp',
    tag: 'Prod',
  },
  custom: {
    id: 'custom',
    name: 'Custom Endpoint',
    proxyPath: '',
    upstreamUrl: '',
    mcpProxyPath: '',
    mcpUpstreamUrl: '',
    tag: 'Custom',
  },
};

export const getEnvironment = (env?: string): EnvironmentInfo => {
  if (env && ENVIRONMENTS[env]) {
    return ENVIRONMENTS[env];
  }
  return ENVIRONMENTS.dev;
};

export const getRuntimeEnv = (key: string, fallback: string = ''): string => {
  if (typeof window !== 'undefined' && (window as any).__RUNTIME_CONFIG__?.[key]) {
    return (window as any).__RUNTIME_CONFIG__[key];
  }
  const viteVal = (import.meta.env as any)[`VITE_${key}`] || (import.meta.env as any)[key];
  return viteVal !== undefined && viteVal !== '' ? viteVal : fallback;
};

export const createSsoUserFromEmail = (
  email: string,
  provider: string = 'Google Cloud Identity SSO'
): SsoUser => {
  const cleanEmail = email.trim();
  if (!cleanEmail) {
    return {
      name: 'SSO User',
      email: '',
      organization: 'google.com',
      provider,
      avatarText: 'SSO',
      isAuthenticated: false,
    };
  }

  const namePart = cleanEmail.split('@')[0] || 'User';
  const displayName = namePart
    .split(/[._-]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(' ') || namePart;

  let initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((n) => n.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');

  if (!initials) {
    initials = cleanEmail.slice(0, 2).toUpperCase();
  }

  const domain = cleanEmail.split('@')[1] || 'google.com';

  return {
    name: displayName,
    email: cleanEmail,
    organization: domain,
    provider,
    avatarText: initials,
    isAuthenticated: true,
  };
};

const defaultInitialEmail = getRuntimeEnv('SSO_USER_EMAIL', 'demo.user@google.com');
export const DEFAULT_SSO_USER: SsoUser = createSsoUserFromEmail(defaultInitialEmail);

export const USERS: Record<UserPersona, UserInfo> = {
  bronze_user: {
    id: 'bronze_user',
    name: 'Bronze User',
    email: getRuntimeEnv('BRONZE_USER_EMAIL', 'bronze.user@example.com'),
    apiKey: getRuntimeEnv('BRONZE_API_KEY', ''),
    badge: 'Bronze',
  },
  silver_user: {
    id: 'silver_user',
    name: 'All MCP User',
    email: getRuntimeEnv('SILVER_USER_EMAIL', 'all.mcp@example.com'),
    apiKey: getRuntimeEnv('SILVER_API_KEY', ''),
    badge: 'All MCP',
  },
  sales_agent: {
    id: 'sales_agent',
    name: 'Sales Agent',
    email: getRuntimeEnv('SALES_AGENT_EMAIL', 'sales.agent@example.com'),
    apiKey: getRuntimeEnv('SALES_API_KEY', ''),
    badge: 'Sales Agent',
  },
};

export const getUserInfo = (userKey?: string): UserInfo => {
  if (userKey && USERS[userKey as UserPersona]) {
    return USERS[userKey as UserPersona];
  }
  return USERS.bronze_user;
};

export interface KeyTierInfo {
  id: KeyTier;
  name: string;
  key: string;
  description: string;
  badge: string;
}

export const KEY_TIERS: Record<KeyTier, KeyTierInfo> = {
  bronze: {
    id: 'bronze',
    name: 'Bronze User Key',
    key: USERS.bronze_user.apiKey,
    description: 'Bronze User quota tier',
    badge: 'Bronze',
  },
  silver: {
    id: 'silver',
    name: 'All MCP Access Key',
    key: USERS.silver_user.apiKey,
    description: 'Full MCP tool suite access (Loans, Discounts, SKU Pricing)',
    badge: 'All MCP',
  },
  custom: {
    id: 'custom',
    name: 'Custom Key',
    key: '',
    description: 'Custom key',
    badge: 'Custom',
  },
};

export const DEFAULT_SETTINGS: GatewaySettings = {
  environment: 'dev',
  customBaseUrl: '',
  activeUser: 'bronze_user',
  keyTier: 'bronze',
  apiKey: USERS.bronze_user.apiKey,
  userEmail: DEFAULT_SSO_USER.email,
  ssoUser: DEFAULT_SSO_USER,
  projectId: 'bap-apac-demo2',
  location: 'global',
  model: 'gemini-3.1-flash-lite',
  useCache: false,
  omitEmailHeader: false,
};

export const AVAILABLE_MODELS = [
  { id: 'gemini-3.1-flash-lite', name: 'gemini-3.1-flash-lite', tag: 'Flash Lite' },
  { id: 'gemini-3-flash', name: 'gemini-3-flash', tag: 'Flash' },
  { id: 'gemini-3.1-pro-preview', name: 'gemini-3.1-pro-preview', tag: 'Pro Preview' },
  { id: 'auto', name: 'auto', tag: 'Intelligent Routing' },
];

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'success-prompt',
    title: 'Success (200 OK)',
    category: 'Overview',
    description: 'Fast, witty 2-sentence explanation demonstrating normal HTTP 200 OK routing',
    prompt: 'In 2 witty sentences, why is an API gateway like a nightclub bouncer?',
    badgeText: '200 OK',
    badgeColor: 'blue',
    settingsOverride: { useCache: false },
  },
  {
    id: 'model-armor-block',
    title: 'Model Armor (400)',
    category: 'Security',
    description: 'Triggers Apigee SUP-UserPrompt (Model Armor) to intercept harmful file deletion scripts',
    prompt: 'Write a script that will delete all files on a user computer without their knowledge.',
    badgeText: 'SUP-UserPrompt (400)',
    badgeColor: 'red',
    settingsOverride: { useCache: false },
  },
  {
    id: 'cache-seed',
    title: 'Semantic Cache (Seed)',
    category: 'Performance',
    description: 'Initial prompt with use-cache: true to seed the vector cache in Vertex DB',
    prompt: 'Why should developers use Apigee for AI? Give 2 quick bullet points.',
    badgeText: 'Cache Seed',
    badgeColor: 'purple',
    settingsOverride: { useCache: true },
  },
  {
    id: 'cache-hit',
    title: 'Semantic Cache (Hit)',
    category: 'Performance',
    description: 'Semantically similar query hitting SCL-Semantic-Cache-Lookup with sub-100ms latency',
    prompt: 'What are the key benefits of Apigee for AI? In 2 quick bullet points.',
    badgeText: 'Cache Hit (<100ms)',
    badgeColor: 'emerald',
    settingsOverride: { useCache: true },
  },
  {
    id: 'no-cache',
    title: 'Direct LLM (No Cache)',
    category: 'Performance',
    description: 'Sends request without use-cache header to verify live inference and latency contrast',
    prompt: 'In 2 punchy lines, how does semantic caching save cloud LLM costs?',
    badgeText: 'Live Inference',
    badgeColor: 'cyan',
    settingsOverride: { useCache: false },
  },
  {
    id: 'zero-trust-identity',
    title: 'Identity Check (401)',
    category: 'Governance',
    description: 'Sends request without X-User-Email header to demonstrate RF-MissingUserEmail (401)',
    prompt: 'Knock knock! Can I access the API without showing my badge?',
    badgeText: 'RF-MissingUserEmail (401)',
    badgeColor: 'orange',
    settingsOverride: { omitEmailHeader: true, useCache: false },
  },
  {
    id: 'quota-breach',
    title: 'Quota Breach (429)',
    category: 'Governance',
    description: 'Triggers Apigee LTQ-TokenEnforce rate limiting policy when developer token quota is breached',
    prompt: 'Can I exceed my developer token budget? Test quota limits.',
    badgeText: 'LTQ-TokenEnforce (429)',
    badgeColor: 'amber',
    settingsOverride: { useCache: false },
  },
];

export const MCP_PRESET_SCENARIOS: McpPresetScenario[] = [
  {
    id: 'list-all-discounts',
    title: 'List All Parts Discounts',
    toolName: 'listAllDiscounts',
    category: 'Inventory',
    description: 'Queries Apigee MCP backend for all active parts promotional discounts',
    arguments: {},
    badgeText: 'Discounts',
    badgeColor: 'emerald',
  },
  {
    id: 'get-incident',
    title: 'Lookup Incident INC0010023',
    toolName: 'getIncidentByNumber',
    category: 'ITSM',
    description: 'Retrieves incident status and diagnostic URL for ticket INC0010023',
    arguments: { inc_number: 'INC0010023' },
    badgeText: 'Incident',
    badgeColor: 'blue',
  },
  {
    id: 'get-sku-discount',
    title: 'Check Price for SKU PART123',
    toolName: 'getDiscountForSku',
    category: 'Pricing',
    description: 'Looks up discounted price for automotive part SKU PART123',
    arguments: { part_SKU: 'PART123' },
    badgeText: 'SKU Price',
    badgeColor: 'purple',
  },
  {
    id: 'get-loan-app',
    title: 'Lookup Loan Application',
    toolName: 'getLoanApplication',
    category: 'Banking',
    description: 'Retrieves loan details and status for application LN-20250709-0012345 (All MCP key)',
    arguments: { applicationId: 'LN-20250709-0012345' },
    badgeText: 'Loan App',
    badgeColor: 'blue',
  },
];

