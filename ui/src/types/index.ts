export type GatewayEnvironment = 'dev' | 'prod' | 'custom';
export type UserPersona = 'bronze_user' | 'silver_user' | 'sales_agent';
export type KeyTier = 'bronze' | 'silver' | 'custom';

export interface SsoUser {
  name: string;
  email: string;
  organization: string;
  provider: string;
  avatarText: string;
  isAuthenticated: boolean;
}

export interface UserInfo {
  id: UserPersona;
  name: string;
  email: string;
  apiKey: string;
  badge: string;
}

export interface GatewaySettings {
  environment: GatewayEnvironment;
  customBaseUrl: string;
  activeUser: UserPersona;
  userEmail: string;
  apiKey: string;
  ssoUser?: SsoUser;
  keyTier?: KeyTier;
  projectId: string;
  location: string;
  model: string;
  useCache: boolean;
  omitEmailHeader?: boolean;
}

export interface GatewayTelemetry {
  status: number;
  statusText: string;
  endpointUrl: string;
  model: string;
  requestedModel?: string;
  autoRouted?: boolean;
  environment: GatewayEnvironment;
  user?: string;
  userEmail?: string;
  ssoUser?: SsoUser;
  keyTier?: KeyTier;
  latencyMs: number;
  promptTokens?: number;
  candidatesTokens?: number;
  totalTokens?: number;
  cacheStatus: 'HIT' | 'MISS' | 'DISABLED';
  guardrailStatus: 'PASSED' | 'BLOCKED' | 'FLAGGED' | 'NONE';
  guardrailMessage?: string;
  headersSent: Record<string, string>;
  headersReceived: Record<string, string>;
  rawRequest: any;
  rawResponse: any;
  // Legacy aliases for backwards compatibility
  'x-gateway-model'?: string;
  'x-prompt-tokens'?: string;
  'x-candidate-tokens'?: string;
  'x-total-tokens'?: string;
  'x-pii-redacted'?: string;
  'x-gateway-cached'?: string;
  'x-gateway-latency-ms'?: string;
  total_e2e_latency_ms?: number;
}

export interface ToolTrace {
  tool: string;
  arguments: Record<string, any>;
  result: Record<string, any>;
  latency_ms: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  timestamp: string;
  model?: string;
  isError?: boolean;
  toolCalls?: ToolTrace[];
  telemetry?: GatewayTelemetry;
}

export interface ScenarioPreset {
  id: string;
  title: string;
  category: 'Overview' | 'Security' | 'Performance' | 'Routing' | 'Governance';
  prompt: string;
  description: string;
  badgeText: string;
  badgeColor: string;
  settingsOverride?: Partial<GatewaySettings>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface PolicySettings {
  targetModel: string;
  piiRedactionEnabled: boolean;
  cachingEnabled: boolean;
  rateLimitTier: string;
  simulateSpike: boolean;
}
