import React, { useState } from 'react';
import { GatewaySettings } from '../types';
import { KEY_TIERS } from '../services/defaultSettings';
import {
  Sliders,
  Zap,
  Database,
  Key,
  Code2,
  CheckCircle,
} from 'lucide-react';

interface PolicySandboxProps {
  settings: GatewaySettings;
  setSettings: React.Dispatch<React.SetStateAction<GatewaySettings>>;
}

export const PolicySandbox: React.FC<PolicySandboxProps> = ({ settings, setSettings }) => {
  const [activeXmlView, setActiveXmlView] = useState<string>('SUP-UserPrompt');

  const policyXmls: Record<string, { title: string; file: string; xml: string }> = {
    'SUP-UserPrompt': {
      title: 'Model Armor Guardrail (SUP-UserPrompt)',
      file: 'apiproxy/policies/SUP-UserPrompt.xml',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<SanitizeUserPrompt async="false" continueOnError="false" enabled="true" name="SUP-UserPrompt">
  <IgnoreUnresolvedVariables>false</IgnoreUnresolvedVariables>
  <DisplayName>SUP-UserPrompt</DisplayName>
  <ModelArmor>
    <TemplateName>projects/bap-apac-demo2/locations/asia-southeast1/templates/apigee-sanitize-user-prompt</TemplateName>
  </ModelArmor>
  <UserPromptSource>{jsonPath('$.contents[-1].parts[-1].text',request.content,true)}</UserPromptSource>
</SanitizeUserPrompt>`,
    },
    'SCL-Semantic-Cache': {
      title: 'Semantic Cache Lookup (SCL-Semantic-Cache-Lookup)',
      file: 'apiproxy/policies/SCL-Semantic-Cache-Lookup.xml',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<SemanticCacheLookup async="false" continueOnError="false" enabled="true" name="SCL-Semantic-Cache-Lookup">
  <DisplayName>SCL-Semantic-Cache-Lookup</DisplayName>
  <UserPromptSource>{jsonPath('$.contents[-1].parts[-1].text',request.content,true)}</UserPromptSource>
  <Embeddings>
    <VertexAI>
      <URL>https://asia-southeast1-aiplatform.googleapis.com/v1/projects/bap-apac-demo2/locations/asia-southeast1/publishers/google/models/text-embedding-004:predict</URL>
    </VertexAI>
  </Embeddings>
  <SimilaritySearch>
    <VertexAI>
      <URL>https://1573705641.asia-southeast1-1058667481809.vdb.vertexai.goog/v1/projects/bap-apac-demo2/locations/asia-southeast1/indexEndpoints/3889166141490200576:findNeighbors</URL>
      <DeployedIndexID>semantic_cache</DeployedIndexID>
      <Threshold>0.95</Threshold>
    </VertexAI>
  </SimilaritySearch>
</SemanticCacheLookup>`,
    },
    'LTQ-TokenEnforce': {
      title: 'Token Quota Enforcement (LTQ-TokenEnforce)',
      file: 'apiproxy/policies/LTQ-TokenEnforce.xml',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<LLMTokenQuota continueOnError="false" enabled="true" name="LTQ-TokenEnforce">
  <DisplayName>LTQ-TokenEnforce</DisplayName>
  <Allow count="1000" countRef="verifyapikey.VA-VerifyAPIKey.apiproduct.developer.llmQuota.limit"/>
  <Interval ref="verifyapikey.VA-VerifyAPIKey.apiproduct.developer.llmQuota.interval">1</Interval>
  <TimeUnit ref="verifyapikey.VA-VerifyAPIKey.apiproduct.developer.llmQuota.timeunit">minute</TimeUnit>
  <Distributed>true</Distributed>
  <Synchronous>true</Synchronous>
  <LLMModelSource>{flow.model}</LLMModelSource>
  <EnforceOnly>true</EnforceOnly>
  <SharedName>common-counter</SharedName>
</LLMTokenQuota>`,
    },
    'VA-VerifyAPIKey': {
      title: 'API Key Verification (VA-VerifyAPIKey)',
      file: 'apiproxy/policies/VA-VerifyAPIKey.xml',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<VerifyAPIKey continueOnError="false" enabled="true" name="VA-VerifyAPIKey">
  <DisplayName>VA-VerifyAPIKey</DisplayName>
  <Properties/>
  <APIKey ref="request.header.x-apikey"/>
</VerifyAPIKey>`,
    },
    'DC-ModelAnalytics': {
      title: 'Data Capture & Model Analytics (DC-ModelAnalytics)',
      file: 'apiproxy/policies/DC-ModelAnalytics.xml',
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<DataCapture name="DC-ModelAnalytics" continueOnError="false" enabled="true">
  <DisplayName>DC-ModelAnalytics</DisplayName>
  <Capture>
    <Collect ref="flow.emailId" default=""/>
    <DataCollector>dc_user_email</DataCollector>
  </Capture>
  <Capture>
    <Collect ref="flow.model" default=""/>
    <DataCollector>dc_model_name</DataCollector>
  </Capture>
  <Capture>
    <Collect ref="flow.candidatesTokenCount" default="0"/>
    <DataCollector>dc_candidates_token_count</DataCollector>
  </Capture>
  <Capture>
    <Collect ref="flow.promptTokenCount" default="0"/>
    <DataCollector>dc_prompt_token_count</DataCollector>
  </Capture>
  <Capture>
    <Collect ref="flow.totalTokenCount" default="0"/>
    <DataCollector>dc_total_token_count</DataCollector>
  </Capture>
</DataCapture>`,
    },
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-400" />
            Apigee AI Gateway Policy Architecture
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Explore live Apigee X policies governing Vertex AI: Model Armor Guardrails, Semantic Vector Cache, LLM Token Quotas, and Analytics.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
            Active Env: <strong className="text-blue-400 uppercase">{settings.environment}</strong>
          </span>
        </div>
      </div>

      {/* Grid: Policy Controls & Policy Visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 1 Column: Interactive Policy Toggles */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Live Gateway Controls
          </h3>

          {/* Model Selection */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-white font-semibold text-xs">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Dynamic Model Routing</span>
            </div>

            <div className="space-y-2">
              <label
                onClick={() => setSettings((prev) => ({ ...prev, model: 'gemini-3.1-flash-lite' }))}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer text-xs transition ${
                  settings.model === 'gemini-3.1-flash-lite'
                    ? 'bg-amber-950/40 border-amber-500 text-white'
                    : 'bg-slate-900/60 border-slate-700 text-slate-400'
                }`}
              >
                <div className="flex-1">
                  <div className="font-semibold text-slate-200">Gemini 3.1 Flash Lite</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">High-speed, cost-optimized for high RPS</div>
                </div>
              </label>

              <label
                onClick={() => setSettings((prev) => ({ ...prev, model: 'gemini-3.1-pro-preview' }))}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer text-xs transition ${
                  settings.model === 'gemini-3.1-pro-preview'
                    ? 'bg-amber-950/40 border-amber-500 text-white'
                    : 'bg-slate-900/60 border-slate-700 text-slate-400'
                }`}
              >
                <div className="flex-1">
                  <div className="font-semibold text-slate-200">Gemini 3.1 Pro Preview</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Complex reasoning and structured analysis</div>
                </div>
              </label>
            </div>
          </div>

          {/* Semantic Caching Policy Toggle */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-white font-semibold text-xs">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Semantic Vector Cache</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  settings.useCache ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'
                }`}
              >
                {settings.useCache ? 'ON' : 'OFF'}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              When active, Apigee sends prompt embeddings to Vertex AI Vector Search to serve sub-100ms cached answers.
            </p>

            <button
              onClick={() => setSettings((prev) => ({ ...prev, useCache: !prev.useCache }))}
              className={`w-full py-2 rounded-lg text-xs font-medium border transition ${
                settings.useCache
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                  : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              {settings.useCache ? 'Disable Semantic Cache' : 'Enable Semantic Cache'}
            </button>
          </div>

          {/* Key Tier Selection */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-white font-semibold text-xs">
              <Key className="w-4 h-4 text-cyan-400" />
              <span>Developer Product & Quotas</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    keyTier: 'bronze',
                    apiKey: KEY_TIERS.bronze.key,
                  }))
                }
                className={`p-2.5 rounded-lg border text-left transition text-xs ${
                  settings.keyTier === 'bronze'
                    ? 'bg-cyan-950/50 border-cyan-500 text-white'
                    : 'bg-slate-900/60 border-slate-700 text-slate-400'
                }`}
              >
                <div className="font-bold">Bronze Tier</div>
                <div className="text-[10px] mt-0.5 opacity-75">Standard Limit</div>
              </button>

              <button
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    keyTier: 'silver',
                    apiKey: KEY_TIERS.silver.key,
                  }))
                }
                className={`p-2.5 rounded-lg border text-left transition text-xs ${
                  settings.keyTier === 'silver'
                    ? 'bg-cyan-950/50 border-cyan-500 text-white'
                    : 'bg-slate-900/60 border-slate-700 text-slate-400'
                }`}
              >
                <div className="font-bold">Silver Tier</div>
                <div className="text-[10px] mt-0.5 opacity-75">High Volume</div>
              </button>
            </div>
          </div>
        </div>

        {/* Right 2 Columns: Live Apigee XML Policy Inspector */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Code2 className="w-4 h-4 text-blue-400" />
              <span>Apigee X Policy Definitions</span>
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">
              Bundle: vertex-ai-v1
            </span>
          </div>

          {/* Policy Selector Buttons */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(policyXmls).map(([key]) => (
              <button
                key={key}
                onClick={() => setActiveXmlView(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition ${
                  activeXmlView === key
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-800/80 border border-slate-700/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                {key}
              </button>
            ))}
          </div>

          {/* Policy Detail Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="px-4 py-3 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-200 text-xs">
                  {policyXmls[activeXmlView]?.title}
                </span>
                <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                  {policyXmls[activeXmlView]?.file}
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle className="w-3 h-3" />
                Deployed
              </span>
            </div>

            <pre className="p-4 overflow-x-auto text-[11px] font-mono text-slate-300 leading-relaxed bg-slate-950/90">
              {policyXmls[activeXmlView]?.xml}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
