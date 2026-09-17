import React, { useState, useEffect, useMemo } from 'react';
import {
  Coins,
  RefreshCw,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Database,
  Search,
  Calculator,
  RotateCcw,
  X,
} from 'lucide-react';
import { fetchModelRates, updateModelRates } from '../services/api';
import { RateCardDictionary } from '../types';

interface ModelRateCardViewProps {
  currentEnv?: 'dev' | 'prod';
}

export const ModelRateCardView: React.FC<ModelRateCardViewProps> = ({ currentEnv = 'prod' }) => {
  const [env] = useState<'dev' | 'prod'>(currentEnv);
  const [rates, setRates] = useState<RateCardDictionary>({});
  const [initialRates, setInitialRates] = useState<RateCardDictionary>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProvider, setFilterProvider] = useState<'all' | 'google' | 'anthropic'>('all');
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  // New Model Modal / Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newModelId, setNewModelId] = useState('');
  const [newProvider, setNewProvider] = useState<'google' | 'anthropic'>('google');
  const [newTier, setNewTier] = useState<'low' | 'medium' | 'high'>('medium');
  const [newInputRate, setNewInputRate] = useState('0.15');
  const [newOutputRate, setNewOutputRate] = useState('0.60');

  // Interactive Calculator State
  const [calcModel, setCalcModel] = useState<string>('gemini-3-flash-preview');
  const [calcPromptTokens, setCalcPromptTokens] = useState<number>(2500);
  const [calcOutputTokens, setCalcOutputTokens] = useState<number>(800);

  // Track unsaved changes
  const hasChanges = useMemo(() => {
    return JSON.stringify(rates) !== JSON.stringify(initialRates);
  }, [rates, initialRates]);

  const changeCount = useMemo(() => {
    const keys = new Set([...Object.keys(rates), ...Object.keys(initialRates)]);
    let count = 0;
    for (const k of keys) {
      if (!initialRates[k] || !rates[k]) {
        count++;
      } else if (
        rates[k].input !== initialRates[k].input ||
        rates[k].output !== initialRates[k].output ||
        rates[k].tier !== initialRates[k].tier ||
        rates[k].provider !== initialRates[k].provider
      ) {
        count++;
      }
    }
    return count;
  }, [rates, initialRates]);

  const loadRates = async (targetEnv: 'dev' | 'prod' = env) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchModelRates(targetEnv);
      setRates(data.rates || {});
      setInitialRates(JSON.parse(JSON.stringify(data.rates || {})));
      setLastSynced(new Date().toLocaleTimeString());
      if (data.rates && !data.rates[calcModel]) {
        setCalcModel(Object.keys(data.rates)[0] || 'default');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load model rate card');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRates(env);
  }, [env]);

  const handleSaveToKvm = async () => {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    const startTime = performance.now();
    try {
      await updateModelRates(env, rates);
      const elapsed = Math.round(performance.now() - startTime);
      setInitialRates(JSON.parse(JSON.stringify(rates)));
      setLastSynced(new Date().toLocaleTimeString());
      setSuccessMessage(`Saved ${Object.keys(rates).length} model rates in ${elapsed}ms!`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to update rates');
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = () => {
    setRates(JSON.parse(JSON.stringify(initialRates)));
  };

  const handleRateChange = (modelId: string, field: 'input' | 'output', value: string) => {
    const num = parseFloat(value);
    setRates((prev) => ({
      ...prev,
      [modelId]: {
        ...prev[modelId],
        [field]: isNaN(num) ? 0 : num,
      },
    }));
  };

  const handleTierChange = (modelId: string, tier: string) => {
    setRates((prev) => ({
      ...prev,
      [modelId]: {
        ...prev[modelId],
        tier,
      },
    }));
  };

  const handleDeleteModel = (modelId: string) => {
    if (modelId === 'default') {
      alert('The "default" rate card cannot be deleted as it serves as the global baseline fallback.');
      return;
    }
    if (confirm(`Remove rate card for "${modelId}"?`)) {
      setRates((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
    }
  };

  const handleAddModel = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newModelId.trim().toLowerCase();
    if (!cleanId) return;

    setRates((prev) => ({
      ...prev,
      [cleanId]: {
        input: parseFloat(newInputRate) || 0,
        output: parseFloat(newOutputRate) || 0,
        provider: newProvider,
        tier: newTier,
      },
    }));

    setShowAddModal(false);
    setNewModelId('');
    setNewInputRate('0.15');
    setNewOutputRate('0.60');
  };

  // Filtered model list
  const filteredModels = useMemo(() => {
    return Object.entries(rates).filter(([id, data]) => {
      const matchesSearch = id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesProvider =
        filterProvider === 'all' ||
        (data.provider && data.provider.toLowerCase() === filterProvider.toLowerCase());
      return matchesSearch && matchesProvider;
    });
  }, [rates, searchQuery, filterProvider]);

  // Live Calculator Calculation
  const calculatedCost = useMemo(() => {
    const modelData = rates[calcModel] || rates['default'] || { input: 0.15, output: 0.60 };
    const inCost = (calcPromptTokens / 1_000_000) * modelData.input;
    const outCost = (calcOutputTokens / 1_000_000) * modelData.output;
    const total = inCost + outCost;
    const micros = Math.max(1, Math.round(total * 1_000_000));
    return {
      inCost,
      outCost,
      total,
      micros,
    };
  }, [rates, calcModel, calcPromptTokens, calcOutputTokens]);

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-y-auto">
      {/* Header Banner */}
      <div className="border-b border-slate-800 bg-slate-900/60 px-6 py-4 backdrop-blur">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Coins className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">Model Rate Cards (KVM)</h1>
                <span className="text-[10px] bg-amber-500/15 text-amber-300 font-mono font-semibold px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  ai-model-rates
                </span>
                {hasChanges && (
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 font-bold px-2 py-0.5 rounded-full border border-blue-500/30 animate-pulse">
                    {changeCount} Unsaved Change{changeCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage token pricing ($/1M tokens) stored in Key-Value Map. Read in real-time by the gateway for dynamic cost & quota calculation.
              </p>
            </div>
          </div>

          {/* Right Actions & Environment Selector */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Production Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/70 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Production KVM (Global)</span>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => loadRates(env)}
              disabled={loading || saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer disabled:opacity-50"
              title="Reload Rates"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Revert Changes */}
            {hasChanges && (
              <button
                type="button"
                onClick={handleRevert}
                disabled={saving}
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                title="Discard unsaved edits"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                <span>Revert</span>
              </button>
            )}

            {/* Add Model Button */}
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>Add Model</span>
            </button>

            {/* Save to KVM Button */}
            <button
              type="button"
              onClick={handleSaveToKvm}
              disabled={!hasChanges || saving || loading}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition shadow-md cursor-pointer ${
                hasChanges
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 ring-2 ring-amber-400/40 shadow-amber-500/20'
                  : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
              }`}
            >
              <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
              <span>{saving ? 'Saving to KVM...' : 'Save to KVM'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-6 py-6 w-full space-y-6 flex-1">
        {/* Status Banners */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Info Grid: KVM Architecture & Real-Time Sync Telemetry */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5 mb-1">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              KVM Scope
            </div>
            <div className="text-sm font-bold text-slate-100 font-mono">
              bap-apac-demo2 / {env}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Map: <span className="font-mono text-slate-300">ai-model-rates</span> • Entry: <span className="font-mono text-slate-300">rate_card</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              Active Models Configured
            </div>
            <div className="text-sm font-bold text-slate-100 font-mono">
              {Object.keys(rates).length} Models Registered
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Google Gemini + Anthropic Claude on Vertex
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5 mb-1">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              Calculation Formula
            </div>
            <div className="text-[11px] font-mono text-amber-300 font-medium truncate">
              (in/1M × rate) + (out/1M × rate)
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Converted to micro-dollars for quota deduction
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5 mb-1">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              Live Sync Status
            </div>
            <div className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Synchronized with the gateway
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Last fetched: {lastSynced || 'Just now'}
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by model ID (e.g., gemini-3.1, claude-opus, flash)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setFilterProvider('all')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  filterProvider === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterProvider('google')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  filterProvider === 'google' ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Google
              </button>
              <button
                type="button"
                onClick={() => setFilterProvider('anthropic')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  filterProvider === 'anthropic' ? 'bg-orange-600/30 text-orange-300 border border-orange-500/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Anthropic
              </button>
            </div>
          </div>
        </div>

        {/* Rate Cards Table */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800 font-bold">
                <tr>
                  <th className="py-3 px-4">Model Identifier</th>
                  <th className="py-3 px-4">Provider</th>
                  <th className="py-3 px-4">Cost Tier</th>
                  <th className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <span>Input Rate</span>
                      <span className="text-slate-500 font-normal">($ / 1M tokens)</span>
                    </div>
                  </th>
                  <th className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <span>Output Rate</span>
                      <span className="text-slate-500 font-normal">($ / 1M tokens)</span>
                    </div>
                  </th>
                  <th className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <span>Sample 1k/1k Call</span>
                      <span className="text-slate-500 font-normal">(USD)</span>
                    </div>
                  </th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-400" />
                      Loading live rate card...
                    </td>
                  </tr>
                ) : filteredModels.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No models match your search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredModels.map(([modelId, item]) => {
                    const sampleCallCost = ((item.input * 0.001) + (item.output * 0.001)).toFixed(6);
                    const isDefault = modelId === 'default';

                    return (
                      <tr key={modelId} className="hover:bg-slate-850/40 transition">
                        {/* Model ID */}
                        <td className="py-3 px-4 font-mono font-medium text-slate-100 flex items-center gap-2">
                          <span className={isDefault ? 'text-amber-400 font-bold' : 'text-slate-200'}>
                            {modelId}
                          </span>
                          {isDefault && (
                            <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                              Fallback Baseline
                            </span>
                          )}
                        </td>

                        {/* Provider Tag */}
                        <td className="py-3 px-4">
                          {item.provider === 'anthropic' ? (
                            <span className="text-[10px] font-semibold text-orange-300 bg-orange-500/10 border border-orange-500/30 px-2 py-0.5 rounded-md">
                              Anthropic Vertex
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-blue-300 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-md">
                              Google Gemini
                            </span>
                          )}
                        </td>

                        {/* Cost Tier */}
                        <td className="py-3 px-4">
                          <select
                            value={item.tier || 'medium'}
                            onChange={(e) => handleTierChange(modelId, e.target.value)}
                            className="bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-[11px] font-medium text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                          >
                            <option value="low">Low Cost (Flash)</option>
                            <option value="medium">Medium Cost</option>
                            <option value="high">High Cost (Pro/Opus)</option>
                          </select>
                        </td>

                        {/* Input Rate */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500 font-mono">$</span>
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={item.input}
                              onChange={(e) => handleRateChange(modelId, 'input', e.target.value)}
                              className="w-24 bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-amber-500 rounded-lg px-2.5 py-1 text-slate-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </div>
                        </td>

                        {/* Output Rate */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500 font-mono">$</span>
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={item.output}
                              onChange={(e) => handleRateChange(modelId, 'output', e.target.value)}
                              className="w-24 bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-amber-500 rounded-lg px-2.5 py-1 text-slate-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </div>
                        </td>

                        {/* Sample 1k tokens cost */}
                        <td className="py-3 px-4 font-mono text-emerald-400 font-semibold">
                          ${sampleCallCost}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          {!isDefault && (
                            <button
                              type="button"
                              onClick={() => handleDeleteModel(modelId)}
                              className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                              title={`Delete rate card for ${modelId}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Cost Simulator & Token Playground */}
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white tracking-tight">Interactive Cost & Budget Simulator</h2>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Live calculation verified against <span className="text-emerald-400">flow.tx_cost_usd</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            {/* Model Select */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">
                Simulated Target Model
              </label>
              <select
                value={calcModel}
                onChange={(e) => setCalcModel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
              >
                {Object.keys(rates).map((m) => (
                  <option key={m} value={m}>
                    {m} ({rates[m]?.provider || 'custom'})
                  </option>
                ))}
              </select>
            </div>

            {/* Prompt Tokens */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400">Prompt Tokens</label>
                <span className="font-mono text-amber-400">{calcPromptTokens.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min="10"
                max="50000"
                step="50"
                value={calcPromptTokens}
                onChange={(e) => setCalcPromptTokens(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Output Tokens */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400">Candidate Tokens</label>
                <span className="font-mono text-emerald-400">{calcOutputTokens.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min="10"
                max="10000"
                step="50"
                value={calcOutputTokens}
                onChange={(e) => setCalcOutputTokens(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Computed Cost Metrics */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-center">
              <div className="text-[10px] uppercase font-bold text-slate-400">Calculated Cost</div>
              <div className="text-lg font-bold text-amber-400 font-mono mt-0.5">
                ${calculatedCost.total.toFixed(6)} <span className="text-xs text-slate-400 font-normal">USD</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                Quota Deduction: <span className="text-emerald-400">{calculatedCost.micros}</span> micro-dollars
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Model Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">Add Model Rate Card</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddModel} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Model ID / Name (exact or prefix)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., gemini-3.1-pro-preview, claude-opus-4-5@20251101"
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Provider</label>
                  <select
                    value={newProvider}
                    onChange={(e) => setNewProvider(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="google">Google Gemini</option>
                    <option value="anthropic">Anthropic Vertex</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Cost Tier</label>
                  <select
                    value={newTier}
                    onChange={(e) => setNewTier(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="low">Low (Flash)</option>
                    <option value="medium">Medium</option>
                    <option value="high">High (Pro/Opus)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Input Rate ($/1M tokens)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    value={newInputRate}
                    onChange={(e) => setNewInputRate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Output Rate ($/1M tokens)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    value={newOutputRate}
                    onChange={(e) => setNewOutputRate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                >
                  Add Model
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
