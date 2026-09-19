import { GatewaySettings, GatewayTelemetry, ChatMessage } from '../types';
import { getEnvironment, getUserInfo, USERS, DEFAULT_SSO_USER } from './defaultSettings';

export interface GenerateContentResult {
  success: boolean;
  text: string;
  telemetry: GatewayTelemetry;
  error?: string;
}

// The gateway exposes a single surface for every model and provider:
//   /ai/v1/auto                              -> intelligent auto-routing
//   /ai/v1/models/{model}:generateContent    -> direct model execution
// Anthropic models are reached through the same path; the gateway translates
// the request and the response, so callers never speak the Anthropic wire format.
export function getGatewayTargetUrl(settings: GatewaySettings, modelOverride?: string): string {
  const envInfo = getEnvironment(settings.environment);
  const targetModel = modelOverride || settings.model || 'auto';
  const base = envInfo.upstreamUrl || 'https://api.maloosatyam.demo.altostrat.com/ai/v1';
  if (targetModel === 'auto') {
    return `${base}/auto`;
  }
  return `${base}/models/${targetModel}:generateContent`;
}

export async function sendPromptToApigee(
  userMessage: string,
  settings: GatewaySettings,
  history: ChatMessage[] = []
): Promise<GenerateContentResult> {
  const startTime = performance.now();

  // Determine base URL (via Vite proxy or direct custom) with safe fallback
  let baseUrl = '';
  if (settings.environment === 'custom') {
    baseUrl = (settings.customBaseUrl || '').replace(/\/$/, '');
  } else {
    const envInfo = getEnvironment(settings.environment);
    baseUrl = envInfo.proxyPath || '/api/ai-prod';
  }

  // Model selection. Every model resolves to the same two-path surface, so there
  // is no provider-specific endpoint or wire format to special-case here.
  const targetModel = settings.model || 'gemini-3.1-flash-lite';
  const isAuto = settings.model === 'auto';

  const endpointUrl = isAuto
    ? `${baseUrl}/auto`
    : `${baseUrl}/models/${targetModel}:generateContent`;

  // Canonical request body: the Vertex AI generateContent `contents` shape.
  // For Anthropic models the gateway converts this to the Claude messages
  // format on the way out and converts the reply back on the way in.
  const contentsPayload = history
    .filter((msg) => !msg.isError && (msg.sender === 'user' || msg.sender === 'agent'))
    .map((msg) => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));

  contentsPayload.push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  const requestBody: any = {
    contents: contentsPayload,
  };

  // Resolve active user entitlement and dynamic SSO caller email
  const userInfo = getUserInfo(settings.activeUser);

  // A named persona must resolve to its OWN key and nothing else.
  // settings.apiKey is sticky session state that is pinned to the admin key at
  // load (App.tsx), so preferring it here would make the persona selector
  // cosmetic and silently send Enterprise credentials as any persona.
  const isNamedPersona = !!settings.activeUser && settings.activeUser in USERS;
  let effectiveApiKey = isNamedPersona ? userInfo.apiKey : (settings.apiKey || userInfo.apiKey);

  if (!effectiveApiKey && typeof window !== 'undefined') {
    try {
      const meRes = await fetch('/api/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        const apiKeys = meData.apiKeys || {};
        if (apiKeys.admin || meData.apiKey) USERS.admin.apiKey = apiKeys.admin || meData.apiKey;
        if (apiKeys.sales_agent) USERS.sales_agent.apiKey = apiKeys.sales_agent;
        if (apiKeys.loans_agent) USERS.loans_agent.apiKey = apiKeys.loans_agent;
        // Resolve strictly within the active persona. Falling through to
        // meData.apiKey or the admin key here would re-introduce the escalation.
        effectiveApiKey = isNamedPersona
          ? (apiKeys[settings.activeUser] || USERS[settings.activeUser]?.apiKey || '')
          : (apiKeys[settings.activeUser] || meData.apiKey || USERS.admin.apiKey);
      }
    } catch (e) {
      console.warn('[apigeeClient] Failed to auto-resolve API key from /api/me', e);
    }
  }
  if (!effectiveApiKey && !isNamedPersona) {
    effectiveApiKey = USERS.admin.apiKey || '';
  }
  if (!effectiveApiKey) {
    // Deliberately send no key rather than borrowing another persona's.
    // The gateway will reject with 401, which is the correct, visible outcome.
    console.warn(
      `[apigeeClient] No API key resolved for persona "${settings.activeUser}". ` +
      'Sending request without x-apikey; expect HTTP 401.'
    );
  }

  const effectiveEmail = settings.ssoUser?.email || settings.userEmail || DEFAULT_SSO_USER.email;
  const effectiveIdToken = settings.ssoUser?.idToken || settings.idToken;

  const headersSent: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-apikey': effectiveApiKey,
  };

  // Attach caller identity unless intentionally omitted for the 401 test scenario.
  //
  // The gateway resolves identity solely from the JWT `email` claim
  // (EV-ExtractBearerToken -> DJWT-ExtractUserIdentity -> AM-SetUserIdentity).
  // The old X-User-Email fallback was removed from the proxy, so the token is
  // now the only identity we send. `/api/me` always supplies one.
  if (!settings.omitEmailHeader && effectiveIdToken) {
    headersSent['Authorization'] = `Bearer ${effectiveIdToken}`;
  }

  if (settings.useCache) {
    headersSent['use-cache'] = 'true';
  }

  let responseStatus = 0;
  let responseStatusText = '';
  const headersReceived: Record<string, string> = {};
  let rawResponseBody: any = null;

  try {
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: headersSent,
      body: JSON.stringify(requestBody),
    });

    responseStatus = res.status;
    responseStatusText = res.statusText;

    // Capture response headers
    res.headers.forEach((val, key) => {
      headersReceived[key.toLowerCase()] = val;
    });

    const responseText = await res.text();
    try {
      rawResponseBody = JSON.parse(responseText);
    } catch {
      rawResponseBody = { raw: responseText };
    }

    const durationMs = Math.round(performance.now() - startTime);

    // Analyze Apigee Model Armor / Fault response
    const fault = rawResponseBody?.fault || rawResponseBody?.error;
    const isModelArmorBlock =
      responseStatus === 400 &&
      (JSON.stringify(rawResponseBody).toLowerCase().includes('model armor') ||
        JSON.stringify(rawResponseBody).toLowerCase().includes('sanitize') ||
        JSON.stringify(rawResponseBody).toLowerCase().includes('blocked') ||
        JSON.stringify(rawResponseBody).toLowerCase().includes('sup-userprompt'));

    // Check token counts (Vertex AI, Anthropic Claude, or OpenAI format)
    const usage = rawResponseBody?.usageMetadata || rawResponseBody?.usage || {};
    const promptTokens = usage.promptTokenCount ?? usage.input_tokens ?? usage.prompt_tokens;
    const candidatesTokens = usage.candidatesTokenCount ?? usage.output_tokens ?? usage.completion_tokens;
    const totalTokens = usage.totalTokenCount ?? usage.total_tokens ?? ((promptTokens || 0) + (candidatesTokens || 0));

    // Determine cache status from Apigee response headers
    let cacheStatus: 'HIT' | 'MISS' | 'DISABLED' = 'DISABLED';
    if (headersReceived['x-gateway-cache-status']) {
      cacheStatus = headersReceived['x-gateway-cache-status'] as 'HIT' | 'MISS' | 'DISABLED';
    } else if (settings.useCache) {
      if (headersReceived['x-gateway-cached'] === 'true') {
        cacheStatus = 'HIT';
      } else {
        cacheStatus = 'MISS';
      }
    }

    // Determine guardrail status
    let guardrailStatus: 'PASSED' | 'BLOCKED' | 'FLAGGED' | 'NONE' = 'NONE';
    let guardrailMessage: string | undefined = undefined;

    if (isModelArmorBlock) {
      guardrailStatus = 'BLOCKED';
      guardrailMessage =
        fault?.faultstring ||
        fault?.message ||
        'Request blocked by Model Armor guardrail due to potential safety violation.';
    } else if (responseStatus >= 200 && responseStatus < 300) {
      guardrailStatus = 'PASSED';
    }

    // Extract text from Vertex AI candidates, Claude content, or OpenAI choices
    let assistantText = '';
    const candidates = rawResponseBody?.candidates;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const parts = candidates[0]?.content?.parts;
      if (Array.isArray(parts)) {
        assistantText = parts.map((p: any) => p.text || '').join('\n');
      }
    } else if (Array.isArray(rawResponseBody?.content)) {
      assistantText = rawResponseBody.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text || '')
        .join('\n');
    } else if (typeof rawResponseBody?.content === 'string') {
      assistantText = rawResponseBody.content;
    } else if (Array.isArray(rawResponseBody?.choices)) {
      assistantText = rawResponseBody.choices.map((c: any) => c.message?.content || '').join('\n');
    }

    const effectivePromptTokens = promptTokens ?? (headersReceived['x-gateway-prompt-tokens'] ? parseInt(headersReceived['x-gateway-prompt-tokens'], 10) : undefined);
    const effectiveCandidatesTokens = candidatesTokens ?? (headersReceived['x-gateway-completion-tokens'] ? parseInt(headersReceived['x-gateway-completion-tokens'], 10) : undefined);
    const effectiveTotalTokens = totalTokens ?? (headersReceived['x-gateway-total-tokens'] ? parseInt(headersReceived['x-gateway-total-tokens'], 10) : undefined);
    const effectiveProvider = headersReceived['x-gateway-provider'] || (targetModel.startsWith('claude') ? 'anthropic' : 'google');
    const effectiveCostUsd = headersReceived['x-gateway-cost-usd'] || (effectiveTotalTokens ? ((effectiveTotalTokens / 1000000) * 0.20).toFixed(6) : '0.000000');
    const effectiveCostTier = headersReceived['x-gateway-cost-tier'] || (targetModel.includes('pro') || targetModel.includes('opus') ? 'high' : targetModel.includes('flash-lite') ? 'low' : 'medium');
    const effectiveCategory = headersReceived['x-gateway-category'] || headersReceived['x-gateway-intent'];
    let effectiveIntent: string | undefined = effectiveCategory;
    if (!effectiveIntent && (headersReceived['x-auto-routed'] === 'true' || isAuto)) {
      if (targetModel.includes('flash') || (headersReceived['x-gateway-model'] && headersReceived['x-gateway-model'].includes('flash'))) {
        effectiveIntent = 'General / Fast';
      } else if (targetModel.includes('pro') || (headersReceived['x-gateway-model'] && headersReceived['x-gateway-model'].includes('pro'))) {
        effectiveIntent = 'Deep Reasoning';
      } else if (targetModel.includes('claude') || targetModel.includes('opus') || (headersReceived['x-gateway-model'] && (headersReceived['x-gateway-model'].includes('claude') || headersReceived['x-gateway-model'].includes('opus')))) {
        effectiveIntent = 'Coding';
      } else {
        effectiveIntent = 'General / Fast';
      }
    }

    // Record real-time session wallet debit so Start Balance -> Remaining chains continuously across requests
    if (responseStatus >= 200 && responseStatus < 300) {
      const amountToDebit = cacheStatus === 'HIT' ? 0 : parseFloat(effectiveCostUsd || '0');
      const rawApigeeBal = parseFloat(headersReceived['x-gateway-prepaid-balance'] || '110');
      try {
        const debitRes = await fetch('/api/monetization/debit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            developer: effectiveEmail,
            amountUsd: isNaN(amountToDebit) ? 0 : amountToDebit,
            rawApigeeBalanceUsd: isNaN(rawApigeeBal) ? 110 : rawApigeeBal,
          }),
        });
        if (debitRes.ok) {
          const debitData = await debitRes.json();
          if (typeof debitData.startBalanceUsd === 'number' && typeof debitData.remainingBalanceUsd === 'number') {
            headersReceived['x-gateway-prepaid-balance'] = debitData.startBalanceUsd.toFixed(6);
            headersReceived['x-gateway-balance-remaining'] = debitData.remainingBalanceUsd.toFixed(6);
          }
        }
      } catch {
        // Fallback if backend debit ledger unreachable
      }
    }

    const telemetry: GatewayTelemetry = {
      status: responseStatus,
      statusText: responseStatusText || (responseStatus === 200 ? 'OK' : 'Error'),
      endpointUrl,
      targetUrl: getGatewayTargetUrl(settings, targetModel),
      model: headersReceived['x-gateway-model'] || targetModel,
      requestedModel: settings.model,
      autoRouted: headersReceived['x-auto-routed'] === 'true' || isAuto,
      intent: effectiveIntent,
      environment: settings.environment,
      user: userInfo.name,
      userEmail: effectiveEmail,
      ssoUser: settings.ssoUser || DEFAULT_SSO_USER,
      latencyMs: durationMs,
      promptTokens: effectivePromptTokens,
      candidatesTokens: effectiveCandidatesTokens,
      totalTokens: effectiveTotalTokens,
      provider: effectiveProvider,
      costUsd: effectiveCostUsd,
      costTier: effectiveCostTier,
      cacheStatus,
      guardrailStatus,
      guardrailMessage,
      headersSent,
      headersReceived,
      rawRequest: requestBody,
      rawResponse: rawResponseBody,
      // Backwards compatibility aliases
      'x-gateway-model': headersReceived['x-gateway-model'] || targetModel,
      'x-gateway-provider': effectiveProvider,
      'x-auto-routed': headersReceived['x-auto-routed'] || (isAuto ? 'true' : 'false'),
      'x-gateway-cost-usd': effectiveCostUsd,
      'x-gateway-cost-tier': effectiveCostTier,
      'x-prompt-tokens': effectivePromptTokens ? String(effectivePromptTokens) : undefined,
      'x-candidate-tokens': effectiveCandidatesTokens ? String(effectiveCandidatesTokens) : undefined,
      'x-total-tokens': effectiveTotalTokens ? String(effectiveTotalTokens) : undefined,
      'x-gateway-cached': cacheStatus === 'HIT' ? 'true' : 'false',
      'x-gateway-latency-ms': String(durationMs),
      total_e2e_latency_ms: durationMs,
    };

    if (res.ok && assistantText) {
      return {
        success: true,
        text: assistantText,
        telemetry,
      };
    }

    // Handle fault cases (e.g. RF-MissingUserEmail, Model Armor, Invalid API Key)
    let errorMessage = `Gateway returned HTTP ${responseStatus} (${responseStatusText})`;
    if (fault?.faultstring) {
      errorMessage = `[Gateway Policy Fault]: ${fault.faultstring}`;
    } else if (fault?.message) {
      errorMessage = `[Gateway Error]: ${fault.message}`;
    } else if (rawResponseBody?.message) {
      errorMessage = rawResponseBody.message;
    }

    return {
      success: false,
      text: isModelArmorBlock
        ? `🛡️ **Model Armor Guardrail Triggered**:\n${errorMessage}`
        : `⚠️ **Gateway Notification (${responseStatus})**:\n${errorMessage}`,
      telemetry,
      error: errorMessage,
    };
  } catch (networkErr: any) {
    const durationMs = Math.round(performance.now() - startTime);
    const errorMsg = networkErr.message || 'Failed to communicate with the Gateway';

    const telemetry: GatewayTelemetry = {
      status: 0,
      statusText: 'Network / Connection Failure',
      endpointUrl,
      targetUrl: getGatewayTargetUrl(settings, settings.model),
      model: settings.model,
      environment: settings.environment,
      user: userInfo.name,
      userEmail: effectiveEmail,
      ssoUser: settings.ssoUser || DEFAULT_SSO_USER,
      latencyMs: durationMs,
      cacheStatus: settings.useCache ? 'MISS' : 'DISABLED',
      guardrailStatus: 'NONE',
      headersSent,
      headersReceived,
      rawRequest: requestBody,
      rawResponse: { error: errorMsg },
      total_e2e_latency_ms: durationMs,
    };

    return {
      success: false,
      text: `🚫 **Network Error**: Unable to reach the Gateway endpoint. Details: ${errorMsg}.`,
      telemetry,
      error: errorMsg,
    };
  }
}

/**
 * Generates enough output tokens to breach the per-minute LLM token quota that
 * the caller's API product defines, demonstrating LTQ-TokenEnforce (HTTP 429).
 */
export async function exhaustLlmQuota(settings: GatewaySettings): Promise<void> {
  let baseUrl = '/api/ai-prod';
  if (settings.environment === 'custom') {
    baseUrl = (settings.customBaseUrl || '').replace(/\/$/, '');
  } else {
    baseUrl = getEnvironment(settings.environment).proxyPath || '/api/ai-prod';
  }

  const endpointUrl = `${baseUrl}/models/gemini-3.1-flash-lite:generateContent`;
  const userInfo = getUserInfo(settings.activeUser);
  const effectiveApiKey = settings.apiKey || userInfo.apiKey;
  const effectiveIdToken = settings.ssoUser?.idToken || settings.idToken;

  // Identity must be the JWT, same as sendPromptToApigee.
  //
  // This previously sent only `X-User-Email`. Once the proxy's header fallback was removed,
  // every call from here was rejected by RF-MissingUserEmail with a 401 — so the "exhaust the
  // LLM token quota" demo quietly stopped consuming any quota at all while still appearing to
  // fire requests.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-apikey': effectiveApiKey,
  };
  if (effectiveIdToken) {
    headers['Authorization'] = `Bearer ${effectiveIdToken}`;
  }

  try {
    await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Write a comprehensive 500-word analysis of enterprise API gateway security.' }],
          },
        ],
      }),
    });
  } catch {
    // Ignore error if already exhausted
  }
}

