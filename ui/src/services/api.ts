import { ToolDefinition, PolicySettings } from '../types';

const AGENT_API_BASE = 'http://localhost:8000';

export async function sendMessageToAgent(
  message: string,
  policies: PolicySettings,
  history: any[] = []
): Promise<any> {
  const response = await fetch(`${AGENT_API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-apikey': 'demo-apigee-api-key',
      'x-target-model': policies.targetModel,
      'x-no-cache': policies.cachingEnabled ? 'false' : 'true',
    },
    body: JSON.stringify({
      message,
      target_model: policies.targetModel,
      history,
    }),
  });

  if (!response.ok) {
    throw new Error(`Gateway Error (${response.status}): ${response.statusText}`);
  }

  return response.json();
}

export async function fetchToolCatalog(): Promise<ToolDefinition[]> {
  const response = await fetch(`${AGENT_API_BASE}/tools/catalog`);
  if (!response.ok) {
    throw new Error('Failed to fetch tool catalog');
  }
  const data = await response.json();
  return data.tools || [];
}

export async function executeToolDirect(toolId: string, args: Record<string, any>): Promise<any> {
  const response = await fetch(`${AGENT_API_BASE}/mock/tools/v1/tools/${toolId}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-apikey': 'demo-apigee-api-key',
    },
    body: JSON.stringify({ arguments: args }),
  });
  return response.json();
}
