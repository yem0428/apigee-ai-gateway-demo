import React, { useState, useEffect, useMemo } from 'react';
import {
  Coins,
  Wallet,
  FileSpreadsheet,
  Layers,
  RefreshCw,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Database,
  Search,
  Calculator,
  RotateCcw,
  X,
  CreditCard,
  ShieldCheck,
  Activity,
  User,
  Users,
} from 'lucide-react';
import {
  fetchModelRates,
  updateModelRates,
  fetchDeveloperBalance,
  creditDeveloperBalance,
  fetchRatePlans,
  fetchDeveloperSubscriptions,
  subscribeDeveloper,
  fetchDeveloperMonetizationConfig,
  updateDeveloperMonetizationConfig,
  fetchDeveloperAttributions,
} from '../services/api';
import {
  RateCardDictionary,
  RatePlanInfo,
  DeveloperSubscription,
  DeveloperMonetizationConfig,
  GatewaySettings,
  UserMonetizationAttribution,
} from '../types';
import { DEFAULT_SSO_USER } from '../services/defaultSettings';

interface MonetizationManagerProps {
  currentEnv?: 'dev' | 'prod';
  settings?: GatewaySettings;
}

type MonetizationSubTab = 'wallets' | 'rate-cards' | 'rate-plans' | 'governance';

export const MonetizationManager: React.FC<MonetizationManagerProps> = ({
  currentEnv = 'prod',
  settings,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<MonetizationSubTab>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('subtab') as MonetizationSubTab;
      if (p && ['wallets', 'rate-cards', 'rate-plans', 'governance'].includes(p)) {
        return p;
      }
    }
    return 'wallets';
  });
  const [env] = useState<'dev' | 'prod'>(currentEnv);

  // Active Developer for Monetization
  const defaultEmail = settings?.ssoUser?.email || settings?.userEmail || DEFAULT_SSO_USER.email;
  const [selectedDeveloper, setSelectedDeveloper] = useState<string>(defaultEmail);

  useEffect(() => {
    if (defaultEmail && (selectedDeveloper === DEFAULT_SSO_USER.email || !selectedDeveloper)) {
      setSelectedDeveloper(defaultEmail);
    }
  }, [defaultEmail]);

  // Global Alert / Notification state
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // -------------------------------------------------------------
  // 1. Developer Wallet & Monetization Config State
  // -------------------------------------------------------------
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletBalance, setWalletBalance] = useState<{
    units: string;
    nanos: number;
    currencyCode: string;
    lastCreditTime?: string;
  }>({
    units: '100',
    nanos: 0,
    currencyCode: 'USD',
  });
  const [monetizationConfig, setMonetizationConfig] = useState<DeveloperMonetizationConfig>({
    billingType: 'PREPAID',
  });
  const [configSaving, setConfigSaving] = useState(false);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [customTopUpAmount, setCustomTopUpAmount] = useState('25');
  const [showCustomTopUpModal, setShowCustomTopUpModal] = useState(false);
  const [isSimulatingExhaustedWallet, setIsSimulatingExhaustedWallet] = useState(false);
  const [userAttributionSearch, setUserAttributionSearch] = useState('');

  // -------------------------------------------------------------
  // 2. KVM Model Rate Cards State
  // -------------------------------------------------------------
  const [rates, setRates] = useState<RateCardDictionary>({});
  const [initialRates, setInitialRates] = useState<RateCardDictionary>({});
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesSaving, setRatesSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProvider, setFilterProvider] = useState<'all' | 'google' | 'anthropic'>('all');

  // Add Model Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newModelId, setNewModelId] = useState('');
  const [newProvider, setNewProvider] = useState<'google' | 'anthropic'>('google');
  const [newTier, setNewTier] = useState<'low' | 'medium' | 'high'>('medium');
  const [newInputRate, setNewInputRate] = useState('0.15');
  const [newOutputRate, setNewOutputRate] = useState('0.60');

  // Interactive Calculator State
  const [calcModel, setCalcModel] = useState<string>('gemini-3-flash');
  const [calcPromptTokens, setCalcPromptTokens] = useState<number>(2500);
  const [calcOutputTokens, setCalcOutputTokens] = useState<number>(800);

  // -------------------------------------------------------------
  // 3. Product Rate Plans & Subscriptions State
  // -------------------------------------------------------------
  const [plansLoading, setPlansLoading] = useState(false);
  const [ratePlans, setRatePlans] = useState<RatePlanInfo[]>([]);
  const [subscriptions, setSubscriptions] = useState<DeveloperSubscription[]>([]);
  const [subscribingProduct, setSubscribingProduct] = useState<string | null>(null);
  const [liveAttributions, setLiveAttributions] = useState<UserMonetizationAttribution[]>([]);

  // Available Developers loaded dynamically from Apigee Management API
  const availableDevelopers = useMemo(() => {
    if (liveAttributions.length > 0) {
      return liveAttributions.map((a) => ({
        email: a.userEmail,
        name: a.name,
        badge: a.badge,
      }));
    }
    return [
      { email: defaultEmail, name: 'Current SSO User (maloosatyam)', badge: 'SSO Caller' },
      { email: 'maloosatyam@google.com', name: 'Satyam Maloo', badge: 'Prepaid Wallet' },
      { email: 'maloosatyam@gmail.com', name: 'Satyam Maloo (Personal)', badge: 'Prepaid Wallet' },
      { email: 'adk-auto-insurance-developer@acme.com', name: 'ADK Auto Insurance Dev', badge: 'Developer' },
    ];
  }, [liveAttributions, defaultEmail]);

  // Load Developer Wallet & Monetization Config
  const loadWalletData = async (dev: string) => {
    setWalletLoading(true);
    try {
      const [balRes, cfgRes] = await Promise.all([
        fetchDeveloperBalance(dev).catch(() => null),
        fetchDeveloperMonetizationConfig(dev).catch(() => null),
      ]);

      if (balRes?.data?.wallets && balRes.data.wallets.length > 0) {
        const primary = balRes.data.wallets[0];
        setWalletBalance({
          units: primary.balance.units,
          nanos: primary.balance.nanos,
          currencyCode: primary.balance.currencyCode || 'USD',
          lastCreditTime: primary.lastCreditTime,
        });
      } else {
        setWalletBalance({ units: '0', nanos: 0, currencyCode: 'USD' });
      }

      if (cfgRes?.config?.billingType) {
        setMonetizationConfig(cfgRes.config);
      }
    } catch (err: any) {
      console.warn('Failed to load wallet data:', err.message);
    } finally {
      setWalletLoading(false);
    }
  };

  // Load KVM Model Rate Cards
  const loadKvmRates = async () => {
    setRatesLoading(true);
    try {
      const data = await fetchModelRates(env);
      setRates(data.rates || {});
      setInitialRates(JSON.parse(JSON.stringify(data.rates || {})));
      if (data.rates && !data.rates[calcModel]) {
        setCalcModel(Object.keys(data.rates)[0] || 'default');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load model rate card from Apigee KVM');
    } finally {
      setRatesLoading(false);
    }
  };

  // Load Published Rate Plans & Subscriptions
  const loadPlansAndSubscriptions = async (dev: string) => {
    setPlansLoading(true);
    try {
      const [rpRes, subRes] = await Promise.all([
        fetchRatePlans().catch(() => ({ ratePlans: [] })),
        fetchDeveloperSubscriptions(dev).catch(() => ({ subscriptions: [] })),
      ]);
      setRatePlans(rpRes.ratePlans || []);
      setSubscriptions(subRes.subscriptions || []);
    } catch (err: any) {
      console.warn('Failed to load rate plans or subscriptions:', err.message);
    } finally {
      setPlansLoading(false);
    }
  };

  // Load Developer Attributions from Apigee Management API
  const loadAttributions = async () => {
    try {
      const data = await fetchDeveloperAttributions();
      if (data.attributions && data.attributions.length > 0) {
        setLiveAttributions(data.attributions);
      }
    } catch (err: any) {
      console.warn('Failed to load developer attributions:', err.message);
    }
  };

  // Master Refresh
  const handleRefreshAll = async () => {
    setError(null);
    await Promise.all([
      loadWalletData(selectedDeveloper),
      loadKvmRates(),
      loadPlansAndSubscriptions(selectedDeveloper),
      loadAttributions(),
    ]);
    setSuccessMessage('Synchronized all monetization and pricing data with Apigee');
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  useEffect(() => {
    handleRefreshAll();
  }, [selectedDeveloper, env]);

  // Wallet Top-Up Action
  const handleCreditWallet = async (amountStr: string) => {
    const num = parseFloat(amountStr);
    if (isNaN(num) || num <= 0) return;

    setTopUpLoading(true);
    setError(null);
    try {
      await creditDeveloperBalance(amountStr, selectedDeveloper);
      await loadWalletData(selectedDeveloper);
      setIsSimulatingExhaustedWallet(false);
      setSuccessMessage(`Successfully credited +$${amountStr} USD to ${selectedDeveloper}'s prepaid wallet`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to credit developer wallet');
    } finally {
      setTopUpLoading(false);
      setShowCustomTopUpModal(false);
    }
  };

  // Toggle Billing Type (PREPAID vs POSTPAID)
  const handleToggleBillingType = async () => {
    const newType = monetizationConfig.billingType === 'PREPAID' ? 'POSTPAID' : 'PREPAID';
    setConfigSaving(true);
    setError(null);
    try {
      await updateDeveloperMonetizationConfig(newType, selectedDeveloper);
      setMonetizationConfig({ billingType: newType });
      setSuccessMessage(`Developer billing type updated to ${newType}`);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to update developer billing type');
    } finally {
      setConfigSaving(false);
    }
  };

  // Subscribe Product
  const handleSubscribeProduct = async (productName: string) => {
    setSubscribingProduct(productName);
    setError(null);
    try {
      await subscribeDeveloper(productName, selectedDeveloper);
      await loadPlansAndSubscriptions(selectedDeveloper);
      setSuccessMessage(`Successfully subscribed ${selectedDeveloper} to ${productName}`);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to subscribe developer to rate plan');
    } finally {
      setSubscribingProduct(null);
    }
  };

  // KVM Rates Management
  const hasRateChanges = useMemo(() => {
    return JSON.stringify(rates) !== JSON.stringify(initialRates);
  }, [rates, initialRates]);

  const handleSaveKvmRates = async () => {
    setRatesSaving(true);
    setError(null);
    try {
      await updateModelRates(env, rates);
      setInitialRates(JSON.parse(JSON.stringify(rates)));
      setSuccessMessage(`Saved model rates to Apigee ${env.toUpperCase()} KVM (ai-model-rates)`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update rates in Apigee KVM');
    } finally {
      setRatesSaving(false);
    }
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
      alert('The "default" rate card cannot be deleted as it serves as the baseline fallback.');
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

  // Filtered Model Rates
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
    return { inCost, outCost, total, micros };
  }, [rates, calcModel, calcPromptTokens, calcOutputTokens]);

  const displayWalletAmount = useMemo(() => {
    if (isSimulatingExhaustedWallet) return '0.000000';
    const units = walletBalance.units || '0';
    const nanos = walletBalance.nanos || 0;
    const fractional = (nanos / 1_000_000_000).toFixed(6).slice(2);
    return `${units}.${fractional}`;
  }, [walletBalance, isSimulatingExhaustedWallet]);

  const userAttributions: UserMonetizationAttribution[] = useMemo(() => {
    const ssoBalanceNum = Number(walletBalance.units || '109') + Number(walletBalance.nanos || 0) / 1e9;

    let list: UserMonetizationAttribution[] = [];

    if (liveAttributions.length > 0) {
      list = liveAttributions.map((a) => {
        if (a.userEmail.toLowerCase() === selectedDeveloper.toLowerCase() || a.userEmail.toLowerCase() === defaultEmail.toLowerCase()) {
          return {
            ...a,
            currentBalanceUsd: isSimulatingExhaustedWallet ? 0.00 : ssoBalanceNum,
          };
        }
        return a;
      });
    } else {
      list = [
        {
          userEmail: defaultEmail,
          name: 'Current SSO User (maloosatyam)',
          tier: 'Enterprise AI Tier',
          badge: 'Prepaid Wallet',
          billingType: 'PREPAID',
          totalConsumedUsd: 0,
          totalCalls: 0,
          totalTokens: 0,
          currentBalanceUsd: isSimulatingExhaustedWallet ? 0.00 : ssoBalanceNum,
          allocatedBudgetUsd: 150.00,
          lastActive: 'Active Wallet',
        },
      ];
    }

    if (!userAttributionSearch.trim()) return list;
    const q = userAttributionSearch.toLowerCase();
    return list.filter(
      (u) =>
        u.userEmail.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.badge.toLowerCase().includes(q)
    );
  }, [defaultEmail, walletBalance, isSimulatingExhaustedWallet, userAttributionSearch]);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-y-auto">
      {/* Top Banner & Main Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-4 sm:px-6 py-4 backdrop-blur">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
              <Coins className="w-5 h-5 text-white font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  Apigee Monetization & Pricing Manager
                </h1>
                <span className="text-[10px] bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-mono font-semibold px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Native Rating Engine
                </span>
                <span className="text-[10px] bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono font-semibold px-2 py-0.5 rounded border border-amber-200 dark:border-amber-500/30 flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  ai-model-rates KVM
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Manage developer prepaid wallets, token pricing rate cards, and published rate plans enforced by Apigee Monetization policies.
              </p>
            </div>
          </div>

          {/* Quick Header Actions: Developer Selector, Active Wallet Chip & Refresh */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Developer Selector */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              <User className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <select
                value={selectedDeveloper}
                onChange={(e) => setSelectedDeveloper(e.target.value)}
                className="bg-transparent text-slate-800 dark:text-slate-200 font-mono text-xs focus:outline-none cursor-pointer"
                title="Select Developer Account to Inspect & Manage"
              >
                {availableDevelopers.map((d) => (
                  <option key={d.email} value={d.email} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {d.email} ({d.badge})
                  </option>
                ))}
              </select>
            </div>

            {/* Live Wallet Chip */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
              <Wallet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-slate-500 dark:text-slate-400 text-[11px]">Selected Wallet:</span>
              <span className={`font-mono font-bold ${isSimulatingExhaustedWallet ? 'text-rose-600 dark:text-rose-400 line-through' : 'text-emerald-600 dark:text-emerald-400'}`}>
                ${displayWalletAmount} USD
              </span>
              {isSimulatingExhaustedWallet && (
                <span className="text-[9px] bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-500/30">
                  Exhausted (403 Test)
                </span>
              )}
            </div>

            {/* Quick Refresh */}
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={walletLoading || ratesLoading || plansLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition cursor-pointer disabled:opacity-50"
              title="Synchronize all data from Apigee Management API"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${walletLoading || ratesLoading || plansLoading ? 'animate-spin text-emerald-500' : ''}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>
          </div>
        </div>

        {/* Sub-Tab Navigation Strip */}
        <div className="max-w-7xl mx-auto mt-4 flex items-center gap-1 border-t border-slate-200 dark:border-slate-800/80 pt-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('wallets')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${
              activeSubTab === 'wallets'
                ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-400/40'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Developer Wallets & Credits</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('rate-cards')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${
              activeSubTab === 'rate-cards'
                ? 'bg-amber-600 text-white shadow-xs ring-1 ring-amber-400/40'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Model Rate Cards (KVM)</span>
            {hasRateChanges && (
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('rate-plans')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${
              activeSubTab === 'rate-plans'
                ? 'bg-purple-600 text-white shadow-xs ring-1 ring-purple-400/40'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Product Rate Plans & Subscriptions</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('governance')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${
              activeSubTab === 'governance'
                ? 'bg-blue-600 text-white shadow-xs ring-1 ring-blue-400/40'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Policy Governance & Runtime Flow</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6 flex-1">
        {/* Status Alerts */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700 dark:hover:text-white cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 dark:hover:text-white cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* SUB-TAB 1: DEVELOPER WALLETS & TOP-UP */}
        {activeSubTab === 'wallets' && (
          <div className="space-y-6">
            {/* Fleet Overview KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Registered Accounts
                  </span>
                  <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                    {userAttributions.length}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Enterprise callers & personas
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/60 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Total Fleet Token Spend
                  </span>
                  <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
                    ${userAttributions.reduce((acc, u) => acc + u.totalConsumedUsd, 0).toFixed(2)}{' '}
                    <span className="text-xs font-sans text-slate-500 dark:text-slate-400 font-normal">USD</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Total consumed across models
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center shrink-0">
                  <Coins className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Available Prepaid Pool
                  </span>
                  <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                    ${userAttributions.reduce((acc, u) => acc + u.currentBalanceUsd, 0).toFixed(2)}{' '}
                    <span className="text-xs font-sans text-slate-500 dark:text-slate-400 font-normal">USD</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    PreFlow Limits Check budget
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-center shrink-0">
                  <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </div>

            {/* Enterprise User & Persona Attribution: Consumed vs Balance (Admin Hero) */}
            <div className="rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Enterprise User & Persona Attribution (Consumed vs Balance)</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Centralized administrator ledger linking caller identities to token spend, active prepaid wallet balances, and credit quotas
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={userAttributionSearch}
                      onChange={(e) => setUserAttributionSearch(e.target.value)}
                      placeholder="Filter user or persona..."
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* Attribution Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                      <th className="pb-3">User & Persona</th>
                      <th className="pb-3">Entitlement Tier</th>
                      <th className="pb-3">Billing Mode</th>
                      <th className="pb-3">Total Consumed</th>
                      <th className="pb-3">Active Balance</th>
                      <th className="pb-3">Consumed vs Balance</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-xs">
                    {userAttributions.map((user) => {
                      const isSelected = user.userEmail === selectedDeveloper;
                      const totalAllocated = user.totalConsumedUsd + user.currentBalanceUsd;
                      const consumedPct = totalAllocated > 0 ? Math.min(100, Math.round((user.totalConsumedUsd / totalAllocated) * 100)) : 0;
                      const isDepleted = user.currentBalanceUsd <= 0;

                      return (
                        <tr
                          key={user.userEmail}
                          onClick={() => setSelectedDeveloper(user.userEmail)}
                          className={`cursor-pointer transition group ${
                            isSelected
                              ? 'bg-emerald-50/60 dark:bg-slate-850/90'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-850/40'
                          }`}
                        >
                          {/* User & Persona */}
                          <td className="py-3 font-sans">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  isSelected ? 'bg-emerald-500 animate-pulse' : isDepleted ? 'bg-rose-500' : 'bg-slate-400 dark:bg-slate-500'
                                }`}
                              />
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white flex items-center gap-1.5">
                                  <span>{user.name}</span>
                                  {isSelected && (
                                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30">
                                      ACTIVE
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                  {user.userEmail}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Entitlement Tier */}
                          <td className="py-3 font-sans">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                              user.badge === 'Enterprise AI' || user.badge === 'SSO Caller'
                                ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30'
                                : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30'
                            }`}>
                              {user.badge}
                            </span>
                          </td>

                          {/* Billing Mode */}
                          <td className="py-3">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                              user.billingType === 'PREPAID'
                                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30'
                                : 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30'
                            }`}>
                              {user.billingType}
                            </span>
                          </td>

                          {/* Consumed (Sum) */}
                          <td className="py-3">
                            <div className="font-bold text-slate-900 dark:text-slate-200">
                              ${user.totalConsumedUsd.toFixed(2)} <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400 font-sans">USD</span>
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                              {user.totalCalls.toLocaleString()} calls • {(user.totalTokens / 1e6).toFixed(1)}M tokens
                            </div>
                          </td>

                          {/* Active Balance */}
                          <td className="py-3">
                            <div className={`font-bold ${isDepleted ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              ${user.currentBalanceUsd.toFixed(2)} <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400 font-sans">USD</span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-sans">
                              {isDepleted ? 'Depleted (403)' : 'Available to Spend'}
                            </div>
                          </td>

                          {/* Consumed vs Balance Health */}
                          <td className="py-3 w-48 font-sans">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-slate-500 dark:text-slate-400 font-mono">{consumedPct}% Used</span>
                                <span className={`font-mono font-medium ${isDepleted ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                  {isDepleted ? 'DEPLETED' : 'HEALTHY'}
                                </span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    isDepleted
                                      ? 'bg-rose-500'
                                      : consumedPct > 75
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.max(4, consumedPct)}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3 text-right font-sans">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDeveloper(user.userEmail);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                                }`}
                                title="Focus this developer wallet in management console"
                              >
                                {isSelected ? 'Selected' : 'Select'}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDeveloper(user.userEmail);
                                  setShowCustomTopUpModal(true);
                                }}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 border border-emerald-200 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 transition cursor-pointer flex items-center gap-1"
                                title="Top up prepaid wallet credits for this user"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Credit</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 2: KVM MODEL RATE CARDS */}
        {activeSubTab === 'rate-cards' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by model ID (e.g., gemini-3.1, claude-opus, flash)..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setFilterProvider('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                      filterProvider === 'all' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterProvider('google')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                      filterProvider === 'google' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Google
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterProvider('anthropic')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                      filterProvider === 'anthropic' ? 'bg-orange-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Anthropic
                  </button>
                </div>

                {hasRateChanges && (
                  <button
                    type="button"
                    onClick={() => setRates(JSON.parse(JSON.stringify(initialRates)))}
                    disabled={ratesSaving}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Revert</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-500" />
                  <span>Add Model</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveKvmRates}
                  disabled={!hasRateChanges || ratesSaving || ratesLoading}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
                    hasRateChanges
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white ring-2 ring-amber-400/40'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700/50 cursor-not-allowed'
                  }`}
                >
                  <Save className={`w-3.5 h-3.5 ${ratesSaving ? 'animate-spin' : ''}`} />
                  <span>{ratesSaving ? 'Saving...' : 'Save to KVM'}</span>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/90 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800 font-bold">
                    <tr>
                      <th className="py-3 px-4">Model Identifier</th>
                      <th className="py-3 px-4">Provider</th>
                      <th className="py-3 px-4">Cost Tier</th>
                      <th className="py-3 px-4">Input Rate ($/1M)</th>
                      <th className="py-3 px-4">Output Rate ($/1M)</th>
                      <th className="py-3 px-4">Sample 1k/1k Call</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {ratesLoading ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-500" />
                          Loading live rate cards from Apigee KVM...
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
                          <tr key={modelId} className="hover:bg-slate-50 dark:hover:bg-slate-850/40 transition">
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                              <span className={isDefault ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-800 dark:text-slate-200'}>
                                {modelId}
                              </span>
                              {isDefault && (
                                <span className="text-[9px] bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-500/30">
                                  Default Fallback
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 font-sans">
                              {item.provider === 'anthropic' ? (
                                <span className="text-[10px] font-semibold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 px-2 py-0.5 rounded-md">
                                  Anthropic Vertex
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 px-2 py-0.5 rounded-md">
                                  Google Gemini
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 font-sans">
                              <select
                                value={item.tier || 'medium'}
                                onChange={(e) => handleTierChange(modelId, e.target.value)}
                                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                              >
                                <option value="low">Low (Flash)</option>
                                <option value="medium">Medium</option>
                                <option value="high">High (Pro/Opus)</option>
                              </select>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400 dark:text-slate-500">$</span>
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  value={item.input}
                                  onChange={(e) => handleRateChange(modelId, 'input', e.target.value)}
                                  className="w-24 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 focus:border-amber-500 rounded-lg px-2.5 py-1 text-slate-900 dark:text-slate-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                                />
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400 dark:text-slate-500">$</span>
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  value={item.output}
                                  onChange={(e) => handleRateChange(modelId, 'output', e.target.value)}
                                  className="w-24 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 focus:border-amber-500 rounded-lg px-2.5 py-1 text-slate-900 dark:text-slate-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                                />
                              </div>
                            </td>

                            <td className="py-3 px-4 font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                              ${sampleCallCost}
                            </td>

                            <td className="py-3 px-4 text-right font-sans">
                              {!isDefault && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteModel(modelId)}
                                  className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                  title={`Delete ${modelId}`}
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

            {/* Interactive Apigee Cost & Budget Simulator */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-amber-500" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                    Interactive Apigee Cost & Wallet Deduction Simulator
                  </h2>
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  Simulates <span className="text-emerald-600 dark:text-emerald-400 font-semibold">CalculateCost.js</span> rating logic
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                    Target Model
                  </label>
                  <select
                    value={calcModel}
                    onChange={(e) => setCalcModel(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    {Object.keys(rates).map((m) => (
                      <option key={m} value={m}>
                        {m} ({rates[m]?.provider || 'custom'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Prompt Tokens</label>
                    <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">{calcPromptTokens.toLocaleString()}</span>
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

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Output Tokens</label>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{calcOutputTokens.toLocaleString()}</span>
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

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col justify-center">
                  <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Apigee Calculated Cost</div>
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                    ${calculatedCost.total.toFixed(6)} <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">USD</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                    Wallet Deduction: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{calculatedCost.micros}</span> micro-dollars
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 3: PRODUCT RATE PLANS & SUBSCRIPTIONS */}
        {activeSubTab === 'rate-plans' && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span>Published Apigee Product Rate Plans</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Apigee Native Monetization rate plans attached to API Products for consumption rating
                  </p>
                </div>
              </div>

              {plansLoading ? (
                <div className="py-12 text-center text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-purple-500" />
                  Loading rate plans from Apigee...
                </div>
              ) : ratePlans.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  No rate plans found. Ensure rate plans are provisioned via `deploy_all.sh`.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ratePlans.map((plan) => {
                    const isPublished = plan.state === 'PUBLISHED';
                    return (
                      <div
                        key={plan.name}
                        className="rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-4 space-y-3 relative overflow-hidden"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 tracking-wider">
                              {plan.apiproduct}
                            </span>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                              {plan.displayName || plan.name}
                            </h4>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                              isPublished
                                ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {plan.state}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/80 text-xs font-mono">
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase font-sans">Billing Cycle</div>
                            <div className="text-slate-800 dark:text-slate-200 mt-0.5">{plan.billingPeriod}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase font-sans">Currency</div>
                            <div className="text-emerald-600 dark:text-emerald-400 mt-0.5 font-bold">{plan.currencyCode}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase font-sans">Pricing Model</div>
                            <div className="text-slate-800 dark:text-slate-200 mt-0.5 truncate">{plan.consumptionPricingType}</div>
                          </div>
                        </div>

                        <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate pt-1 border-t border-slate-200 dark:border-slate-850">
                          ID: {plan.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Developer Active Subscriptions */}
            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Active Developer Subscriptions for {selectedDeveloper}</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Developers must hold an active subscription to access the model endpoints under that tier
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {['Standard AI Tier', 'Enterprise AI Tier'].map((prod) => {
                  const isSubscribed = subscriptions.some((s) => s.apiproduct === prod);
                  return (
                    <div
                      key={prod}
                      className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-200">{prod}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          {isSubscribed ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Active Subscription</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                              <span className="text-rose-600 dark:text-rose-400 font-medium">Not Subscribed (403 Blocked)</span>
                            </>
                          )}
                        </div>
                      </div>

                      {!isSubscribed && (
                        <button
                          type="button"
                          onClick={() => handleSubscribeProduct(prod)}
                          disabled={subscribingProduct === prod}
                          className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
                        >
                          {subscribingProduct === prod ? 'Subscribing...' : 'Subscribe'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 4: POLICY GOVERNANCE & RUNTIME FLOW */}
        {activeSubTab === 'governance' && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-xs">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Apigee Monetization Runtime Architecture & Execution Pipeline</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  How incoming LLM requests are gated, rated, and accounted in real-time by Apigee X proxy policies
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 relative">
                  <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase">Stage 1: PreFlow Auth</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">API Key Verification</div>
                  <p className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                    Resolves developer product, monthly budget limit attribute, and developer identity.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/40 dark:bg-slate-950 border border-emerald-200 dark:border-emerald-500/40 space-y-2 relative">
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase">Stage 2: Limits Check</div>
                  <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Monetization Limits Check</div>
                  <p className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                    Verifies active rate plan subscription and wallet balance &gt; $0. Returns HTTP 403 if exhausted.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-amber-50/40 dark:bg-slate-950 border border-amber-200 dark:border-amber-500/40 space-y-2 relative">
                  <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase">Stage 3: PostFlow Rating</div>
                  <div className="text-sm font-bold text-amber-700 dark:text-amber-300">Model Rates & Cost Engine</div>
                  <p className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                    Calculates micro-dollars from rate cards, sets unit price multiplier for rating engine.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-purple-50/40 dark:bg-slate-950 border border-purple-200 dark:border-purple-500/40 space-y-2 relative">
                  <div className="text-[10px] text-purple-600 dark:text-purple-400 font-bold uppercase">Stage 4: Telemetry Headers</div>
                  <div className="text-sm font-bold text-purple-700 dark:text-purple-300">Balance & Cost Injection</div>
                  <p className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                    Passes prepaid balance, remaining quota, and transaction cost headers to caller.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 font-mono text-xs">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between font-sans">
                  <span>Monetization Limits Policy Configuration</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">apiproxy/policies/MonetizationLimits.xml</span>
                </div>
                <pre className="p-3 bg-slate-900 rounded-lg text-emerald-400 text-[11px] overflow-x-auto leading-relaxed">
{`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<MonetizationLimitsCheck continueOnError="false" enabled="true" name="MLC-EnforceMonetizationLimits">
  <DisplayName>MLC-EnforceMonetizationLimits</DisplayName>
  <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
  <FaultResponse>
    <Set>
      <Payload contentType="application/json">{"error": {"code": 403, "status": "PERMISSION_DENIED", "message": "Monetization limit exceeded or prepaid balance exhausted: {mint.limitscheck.status_message}"}}</Payload>
      <StatusCode>403</StatusCode>
      <ReasonPhrase>Forbidden</ReasonPhrase>
    </Set>
  </FaultResponse>
</MonetizationLimitsCheck>`}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Custom Top-Up Modal */}
      {showCustomTopUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Top-Up Prepaid Wallet</h3>
              </div>
              <button
                onClick={() => setShowCustomTopUpModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Developer Account
                </label>
                <input
                  type="text"
                  disabled
                  value={selectedDeveloper}
                  className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-500 dark:text-slate-400 font-mono"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Billing Mode</div>
                  <div className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">{monetizationConfig.billingType}</div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleBillingType}
                  disabled={configSaving}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium transition cursor-pointer disabled:opacity-50"
                  title="Switch between PREPAID (enforced limits) and POSTPAID"
                >
                  {configSaving ? 'Updating...' : `Switch to ${monetizationConfig.billingType === 'PREPAID' ? 'POSTPAID' : 'PREPAID'}`}
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Credit Amount (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-mono">$</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={customTopUpAmount}
                    onChange={(e) => setCustomTopUpAmount(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-2 text-slate-900 dark:text-slate-100 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCustomTopUpModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleCreditWallet(customTopUpAmount)}
                  disabled={topUpLoading}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                >
                  {topUpLoading ? 'Processing...' : 'Confirm Top-Up'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Model Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Add Model Rate Card</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddModel} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Model ID / Name (exact or prefix)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., gemini-1.5-pro, claude-3-opus"
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">Provider</label>
                  <select
                    value={newProvider}
                    onChange={(e) => setNewProvider(e.target.value as any)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="google">Google Gemini</option>
                    <option value="anthropic">Anthropic Vertex</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">Cost Tier</label>
                  <select
                    value={newTier}
                    onChange={(e) => setNewTier(e.target.value as any)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="low">Low (Flash)</option>
                    <option value="medium">Medium</option>
                    <option value="high">High (Pro/Opus)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Input Rate ($/1M tokens)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    value={newInputRate}
                    onChange={(e) => setNewInputRate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Output Rate ($/1M tokens)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    value={newOutputRate}
                    onChange={(e) => setNewOutputRate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold shadow-md shadow-amber-500/20 cursor-pointer"
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
