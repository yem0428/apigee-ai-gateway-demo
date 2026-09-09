import { GatewaySettings, McpTool, McpRpcRequest, McpRpcResponse, McpTelemetry } from '../types';
import { getEnvironment, getUserInfo, DEFAULT_SSO_USER } from './defaultSettings';

/**
 * Resolves the target MCP endpoint for the current environment.
 */
export function resolveMcpEndpoint(settings: GatewaySettings): {
  requestUrl: string;
  displayEndpoint: string;
} {
  if (settings.environment === 'custom' && settings.customBaseUrl) {
    const clean = settings.customBaseUrl.replace(/\/+$/, '');
    const url = clean.endsWith('/mcp') ? clean : `${clean}/mcp`;
    return { requestUrl: url, displayEndpoint: url };
  }

  const envInfo = getEnvironment(settings.environment);
  return {
    requestUrl: envInfo.mcpProxyPath,
    displayEndpoint: envInfo.mcpUpstreamUrl,
  };
}

/**
 * Builds standard headers sent to the Apigee MCP Gateway.
 */
function buildMcpHeaders(settings: GatewaySettings): Record<string, string> {
  const userInfo = getUserInfo(settings.activeUser);
  const effectiveApiKey = settings.apiKey || userInfo.apiKey;
  const effectiveEmail = settings.ssoUser?.email || settings.userEmail || DEFAULT_SSO_USER.email;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-apikey': effectiveApiKey,
  };

  if (!settings.omitEmailHeader && effectiveEmail) {
    headers['X-User-Email'] = effectiveEmail;
  }

  return headers;
}

/**
 * Extracts relevant response headers for telemetry and audit tracing.
 */
function extractResponseHeaders(res: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  const trackKeys = [
    'content-type',
    'x-request-id',
    'x-cloud-trace-context',
    'x-b3-traceid',
    'x-b3-spanid',
    'date',
    'server',
    'via',
    'x-powered-by',
  ];

  trackKeys.forEach((key) => {
    const val = res.headers.get(key);
    if (val) {
      headers[key] = val;
    }
  });

  return headers;
}

/**
 * Discovers available tools from Apigee native MCP proxy via JSON-RPC tools/list.
 */
export async function listMcpTools(settings: GatewaySettings): Promise<{
  tools: McpTool[];
  telemetry: McpTelemetry;
}> {
  const { requestUrl, displayEndpoint } = resolveMcpEndpoint(settings);
  const headersSent = buildMcpHeaders(settings);

  const rpcRequest: McpRpcRequest = {
    jsonrpc: '2.0',
    method: 'tools/list',
    id: Date.now(),
    params: {},
  };

  const startTime = performance.now();
  let status = 0;
  let statusText = '';
  let headersReceived: Record<string, string> = {};
  let rawResponse: any = null;

  try {
    const res = await fetch(requestUrl, {
      method: 'POST',
      headers: headersSent,
      body: JSON.stringify(rpcRequest),
    });

    const latencyMs = Math.round(performance.now() - startTime);
    status = res.status;
    statusText = res.statusText;
    headersReceived = extractResponseHeaders(res);

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      rawResponse = (await res.json()) as McpRpcResponse;
    } else {
      const text = await res.text();
      rawResponse = { text };
    }

    const tools: McpTool[] = rawResponse?.result?.tools || [];

    const telemetry: McpTelemetry = {
      status,
      statusText: statusText || (status === 200 ? 'OK' : 'Error'),
      endpointUrl: displayEndpoint,
      method: 'tools/list',
      latencyMs,
      headersSent,
      headersReceived,
      rawRequest: rpcRequest,
      rawResponse,
      policyTrace: {
        ppMcp: status !== 400,
        vaVerifyApiKey: status !== 401,
        qLimit: status !== 429,
        mlCloudLogging: true,
      },
      userEmail: headersSent['X-User-Email'],
      ssoUser: settings.ssoUser,
      keyTier: settings.keyTier,
      activeUser: settings.activeUser,
    };

    return { tools, telemetry };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    const errorResponse = {
      jsonrpc: '2.0' as const,
      id: rpcRequest.id,
      error: {
        code: -32603,
        message: err.message || 'Network or Gateway Connection Error',
      },
    };

    const telemetry: McpTelemetry = {
      status: 500,
      statusText: 'Gateway Unreachable',
      endpointUrl: displayEndpoint,
      method: 'tools/list',
      latencyMs,
      headersSent,
      headersReceived: {},
      rawRequest: rpcRequest,
      rawResponse: errorResponse,
      policyTrace: {
        ppMcp: false,
        vaVerifyApiKey: false,
        qLimit: false,
        mlCloudLogging: false,
      },
      userEmail: headersSent['X-User-Email'],
      ssoUser: settings.ssoUser,
      keyTier: settings.keyTier,
      activeUser: settings.activeUser,
    };

    return { tools: [], telemetry };
  }
}

/**
 * Executes a tool on Apigee native MCP proxy via JSON-RPC tools/call.
 */
export async function callMcpTool(
  settings: GatewaySettings,
  toolName: string,
  args: Record<string, any>
): Promise<{
  result: any;
  telemetry: McpTelemetry;
}> {
  const { requestUrl, displayEndpoint } = resolveMcpEndpoint(settings);
  const headersSent = buildMcpHeaders(settings);

  const rpcRequest: McpRpcRequest = {
    jsonrpc: '2.0',
    method: 'tools/call',
    id: Date.now(),
    params: {
      name: toolName,
      arguments: args,
    },
  };

  const startTime = performance.now();
  let status = 0;
  let statusText = '';
  let headersReceived: Record<string, string> = {};
  let rawResponse: any = null;

  try {
    const res = await fetch(requestUrl, {
      method: 'POST',
      headers: headersSent,
      body: JSON.stringify(rpcRequest),
    });

    const latencyMs = Math.round(performance.now() - startTime);
    status = res.status;
    statusText = res.statusText;
    headersReceived = extractResponseHeaders(res);

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      rawResponse = (await res.json()) as McpRpcResponse;
    } else {
      const text = await res.text();
      rawResponse = { text };
    }

    const telemetry: McpTelemetry = {
      status,
      statusText: statusText || (status === 200 ? 'OK' : status === 429 ? 'Quota Exceeded' : 'Error'),
      endpointUrl: displayEndpoint,
      method: `tools/call (${toolName})`,
      latencyMs,
      headersSent,
      headersReceived,
      rawRequest: rpcRequest,
      rawResponse,
      policyTrace: {
        ppMcp: status !== 400,
        vaVerifyApiKey: status !== 401,
        qLimit: status !== 429,
        mlCloudLogging: true,
      },
      userEmail: headersSent['X-User-Email'],
      ssoUser: settings.ssoUser,
      keyTier: settings.keyTier,
      activeUser: settings.activeUser,
    };

    return {
      result: rawResponse?.result || rawResponse?.error || rawResponse,
      telemetry,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    const errorResponse = {
      jsonrpc: '2.0' as const,
      id: rpcRequest.id,
      error: {
        code: -32603,
        message: err.message || 'Execution Failed: Gateway Unreachable',
      },
    };

    const telemetry: McpTelemetry = {
      status: 500,
      statusText: 'Gateway Unreachable',
      endpointUrl: displayEndpoint,
      method: `tools/call (${toolName})`,
      latencyMs,
      headersSent,
      headersReceived: {},
      rawRequest: rpcRequest,
      rawResponse: errorResponse,
      policyTrace: {
        ppMcp: false,
        vaVerifyApiKey: false,
        qLimit: false,
        mlCloudLogging: false,
      },
      userEmail: headersSent['X-User-Email'],
      ssoUser: settings.ssoUser,
      keyTier: settings.keyTier,
      activeUser: settings.activeUser,
    };

    return {
      result: errorResponse,
      telemetry,
    };
  }
}
