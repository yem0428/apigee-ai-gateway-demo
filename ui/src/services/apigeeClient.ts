import { GatewaySettings, GatewayTelemetry, ChatMessage } from '../types';
import { getEnvironment, getUserInfo, DEFAULT_SSO_USER } from './defaultSettings';

export interface GenerateContentResult {
  success: boolean;
  text: string;
  telemetry: GatewayTelemetry;
  error?: string;
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
    baseUrl = envInfo.proxyPath || '/api/vertexai-dev';
  }

  // Handle 'auto' intelligent model routing
  let targetModel = settings.model || 'gemini-3.1-flash-lite';
  const isAuto = settings.model === 'auto';
  if (isAuto) {
    const isComplex =
      userMessage.length > 150 ||
      /compare|architect|deep|reasoning|evaluate|analysis|trade-off|complex|multi-step/i.test(
        userMessage
      );
    targetModel = isComplex ? 'gemini-3.1-pro-preview' : 'gemini-3.1-flash-lite';
  }

  const endpointUrl = `${baseUrl}/v1/projects/${settings.projectId || 'bap-apac-demo2'}/locations/${settings.location || 'global'}/publishers/google/models/${targetModel}:generateContent`;

  // Resolve active user entitlement and dynamic SSO caller email
  const userInfo = getUserInfo(settings.activeUser);
  const effectiveApiKey = settings.apiKey || userInfo.apiKey;
  const effectiveEmail = settings.ssoUser?.email || settings.userEmail || DEFAULT_SSO_USER.email;

  const headersSent: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-apikey': effectiveApiKey,
    'X-User-Email': effectiveEmail,
  };

  if (settings.omitEmailHeader) {
    delete headersSent['X-User-Email'];
  }

  if (settings.useCache) {
    headersSent['use-cache'] = 'true';
  }

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

  const requestBody = {
    contents: contentsPayload,
  };

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

    // Check token counts
    const usage = rawResponseBody?.usageMetadata || {};
    const promptTokens = usage.promptTokenCount;
    const candidatesTokens = usage.candidatesTokenCount;
    const totalTokens = usage.totalTokenCount;

    // Determine cache status
    let cacheStatus: 'HIT' | 'MISS' | 'DISABLED' = 'DISABLED';
    if (settings.useCache) {
      if (headersReceived['x-gateway-cached'] === 'true' || headersReceived['x-cache'] === 'HIT' || durationMs < 160) {
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
        'Request blocked by Apigee SUP-UserPrompt (Model Armor) policy due to potential safety violation.';
    } else if (responseStatus >= 200 && responseStatus < 300) {
      guardrailStatus = 'PASSED';
    }

    // Extract text from Vertex AI candidates
    let assistantText = '';
    const candidates = rawResponseBody?.candidates;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const parts = candidates[0]?.content?.parts;
      if (Array.isArray(parts)) {
        assistantText = parts.map((p: any) => p.text || '').join('\n');
      }
    }

    const telemetry: GatewayTelemetry = {
      status: responseStatus,
      statusText: responseStatusText || (responseStatus === 200 ? 'OK' : 'Error'),
      endpointUrl,
      model: targetModel,
      requestedModel: settings.model,
      autoRouted: isAuto,
      environment: settings.environment,
      user: userInfo.name,
      userEmail: effectiveEmail,
      ssoUser: settings.ssoUser || DEFAULT_SSO_USER,
      latencyMs: durationMs,
      promptTokens,
      candidatesTokens,
      totalTokens,
      cacheStatus,
      guardrailStatus,
      guardrailMessage,
      headersSent,
      headersReceived,
      rawRequest: requestBody,
      rawResponse: rawResponseBody,
      // Backwards compatibility aliases
      'x-gateway-model': targetModel,
      'x-prompt-tokens': promptTokens ? String(promptTokens) : undefined,
      'x-candidate-tokens': candidatesTokens ? String(candidatesTokens) : undefined,
      'x-total-tokens': totalTokens ? String(totalTokens) : undefined,
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
