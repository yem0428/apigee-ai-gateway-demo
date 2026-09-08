import React, { useState, useEffect } from 'react';
import { ToolDefinition } from '../types';
import { fetchToolCatalog, executeToolDirect } from '../services/api';
import { Wrench, Play, CheckCircle, RefreshCw } from 'lucide-react';

export const ToolRegistryView: React.FC = () => {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null);
  const [testArgs, setTestArgs] = useState<string>('{}');
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    loadTools();
  }, []);

  const loadTools = async () => {
    setLoading(true);
    try {
      const data = await fetchToolCatalog();
      setTools(data);
      if (data.length > 0) {
        setSelectedTool(data[0]);
        setTestArgs(getDefaultArgs(data[0].name));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getDefaultArgs = (name: string) => {
    if (name === 'get_order_status') return JSON.stringify({ order_id: 'ORD-98765' }, null, 2);
    if (name === 'lookup_customer_profile') return JSON.stringify({ customer_id: 'CUST-1001' }, null, 2);
    if (name === 'search_knowledge_base') return JSON.stringify({ query: 'refund return window' }, null, 2);
    return '{}';
  };

  const handleToolSelect = (tool: ToolDefinition) => {
    setSelectedTool(tool);
    setTestArgs(getDefaultArgs(tool.name));
    setExecutionResult(null);
  };

  const handleExecute = async () => {
    if (!selectedTool) return;
    setExecuting(true);
    try {
      const parsedArgs = JSON.parse(testArgs);
      const res = await executeToolDirect(selectedTool.name, parsedArgs);
      setExecutionResult(res);
    } catch (e: any) {
      setExecutionResult({ error: e.message });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-slate-700 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Wrench className="w-5 h-5 text-cyan-400" />
            Apigee Tools Gateway Registry
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Enterprise tool definitions, schema specifications, and direct gateway execution testing.
          </p>
        </div>
        <button
          onClick={loadTools}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Catalog
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Tool List Column */}
        <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Registered Enterprise Tools ({tools.length})
          </h3>
          {tools.map((t) => (
            <div
              key={t.name}
              onClick={() => handleToolSelect(t)}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedTool?.name === t.name
                  ? 'bg-cyan-950/40 border-cyan-500 text-white'
                  : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              <div className="font-semibold text-sm">{t.name}</div>
              <div className="text-xs text-slate-400 line-clamp-2 mt-1">{t.description}</div>
            </div>
          ))}
        </div>

        {/* Selected Tool Details & Tester */}
        <div className="md:col-span-2 space-y-4">
          {selectedTool ? (
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">{selectedTool.name}</h3>
                  <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded text-xs">
                    Apigee Tools Gateway Route
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">{selectedTool.description}</p>
              </div>

              {/* JSON Schema Definition */}
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-1">Parameters Schema</div>
                <pre className="bg-slate-900 p-3 rounded-lg text-xs font-mono text-cyan-300 overflow-x-auto border border-slate-800">
                  {JSON.stringify(selectedTool.parameters, null, 2)}
                </pre>
              </div>

              {/* Test Arguments Input */}
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-1">Test Execution Payload (JSON)</div>
                <textarea
                  value={testArgs}
                  onChange={(e) => setTestArgs(e.target.value)}
                  rows={4}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleExecute}
                  disabled={executing}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-cyan-600/20 transition disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  {executing ? 'Executing via Gateway...' : 'Execute Tool Call'}
                </button>
              </div>

              {/* Execution Result */}
              {executionResult && (
                <div className="pt-2 border-t border-slate-700 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                    <CheckCircle className="w-4 h-4" />
                    Gateway Response Payload
                  </div>
                  <pre className="bg-slate-900 p-3 rounded-lg text-xs font-mono text-emerald-300 overflow-x-auto border border-slate-800">
                    {JSON.stringify(executionResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-500">
              Select a tool to view its schema and test execution.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
