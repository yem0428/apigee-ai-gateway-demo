import React, { useState, useEffect } from 'react';
import {
  GatewaySettings,
  McpTool,
  McpTelemetry,
  McpPresetScenario,
} from '../types';
import { listMcpTools, callMcpTool } from '../services/mcpClient';
import { MCP_PRESET_SCENARIOS } from '../services/defaultSettings';
import { McpTraceViewer } from './McpTraceViewer';
import {
  Wrench,
  Play,
  RefreshCw,
  Layers,
  Code2,
  Terminal,
  Activity,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface McpPlaygroundProps {
  settings: GatewaySettings;
}

const DEFAULT_MCP_TOOLS: McpTool[] = [
  {
    name: 'listAllDiscounts',
    description: 'List All Discounted Parts Prices',
    inputSchema: {
      type: 'object',
      properties: {},
      $defs: {},
    },
  },
  {
    name: 'getDiscountForSku',
    description: 'Get Discount Price for a Specific Part by Part SKU',
    inputSchema: {
      type: 'object',
      properties: {
        part_SKU: {
          type: 'string',
          description: 'The SKU of the part for which discounted price is needed',
          example: 'PART123',
        },
      },
      required: ['part_SKU'],
    },
  },
];

const createInitialMcpTelemetry = (settings: GatewaySettings): McpTelemetry => ({
  status: 200,
  statusText: 'OK',
  endpointUrl: 'https://api.maloosatyam.demo.altostrat.com/mcp',
  method: 'tools/list',
  latencyMs: 182,
  headersSent: {
    'Content-Type': 'application/json',
    'x-apikey': '••••••••••••••••',
    'X-User-Email': settings.userEmail || 'maloosatyam@google.com',
  },
  headersReceived: {
    'content-type': 'application/json',
    'x-request-id': 'c21b1190-8f58-4363-881c-03090d5ac18d',
    'via': '1.1 google',
  },
  rawRequest: {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/list',
    params: {},
  },
  rawResponse: {
    id: Date.now(),
    jsonrpc: '2.0',
    result: {
      tools: DEFAULT_MCP_TOOLS,
    },
  },
  policyTrace: {
    ppMcp: true,
    vaVerifyApiKey: true,
    qLimit: true,
    mlCloudLogging: true,
  },
  userEmail: settings.userEmail || 'maloosatyam@google.com',
  activeUser: settings.activeUser || 'sales_agent',
});

export const McpPlayground: React.FC<McpPlaygroundProps> = ({
  settings,
}) => {
  const [tools, setTools] = useState<McpTool[]>(DEFAULT_MCP_TOOLS);
  const [loadingTools, setLoadingTools] = useState<boolean>(false);
  const [selectedTool, setSelectedTool] = useState<McpTool | null>(DEFAULT_MCP_TOOLS[0]);
  const [toolArgs, setToolArgs] = useState<Record<string, any>>({});
  const [rawJsonMode, setRawJsonMode] = useState<boolean>(false);
  const [rawJsonText, setRawJsonText] = useState<string>('{}');
  const [executing, setExecuting] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<McpTelemetry | null>(() => createInitialMcpTelemetry(settings));
  const [mobileTab, setMobileTab] = useState<'console' | 'trace'>('console');
  const [hasNewTrace, setHasNewTrace] = useState<boolean>(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  // Load available MCP tools on mount and when environment or active user tier changes
  useEffect(() => {
    fetchTools();
  }, [settings.environment, settings.activeUser, settings.apiKey]);

  const fetchTools = async () => {
    setLoadingTools(true);
    setStatusNotification(null);
    try {
      const { tools: loadedTools, telemetry: listTelem } = await listMcpTools(settings);
      if (loadedTools && loadedTools.length > 0) {
        setTools(loadedTools);
        setTelemetry(listTelem);
        const defaultTool = loadedTools[0];
        setSelectedTool(defaultTool);
        initToolArgs(defaultTool);
      } else if (listTelem && listTelem.status === 200) {
        setTelemetry(listTelem);
      }
    } catch (err: any) {
      console.error('Failed to discover MCP tools', err);
    } finally {
      setLoadingTools(false);
    }
  };

  const initToolArgs = (tool: McpTool) => {
    const initial: Record<string, any> = {};
    if (tool.inputSchema?.properties) {
      Object.entries(tool.inputSchema.properties).forEach(([key, prop]) => {
        if (prop.example !== undefined) {
          initial[key] = prop.example;
        } else if (prop.type === 'string') {
          initial[key] = '';
        } else if (prop.type === 'number' || prop.type === 'integer') {
          initial[key] = 0;
        } else if (prop.type === 'boolean') {
          initial[key] = false;
        }
      });
    }
    setToolArgs(initial);
    setRawJsonText(JSON.stringify(initial, null, 2));
  };

  const handleSelectTool = (tool: McpTool) => {
    setSelectedTool(tool);
    initToolArgs(tool);
    setStatusNotification(null);
  };

  const handleArgChange = (field: string, value: any) => {
    const updated = { ...toolArgs, [field]: value };
    setToolArgs(updated);
    setRawJsonText(JSON.stringify(updated, null, 2));
  };

  const handleRawJsonChange = (text: string) => {
    setRawJsonText(text);
    try {
      const parsed = JSON.parse(text);
      setToolArgs(parsed);
    } catch {
      // Allow user to continue typing invalid JSON
    }
  };

  const handleSelectPreset = (preset: McpPresetScenario) => {
    const matchingTool = tools.find((t) => t.name === preset.toolName);
    if (matchingTool) {
      setSelectedTool(matchingTool);
      setToolArgs(preset.arguments);
      setRawJsonText(JSON.stringify(preset.arguments, null, 2));
    } else {
      // Create lightweight fallback tool entry if catalog hasn't loaded yet
      setSelectedTool({
        name: preset.toolName,
        description: preset.description,
        inputSchema: { type: 'object', properties: {} },
      });
      setToolArgs(preset.arguments);
      setRawJsonText(JSON.stringify(preset.arguments, null, 2));
    }
    setStatusNotification(`Preset applied: ${preset.title}`);
  };

  const handleExecute = async () => {
    if (!selectedTool) return;
    setExecuting(true);
    setStatusNotification(null);

    let finalArgs = toolArgs;
    if (rawJsonMode) {
      try {
        finalArgs = JSON.parse(rawJsonText);
      } catch (e: any) {
        setStatusNotification(`JSON Syntax Error: ${e.message}`);
        setExecuting(false);
        return;
      }
    }

    try {
      const { telemetry: callTelem } = await callMcpTool(
        settings,
        selectedTool.name,
        finalArgs
      );
      setTelemetry(callTelem);
      setHasNewTrace(true);
    } catch (err: any) {
      console.error('Tool execution error', err);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-100/50 dark:bg-slate-950 text-slate-850 dark:text-slate-100 overflow-hidden">
      {/* Mobile Sub-Navigation Switcher (< md) */}
      <div className="md:hidden flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/90 px-3 py-1.5 shrink-0">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs w-full">
          <button
            type="button"
            onClick={() => setMobileTab('console')}
            className={`flex-1 py-1.5 px-3 rounded-lg font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              mobileTab === 'console'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Tools & Run</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileTab('trace');
              setHasNewTrace(false);
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 relative ${
              mobileTab === 'trace'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Protocol Trace</span>
            {hasNewTrace && mobileTab !== 'trace' && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* Main Dual-Pane Studio Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Tool Explorer & Execution Console */}
        <section
          className={`flex-1 flex flex-col min-w-0 border-r border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950 overflow-y-auto ${
            mobileTab === 'console' ? 'flex' : 'hidden md:flex'
          }`}
        >
          <div className="max-w-3xl w-full mx-auto p-4 sm:p-6 space-y-6">
            {/* Header / Subtitle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800/80">
              <div>
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-sm shadow-cyan-500/20 shrink-0">
                    <Terminal className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                        Native MCP Server
                      </h2>
                      <span className="inline-flex items-center text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/30 shrink-0">
                        JSON-RPC 2.0
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      Discover tools via <code className="text-cyan-700 dark:text-cyan-300 bg-cyan-100/70 dark:bg-cyan-950/50 px-1.5 py-0.5 rounded font-mono font-semibold border border-cyan-200/60 dark:border-cyan-800/40">tools/list</code> and govern tool executions via <code className="text-cyan-700 dark:text-cyan-300 bg-cyan-100/70 dark:bg-cyan-950/50 px-1.5 py-0.5 rounded font-mono font-semibold border border-cyan-200/60 dark:border-cyan-800/40">tools/call</code>.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={fetchTools}
                disabled={loadingTools}
                className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 transition cursor-pointer shadow-2xs"
                title="Refresh MCP Tool Catalog"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTools ? 'animate-spin text-cyan-600 dark:text-cyan-400' : ''}`} />
                <span>Refresh Tools</span>
              </button>
            </div>

            {/* Quick Demo Presets */}
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>Quick Scenario Presets</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {MCP_PRESET_SCENARIOS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-cyan-500 hover:bg-cyan-50/40 dark:hover:bg-slate-850 text-slate-800 dark:text-slate-200 text-xs transition cursor-pointer group shadow-2xs text-left"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        preset.badgeColor === 'emerald'
                          ? 'bg-emerald-500'
                          : preset.badgeColor === 'blue'
                          ? 'bg-blue-500'
                          : preset.badgeColor === 'purple'
                          ? 'bg-purple-500'
                          : 'bg-amber-500'
                      }`}
                    />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-cyan-700 dark:group-hover:text-cyan-300 transition">
                        {preset.title}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {preset.toolName}()
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Registered Tools List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>Discovered Tools ({tools.length})</span>
                </label>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  Path: /mcp
                </span>
              </div>

              {tools.length === 0 ? (
                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-2 shadow-xs">
                  <AlertCircle className="w-6 h-6 text-amber-500 mx-auto" />
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    No Tools Discovered Yet
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
                    Click <span className="text-cyan-600 dark:text-cyan-400 font-semibold">Refresh Tools</span> to connect to the MCP endpoint and fetch registered tools.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {tools.map((t) => {
                    const isSelected = selectedTool?.name === t.name;
                    return (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => handleSelectTool(t)}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-cyan-50/90 dark:bg-cyan-950/40 border-2 border-cyan-600 dark:border-cyan-500 text-slate-900 dark:text-white shadow-xs ring-1 ring-cyan-500/20'
                            : 'bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs'
                        }`}
                      >
                        <div>
                          <div className={`font-semibold text-xs font-mono truncate ${isSelected ? 'text-cyan-800 dark:text-cyan-300 font-bold' : 'text-slate-900 dark:text-slate-100'}`}>
                            {t.name}
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 mt-1 leading-snug">
                            {t.description}
                          </p>
                        </div>
                        <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          <span>
                            {Object.keys(t.inputSchema?.properties || {}).length} arg(s)
                          </span>
                          <ChevronRight
                            className={`w-3.5 h-3.5 ${isSelected ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400 dark:text-slate-600'}`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tool Arguments Form */}
            {selectedTool && (
              <div className="space-y-3.5 p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    <span className="font-bold text-xs text-slate-900 dark:text-slate-200">
                      Arguments for <code className="font-mono text-cyan-700 dark:text-cyan-300">{selectedTool.name}</code>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRawJsonMode(!rawJsonMode)}
                    className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition cursor-pointer font-semibold"
                  >
                    {rawJsonMode ? 'Switch to Form' : 'Edit Raw JSON'}
                  </button>
                </div>

                {rawJsonMode ? (
                  <div>
                    <textarea
                      value={rawJsonText}
                      onChange={(e) => handleRawJsonChange(e.target.value)}
                      rows={5}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 focus:bg-white"
                      placeholder="{}"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedTool.inputSchema?.properties &&
                    Object.keys(selectedTool.inputSchema.properties).length > 0 ? (
                      Object.entries(selectedTool.inputSchema.properties).map(([field, prop]) => {
                        const isRequired = selectedTool.inputSchema?.required?.includes(field);
                        return (
                          <div key={field} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <label className="font-mono font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                                {field}
                                {isRequired && <span className="text-red-500 font-bold">*</span>}
                              </label>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                {prop.type}
                              </span>
                            </div>
                            {prop.description && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                                {prop.description}
                              </p>
                            )}
                            <input
                              type={prop.type === 'number' || prop.type === 'integer' ? 'number' : 'text'}
                              value={toolArgs[field] ?? ''}
                              onChange={(e) => handleArgChange(field, e.target.value)}
                              placeholder={prop.example ? `e.g. ${prop.example}` : `Enter ${field}`}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 focus:bg-white"
                            />
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-2 text-xs text-slate-500 dark:text-slate-400 italic">
                        This tool does not require any input parameters.
                      </div>
                    )}
                  </div>
                )}

                {statusNotification && (
                  <div className="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-500/30 text-xs text-cyan-800 dark:text-cyan-200 flex items-center gap-2 font-medium">
                    <HelpCircle className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                    <span>{statusNotification}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleExecute}
                    disabled={executing}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    <Play className={`w-3.5 h-3.5 fill-current ${executing ? 'animate-pulse' : ''}`} />
                    <span>{executing ? 'Executing...' : 'Execute Tool'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Pane: Protocol & Telemetry Trace Inspector */}
        <aside
          className={`w-full md:w-[480px] lg:w-[540px] xl:w-[600px] border-l border-slate-200 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950 p-4 sm:p-5 shrink-0 overflow-hidden flex flex-col ${
            mobileTab === 'trace' ? 'flex' : 'hidden md:flex'
          }`}
        >
          <McpTraceViewer telemetry={telemetry} loading={executing} />
        </aside>
      </div>
    </div>
  );
};
