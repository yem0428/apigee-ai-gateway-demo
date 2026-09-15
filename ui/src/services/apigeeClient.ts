import { GatewaySettings, GatewayTelemetry, ChatMessage } from '../types';
import { getEnvironment, getUserInfo, USERS, DEFAULT_SSO_USER } from './defaultSettings';

export interface GenerateContentResult {
  success: boolean;
  text: string;
  telemetry: GatewayTelemetry;
  error?: string;
}

export function getGatewayTargetUrl(settings: GatewaySettings, modelOverride?: string): string {
  const envInfo = getEnvironment(settings.environment);
  const targetModel = modelOverride || settings.model || 'auto';
  if (targetModel.startsWith('claude')) {
    return envInfo.claudeUpstreamUrl || 'https://api.maloosatyam.demo.altostrat.com/v1/messages';
  }
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

  // Handle model selection and auto-routing
  let targetModel = settings.model || 'gemini-3.1-flash-lite';
  const isAuto = settings.model === 'auto';
  const isAgnosticAi = baseUrl.includes('/ai') || !baseUrl.includes('vertexai');

  // If using legacy Vertex AI proxy and auto was selected, resolve client-side
  if (isAuto && !isAgnosticAi) {
    const isComplex =
      userMessage.length > 150 ||
      /compare|architect|deep|reasoning|evaluate|analysis|trade-off|complex|multi-step/i.test(
        userMessage
      );
    targetModel = isComplex ? 'gemini-3.1-pro-preview' : 'gemini-3.1-flash-lite';
  }

  const isClaude = targetModel.startsWith('claude');
  let endpointUrl = '';
  let requestBody: any = null;

  if (isClaude) {
    if (settings.environment === 'custom') {
      endpointUrl = `${baseUrl}/models/${targetModel}:generateContent`;
    } else {
      const envInfo = getEnvironment(settings.environment);
      const claudeBase = envInfo.claudeProxyPath || '/api/claude-prod';
      endpointUrl = `${claudeBase}/models/${targetModel}:generateContent`;
    }
    requestBody = {
      model: targetModel,
      max_tokens: 1024,
      messages: history
        .filter((msg) => !msg.isError && (msg.sender === 'user' || msg.sender === 'agent'))
        .map((msg) => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text,
        })),
    };
    requestBody.messages.push({
      role: 'user',
      content: userMessage,
    });
  } else {
    endpointUrl = (isAuto && isAgnosticAi)
      ? `${baseUrl}/auto`
      : isAgnosticAi
      ? `${baseUrl}/models/${targetModel}:generateContent`
      : `${baseUrl}/v1/projects/${settings.projectId || 'bap-apac-demo2'}/locations/${settings.location || 'global'}/publishers/google/models/${targetModel}:generateContent`;

    // Build contents payload matching Vertex AI generateContent spec
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

    requestBody = {
      contents: contentsPayload,
    };
  }

  // Resolve active user entitlement and dynamic SSO caller email
  const userInfo = getUserInfo(settings.activeUser);
  let effectiveApiKey = settings.apiKey || userInfo.apiKey;

  if (!effectiveApiKey && typeof window !== 'undefined') {
    try {
      const meRes = await fetch('/api/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        const apiKeys = meData.apiKeys || {};
        if (apiKeys.admin || meData.apiKey) USERS.admin.apiKey = apiKeys.admin || meData.apiKey;
        if (apiKeys.sales_agent) USERS.sales_agent.apiKey = apiKeys.sales_agent;
        if (apiKeys.loans_agent) USERS.loans_agent.apiKey = apiKeys.loans_agent;
        effectiveApiKey = apiKeys[settings.activeUser] || USERS[settings.activeUser]?.apiKey || meData.apiKey || USERS.admin.apiKey;
      }
    } catch (e) {
      console.warn('[apigeeClient] Failed to auto-resolve API key from /api/me', e);
    }
  }
  if (!effectiveApiKey) {
    effectiveApiKey = USERS[settings.activeUser]?.apiKey || USERS.admin.apiKey || USERS.sales_agent.apiKey || USERS.loans_agent.apiKey;
  }

  const effectiveEmail = settings.ssoUser?.email || settings.userEmail || DEFAULT_SSO_USER.email;
  const effectiveIdToken = settings.ssoUser?.idToken || settings.idToken;

  const headersSent: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-apikey': effectiveApiKey,
  };

  // Attach caller identity headers unless intentionally omitted for 401 test scenario
  if (!settings.omitEmailHeader) {
    if (effectiveIdToken) {
      headersSent['Authorization'] = `Bearer ${effectiveIdToken}`;
    }
    if (effectiveEmail) {
      headersSent['X-User-Email'] = effectiveEmail;
    }
  }

  if (settings.useCache) {
    headersSent['use-cache'] = 'true';
  }

  if (settings.model === 'claude-opus-4-5@20251101' || settings.model === 'gemini-2.5-flash' || settings.model === 'gemini-2.0-flash') {
    headersSent['x-enforce-token-limit'] = 'true';
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
        'Request blocked by Apigee Model Armor guardrail due to potential safety violation.';
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
    let errorMessage = `Apigee Gateway returned HTTP ${responseStatus} (${responseStatusText})`;
    if (fault?.faultstring) {
      errorMessage = `[Apigee Policy Fault]: ${fault.faultstring}`;
    } else if (fault?.message) {
      errorMessage = `[Gateway Error]: ${fault.message}`;
    } else if (rawResponseBody?.message) {
      errorMessage = rawResponseBody.message;
    }

    return {
      success: false,
      text: isModelArmorBlock
        ? `🛡️ **Model Armor Guardrail Triggered**:\n${errorMessage}`
        : `⚠️ **Apigee Gateway Notification (${responseStatus})**:\n${errorMessage}`,
      telemetry,
      error: errorMessage,
    };
  } catch (networkErr: any) {
    const durationMs = Math.round(performance.now() - startTime);
    const errorMsg = networkErr.message || 'Failed to communicate with Apigee Gateway';

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
      text: `🚫 **Network Error**: Unable to reach Apigee Gateway endpoint. Details: ${errorMsg}.`,
      telemetry,
      error: errorMsg,
    };
  }
}

/**
 * Generates sufficient output tokens on Standard tier to breach
 * the 200 token/min quota, demonstrating Apigee's LTQ-TokenEnforce (HTTP 429).
 */
export async function exhaustLlmQuota(settings: GatewaySettings): Promise<void> {
  let baseUrl = '/api/ai-prod';
  if (settings.environment === 'custom') {
    baseUrl = (settings.customBaseUrl || '').replace(/\/$/, '');
  } else {
    baseUrl = getEnvironment(settings.environment).proxyPath || '/api/ai-prod';
  }

  const endpointUrl = `${baseUrl}/models/gemini-2.5-flash:generateContent`;
  const userInfo = getUserInfo(settings.activeUser);
  const effectiveApiKey = settings.apiKey || userInfo.apiKey;
  const effectiveEmail = settings.ssoUser?.email || settings.userEmail || DEFAULT_SSO_USER.email;

  const longPrompt = 'Write an exhaustive 1,500-word deep-dive technical architectural document covering distributed API rate limiting, token bucket algorithms, spike arrest, and zero-trust security governance in microservice architectures.';

  try {
    // Send 3 parallel requests with maxOutputTokens: 1 for sub-second quota exhaustion
    const payload = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: longPrompt }] }],
      generationConfig: { maxOutputTokens: 1 },
    });
    const headers = {
      'Content-Type': 'application/json',
      'x-apikey': effectiveApiKey,
      'X-User-Email': effectiveEmail,
      'x-enforce-token-limit': 'true',
    };

    await Promise.all([
      fetch(endpointUrl, { method: 'POST', headers, body: payload }),
      fetch(endpointUrl, { method: 'POST', headers, body: payload }),
      fetch(endpointUrl, { method: 'POST', headers, body: payload }),
    ]);
  } catch {
    // Ignore error if already exhausted
  }
}

