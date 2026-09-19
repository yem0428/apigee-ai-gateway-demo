// All endpoints below are served by the UI's own backend (`ui/server.js`) on a
// relative path, so no gateway host, project ID, or credential is embedded here.
// Credentials are resolved server-side from the Apigee Management API.

export async function fetchModelRates(env: 'dev' | 'prod' = 'prod'): Promise<{
  status: string;
  env: string;
  org: string;
  map: string;
  rates: import('../types').RateCardDictionary;
  updatedAt: string;
}> {
  const response = await fetch(`/api/kvm/rates?env=${env}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch model rates (${response.status})`);
  }
  return response.json();
}

export async function updateModelRates(env: 'dev' | 'prod', rates: import('../types').RateCardDictionary): Promise<{
  status: string;
  env: string;
  message: string;
  rates: import('../types').RateCardDictionary;
  updatedAt: string;
}> {
  const response = await fetch('/api/kvm/rates', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ env, rates }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to update model rates (${response.status})`);
  }
  return response.json();
}

export async function fetchDeveloperBalance(dev?: string): Promise<{
  status: string;
  developer: string;
  org: string;
  data: {
    wallets?: Array<{
      balance: {
        currencyCode: string;
        units: string;
        nanos: number;
      };
      lastCreditTime?: string;
    }>;
  };
}> {
  const query = dev ? `?dev=${encodeURIComponent(dev)}` : '';
  const response = await fetch(`/api/monetization/balance${query}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch developer balance (${response.status})`);
  }
  return response.json();
}

export async function creditDeveloperBalance(units: number | string, dev?: string): Promise<{
  status: string;
  developer: string;
  credited: string;
  transactionId: string;
  data: any;
}> {
  const response = await fetch('/api/monetization/credit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ units: String(units), developer: dev }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to credit developer balance (${response.status})`);
  }
  return response.json();
}

export async function fetchRatePlans(): Promise<{
  status: string;
  ratePlans: import('../types').RatePlanInfo[];
}> {
  const response = await fetch('/api/monetization/rateplans');
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch rate plans (${response.status})`);
  }
  return response.json();
}

export async function fetchDeveloperSubscriptions(dev?: string): Promise<{
  status: string;
  developer: string;
  subscriptions: import('../types').DeveloperSubscription[];
}> {
  const query = dev ? `?dev=${encodeURIComponent(dev)}` : '';
  const response = await fetch(`/api/monetization/subscriptions${query}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch developer subscriptions (${response.status})`);
  }
  return response.json();
}

export async function subscribeDeveloper(apiproduct: string, dev?: string): Promise<{
  status: string;
  data: any;
}> {
  const response = await fetch('/api/monetization/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiproduct, developer: dev }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to subscribe developer (${response.status})`);
  }
  return response.json();
}

export async function fetchDeveloperMonetizationConfig(dev?: string): Promise<{
  status: string;
  developer: string;
  config: import('../types').DeveloperMonetizationConfig;
}> {
  const query = dev ? `?dev=${encodeURIComponent(dev)}` : '';
  const response = await fetch(`/api/monetization/config${query}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch developer monetization config (${response.status})`);
  }
  return response.json();
}

export async function updateDeveloperMonetizationConfig(
  billingType: 'PREPAID' | 'POSTPAID',
  dev?: string
): Promise<{
  status: string;
  developer: string;
  config: import('../types').DeveloperMonetizationConfig;
}> {
  const response = await fetch('/api/monetization/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billingType, developer: dev }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to update developer monetization config (${response.status})`);
  }
  return response.json();
}

export interface FleetAnalyticsResponse {
  status: string;
  source: string;
  org: string;
  env: string;
  timeRange: string;
  apigeeTimeRange: string;
  metaData?: {
    notices?: string[];
  };
  kpis: {
    totalCalls: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalSpendUsd: number;
    /**
     * Both `null` when the window contains no measurable cache activity. Derived from the
     * `dc_cache_status` dimension (HIT / MISS / DISABLED); `DISABLED` and `(not set)` are
     * excluded from the denominator rather than counted as misses. Never substitute a
     * default — these were previously a hardcoded 29.4% and 35%-of-spend.
     */
    cacheCostSavingsUsd: number | null;
    cacheHitRate: number | null;
    /** Cache calls that hit, and the HIT+MISS denominator. `null` when nothing was measured. */
    cacheHitCount?: number | null;
    cacheMeasuredCalls?: number | null;
    /** `null` when the window had no traffic at all — do not substitute a default. */
    slaHealth: number | null;
    avgLatencyMs: number;
    isErrorCount: number;
    /**
     * Subset of `isErrorCount` that carries a `dc_user_email` and can therefore be broken down
     * per user. Reports 0 for time windows recorded before the proxy's `DefaultFaultRule` was
     * added, even when `isErrorCount` is non-zero.
     */
    attributedErrorCount?: number;
  };
  routing: {
    flashCalls: number;
    /** `null` when there was no traffic — there is no routing split to report. */
    flashPercent: number | null;
    proOpusCalls: number;
    proOpusPercent: number | null;
  };
  consumptionRows: import('../types').UserConsumptionRecord[];
}

export async function fetchFleetAnalytics(
  timeRange: '24h' | '7d' | '30d' = '24h',
  env: 'dev' | 'prod' = 'prod'
): Promise<FleetAnalyticsResponse> {
  const response = await fetch(`/api/analytics/fleet-stats?timeRange=${timeRange}&env=${env}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch fleet analytics (${response.status})`);
  }
  return response.json();
}

export async function fetchDeveloperAttributions(): Promise<{
  status: string;
  attributions: import('../types').UserMonetizationAttribution[];
}> {
  const response = await fetch('/api/monetization/attributions');
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch developer attributions (${response.status})`);
  }
  return response.json();
}

/** Lookback windows accepted by /api/logs/calls. */
export type CallLogWindow = '1h' | '24h' | '7d' | '30d';

/**
 * A single gateway transaction as recorded by the ML-CloudLogging policy.
 * Emitted from PostClientFlow, so blocked and failed calls appear here too --
 * those carry a non-2xx `status` and a populated `faultName`.
 */
export interface CallLogEntry {
  timestamp: string | null;
  trackingId: string;
  userEmail: string;
  model: string;
  provider: string;
  prompt: string;
  response: string;
  status: number;
  costUsd: number;
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  autoRouted: boolean;
  cached: boolean;
  latencyMs: number | null;
  faultName: string;
  errorMessage: string;
  pathSuffix: string;
  environment: string;
}

export interface CallLogsResponse {
  status: string;
  count: number;
  window: CallLogWindow;
  entries: CallLogEntry[];
  /** Deep link to the same filter in the Cloud Logging console. */
  consoleUrl: string;
}

export async function fetchCallLogs(
  userEmail: string,
  model: string,
  window: CallLogWindow = '24h'
): Promise<CallLogsResponse> {
  const params = new URLSearchParams({ user: userEmail, model, window });
  const response = await fetch(`/api/logs/calls?${params.toString()}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch call logs (${response.status})`);
  }
  return response.json();
}

