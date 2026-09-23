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
  Search,
  Calculator,
  RotateCcw,
  X,
  CreditCard,
  User,
  Users,
  Box,
  Cpu,
  Check,
  Tag,
  Code2,
  Brain,
  Zap,
  Route,
  MessageSquare,
  Sparkles,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
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
  fetchAiProducts,
  updateAiProduct,
  resetAiProduct,
} from '../services/api';
import {
  RateCardDictionary,
  RatePlanInfo,
  DeveloperSubscription,
  DeveloperMonetizationConfig,
  GatewaySettings,
  UserMonetizationAttribution,
  ApiProduct,
} from '../types';
import { DEFAULT_SSO_USER } from '../services/defaultSettings';
import { GoogleLogo, AnthropicLogo } from './ProviderLogos';

// Provider logo/mark component replacing raw GOOG/ANTH text badges
const ModelProviderIcon = ({ model }: { model: string }) => {
  if (model === 'auto') {
    return (
      <div className="w-8 h-8 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 shadow-2xs shrink-0" title="Apigee Semantic Router">
        <Route className="w-4 h-4 text-purple-600" />
      </div>
    );
  }
  if (model.startsWith('gemini') || model.startsWith('gemma')) {
    return (
      <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-2xs shrink-0" title="Google DeepMind / Vertex AI">
        <GoogleLogo className="w-4.5 h-4.5" />
      </div>
    );
  }
  if (model.startsWith('claude')) {
    return (
      <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-2xs shrink-0" title="Anthropic on Vertex AI">
        <AnthropicLogo className="w-4.5 h-4.5" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs shrink-0" title="LLM">
      <Cpu className="w-4 h-4 text-slate-600" />
    </div>
  );
};

const CATALOG_MODELS = [
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', provider: 'google', desc: 'Ultra-low latency, cost-effective' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', provider: 'google', desc: 'Flagship fast multimodal reasoning' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', provider: 'google', desc: 'Frontier reasoning & advanced coding' },
  { id: 'claude-haiku-4-5@20251001', name: 'Claude 4.5 Haiku', provider: 'anthropic', desc: 'Lightweight Anthropic model (50 tpm on Standard demo)' },
  { id: 'claude-opus-4-5@20251101', name: 'Claude 4.5 Opus', provider: 'anthropic', desc: 'Anthropic flagship reasoning model' },
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', provider: 'google', desc: 'Hybrid reasoning model' },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'google', desc: 'Next-gen flash model' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', desc: 'Stable legacy flash model' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', desc: 'Stable legacy pro model' },
];

interface MonetizationManagerProps {
  currentEnv?: 'dev' | 'prod';
  settings?: GatewaySettings;
}

type MonetizationSubTab = 'products' | 'wallets' | 'rate-cards' | 'rate-plans';

export const MonetizationManager: React.FC<MonetizationManagerProps> = ({
  currentEnv = 'prod',
  settings,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<MonetizationSubTab>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('subtab') as MonetizationSubTab;
      if (p && ['products', 'wallets', 'rate-cards', 'rate-plans'].includes(p)) {
        return p;
      }
    }
    return 'products';
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
  // 0. AI Products & Entitlements State
  // -------------------------------------------------------------
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [, setProductDefaults] = useState<Record<string, ApiProduct>>({});
  const [editedProducts, setEditedProducts] = useState<Record<string, ApiProduct>>({});
  const [selectedProductName, setSelectedProductName] = useState<string>('Enterprise AI Tier');
  const [productConfigSection, setProductConfigSection] = useState<'models' | 'routing' | 'budget' | 'custom'>('models');
  const [productsLoading, setProductsLoading] = useState(false);
  const [productSaving, setProductSaving] = useState(false);
  const [productResetting, setProductResetting] = useState(false);
  const [showProductResetModal, setShowProductResetModal] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');
  const [newCustomAttrKey, setNewCustomAttrKey] = useState('');
  const [newCustomAttrVal, setNewCustomAttrVal] = useState('');

  const activeProduct = editedProducts[selectedProductName] || products.find((p) => p.name === selectedProductName);
  const originalProduct = products.find((p) => p.name === selectedProductName);
  const hasProductChanges = useMemo(() => {
    if (!activeProduct || !originalProduct) return false;
    return JSON.stringify(activeProduct) !== JSON.stringify(originalProduct);
  }, [activeProduct, originalProduct]);

  const loadAiProducts = async () => {
    setProductsLoading(true);
    try {
      const res = await fetchAiProducts();
      if (res.products && res.products.length > 0) {
        setProducts(res.products);
        setProductDefaults(res.defaults || {});
        const edits: Record<string, ApiProduct> = {};
        res.products.forEach((p) => {
          edits[p.name] = JSON.parse(JSON.stringify(p));
        });
        setEditedProducts(edits);
      }
    } catch (err: any) {
      console.warn('Failed to load AI products:', err.message);
    } finally {
      setProductsLoading(false);
    }
  };

  const handleSaveProduct = async () => {
    if (!activeProduct) return;
    setProductSaving(true);
    setError(null);
    try {
      const res = await updateAiProduct(selectedProductName, activeProduct);
      setProducts((prev) => prev.map((p) => (p.name === selectedProductName ? res.product : p)));
      setEditedProducts((prev) => ({
        ...prev,
        [selectedProductName]: JSON.parse(JSON.stringify(res.product)),
      }));
      setSuccessMessage(`Successfully updated ${selectedProductName} on Apigee Management API`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to save product');
    } finally {
      setProductSaving(false);
    }
  };

  const handleResetProduct = async (name: 'Standard AI Tier' | 'Enterprise AI Tier' | 'all') => {
    setProductResetting(true);
    setError(null);
    setShowProductResetModal(false);
    try {
      await resetAiProduct(name);
      await loadAiProducts();
      setSuccessMessage(
        name === 'all'
          ? 'Successfully restored all AI products to canonical demo defaults'
          : `Successfully restored ${name} to canonical demo defaults`
      );
      setTimeout(() => setSuccessMessage(null), 4500);
    } catch (err: any) {
      setError(err.message || 'Failed to reset product');
    } finally {
      setProductResetting(false);
    }
  };

  const handleRevertProduct = () => {
    if (!originalProduct) return;
    setEditedProducts((prev) => ({
      ...prev,
      [selectedProductName]: JSON.parse(JSON.stringify(originalProduct)),
    }));
  };

  const updateCurrentProduct = (updater: (p: ApiProduct) => void) => {
    if (!activeProduct) return;
    const clone: ApiProduct = JSON.parse(JSON.stringify(activeProduct));
    updater(clone);
    setEditedProducts((prev) => ({
      ...prev,
      [selectedProductName]: clone,
    }));
  };

  const configuredModels = useMemo(() => {
    if (!activeProduct?.llmOperationGroup?.operationConfigs) return [];
    const configs = activeProduct.llmOperationGroup.operationConfigs;
    const map = new Map<string, {
      model: string;
      resource: string;
      limit: string;
      interval: string;
      timeUnit: string;
    }>();

    configs.forEach((cfg) => {
      cfg.llmOperations?.forEach((op) => {
        const m = op.model;
        if (!map.has(m)) {
          map.set(m, {
            model: m,
            resource: op.resource,
            limit: cfg.llmTokenQuota?.limit || '2000',
            interval: cfg.llmTokenQuota?.interval || '1',
            timeUnit: cfg.llmTokenQuota?.timeUnit || 'minute',
          });
        }
      });
    });

    return Array.from(map.values());
  }, [activeProduct]);

  const handleUpdateModelQuota = (modelName: string, field: 'limit' | 'interval' | 'timeUnit', val: string) => {
    updateCurrentProduct((p) => {
      p.llmOperationGroup?.operationConfigs?.forEach((cfg) => {
        if (cfg.llmOperations?.some((op) => op.model === modelName)) {
          if (!cfg.llmTokenQuota) {
            cfg.llmTokenQuota = { limit: '2000', interval: '1', timeUnit: 'minute' };
          }
          cfg.llmTokenQuota[field] = val;
        }
      });
    });
  };

  const handleRemoveModel = (modelName: string) => {
    updateCurrentProduct((p) => {
      if (!p.llmOperationGroup?.operationConfigs) return;
      p.llmOperationGroup.operationConfigs = p.llmOperationGroup.operationConfigs.filter(
        (cfg) => !cfg.llmOperations?.some((op) => op.model === modelName)
      );
    });
  };

  const handleAddProductModel = (modelName: string, defaultQuota = { limit: '2000', interval: '1', timeUnit: 'minute' }) => {
    const trimmed = modelName.trim();
    if (!trimmed) return;
    updateCurrentProduct((p) => {
      if (!p.llmOperationGroup) p.llmOperationGroup = { operationConfigs: [] };
      if (!p.llmOperationGroup.operationConfigs) p.llmOperationGroup.operationConfigs = [];
      const exists = p.llmOperationGroup.operationConfigs.some((cfg) =>
        cfg.llmOperations?.some((op) => op.model === trimmed)
      );
      if (exists) return;

      if (trimmed === 'auto') {
        p.llmOperationGroup.operationConfigs.push(
          {
            apiSource: 'ai-gateway-v1',
            llmOperations: [{ resource: '/auto', methods: ['POST'], model: 'auto' }],
            llmTokenQuota: { ...defaultQuota },
          },
          {
            apiSource: 'ai-gateway-v1',
            llmOperations: [{ resource: '/auto:*', methods: ['POST'], model: 'auto' }],
            llmTokenQuota: { ...defaultQuota },
          }
        );
      } else {
        p.llmOperationGroup.operationConfigs.push({
          apiSource: 'ai-gateway-v1',
          llmOperations: [{ resource: `/models/${trimmed}:*`, methods: ['POST'], model: trimmed }],
          llmTokenQuota: { ...defaultQuota },
        });
      }
    });
    setCustomModelInput('');
  };

  const getProductAttr = (name: string): string => {
    const found = activeProduct?.attributes?.find((a) => a.name === name);
    return found ? found.value : '';
  };

  const setProductAttr = (name: string, value: string) => {
    updateCurrentProduct((p) => {
      if (!p.attributes) p.attributes = [];
      const idx = p.attributes.findIndex((a) => a.name === name);
      if (idx >= 0) {
        p.attributes[idx].value = value;
      } else {
        p.attributes.push({ name, value });
      }
    });
  };

  const removeProductAttr = (name: string) => {
    updateCurrentProduct((p) => {
      if (!p.attributes) return;
      p.attributes = p.attributes.filter((a) => a.name !== name);
    });
  };

  const customAttributesList = useMemo(() => {
    return (activeProduct?.attributes || []).filter(
      (a: { name: string; value: string }) =>
        !a.name.startsWith('routing.model.') &&
        !a.name.startsWith('developer.budget.')
    );
  }, [activeProduct]);

  const budgetMicros = parseInt(getProductAttr('developer.budget.limit') || '0', 10);
  const budgetUsd = !isNaN(budgetMicros) && budgetMicros > 0 ? (budgetMicros / 1000000).toFixed(2) : '0.00';

  const handleBudgetUsdChange = (val: string) => {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) return;
    const micros = Math.round(num * 1000000).toString();
    setProductAttr('developer.budget.limit', micros);
  };

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
  const [calcModel, setCalcModel] = useState<string>('gemini-3-flash-preview');
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

  // Available Developers loaded dynamically from Management API (sorted alphabetically by name)
  const availableDevelopers = useMemo(() => {
    if (liveAttributions.length > 0) {
      const list = liveAttributions.map((a) => ({
        email: a.userEmail,
        name: a.name || a.userEmail.split('@')[0],
        badge: a.badge,
      }));
      return list.sort((a, b) => {
        const nameA = (a.name || a.email).toLowerCase();
        const nameB = (b.name || b.email).toLowerCase();
        const cmp = nameA.localeCompare(nameB);
        return cmp !== 0 ? cmp : a.email.localeCompare(b.email);
      });
    }
    return [
      { email: defaultEmail, name: defaultEmail.split('@')[0], badge: 'SSO Caller' },
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
      setError(err.message || 'Failed to load model rate card');
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

  // Load Developer Attributions from Management API
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
  const handleRefreshAll = async (isManual = false) => {
    setError(null);
    await Promise.all([
      loadAiProducts(),
      loadWalletData(selectedDeveloper),
      loadKvmRates(),
      loadPlansAndSubscriptions(selectedDeveloper),
      loadAttributions(),
    ]);
    if (isManual) {
      setSuccessMessage('Synchronized all monetization and pricing data with the gateway');
      setTimeout(() => setSuccessMessage(null), 3500);
    }
  };

  useEffect(() => {
    loadAiProducts();
  }, []);

  useEffect(() => {
    handleRefreshAll(false);
  }, [selectedDeveloper, defaultEmail, env]);

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
      setSuccessMessage('Saved model rates');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update rates');
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

  const rawWalletAmountExact = useMemo(() => {
    const units = walletBalance.units || '0';
    const nanos = walletBalance.nanos || 0;
    const fractional = ((Number(nanos) || 0) / 1_000_000_000).toFixed(6).slice(2);
    return `${units}.${fractional}`;
  }, [walletBalance]);

  const displayWalletAmount = useMemo(() => {
    if (isSimulatingExhaustedWallet) return '0.00';
    const units = walletBalance.units || '0';
    const nanos = walletBalance.nanos || 0;
    const total = Number(units) + (Number(nanos) || 0) / 1_000_000_000;
    return total.toFixed(2);
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
  }, [liveAttributions, selectedDeveloper, defaultEmail, walletBalance, isSimulatingExhaustedWallet, userAttributionSearch]);

  // Enterprise User & Persona Attribution Table Sorting
  type AttributionSortColumn = 'name' | 'tier' | 'billing' | 'consumed' | 'balance' | 'quota';
  type SortDirection = 'asc' | 'desc';

  const [attributionSortColumn, setAttributionSortColumn] = useState<AttributionSortColumn>('name');
  const [attributionSortDirection, setAttributionSortDirection] = useState<SortDirection>('asc');

  const handleAttributionSort = (col: AttributionSortColumn) => {
    if (attributionSortColumn === col) {
      setAttributionSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setAttributionSortColumn(col);
      setAttributionSortDirection(
        col === 'consumed' || col === 'balance' || col === 'quota' ? 'desc' : 'asc'
      );
    }
  };

  const sortedUserAttributions = useMemo(() => {
    const list = [...userAttributions];
    list.sort((a, b) => {
      let cmp = 0;
      switch (attributionSortColumn) {
        case 'name': {
          const nameA = (a.name || a.userEmail).toLowerCase();
          const nameB = (b.name || b.userEmail).toLowerCase();
          cmp = nameA.localeCompare(nameB);
          if (cmp === 0) {
            cmp = a.userEmail.localeCompare(b.userEmail);
          }
          break;
        }
        case 'tier': {
          const tierA = (a.badge || a.tier || '').toLowerCase();
          const tierB = (b.badge || b.tier || '').toLowerCase();
          cmp = tierA.localeCompare(tierB);
          if (cmp === 0) {
            const nameA = (a.name || a.userEmail).toLowerCase();
            const nameB = (b.name || b.userEmail).toLowerCase();
            cmp = nameA.localeCompare(nameB);
          }
          break;
        }
        case 'billing': {
          cmp = (a.billingType || '').localeCompare(b.billingType || '');
          if (cmp === 0) {
            const nameA = (a.name || a.userEmail).toLowerCase();
            const nameB = (b.name || b.userEmail).toLowerCase();
            cmp = nameA.localeCompare(nameB);
          }
          break;
        }
        case 'consumed': {
          const valA = Number(a.totalConsumedUsd) || 0;
          const valB = Number(b.totalConsumedUsd) || 0;
          cmp = valA - valB;
          if (cmp === 0) {
            cmp = (a.totalTokens || 0) - (b.totalTokens || 0);
          }
          if (cmp === 0) {
            const nameA = (a.name || a.userEmail).toLowerCase();
            const nameB = (b.name || b.userEmail).toLowerCase();
            cmp = nameA.localeCompare(nameB);
          }
          break;
        }
        case 'balance': {
          const balA = Number(a.currentBalanceUsd) || 0;
          const balB = Number(b.currentBalanceUsd) || 0;
          cmp = balA - balB;
          if (cmp === 0) {
            const nameA = (a.name || a.userEmail).toLowerCase();
            const nameB = (b.name || b.userEmail).toLowerCase();
            cmp = nameA.localeCompare(nameB);
          }
          break;
        }
        case 'quota': {
          const totalAllocA = (a.totalConsumedUsd || 0) + (a.currentBalanceUsd || 0);
          const pctA = totalAllocA > 0 ? (a.totalConsumedUsd || 0) / totalAllocA : 0;
          const totalAllocB = (b.totalConsumedUsd || 0) + (b.currentBalanceUsd || 0);
          const pctB = totalAllocB > 0 ? (b.totalConsumedUsd || 0) / totalAllocB : 0;
          cmp = pctA - pctB;
          if (cmp === 0) {
            const valA = Number(a.totalConsumedUsd) || 0;
            const valB = Number(b.totalConsumedUsd) || 0;
            cmp = valA - valB;
          }
          if (cmp === 0) {
            const nameA = (a.name || a.userEmail).toLowerCase();
            const nameB = (b.name || b.userEmail).toLowerCase();
            cmp = nameA.localeCompare(nameB);
          }
          break;
        }
        default:
          cmp = 0;
      }
      return attributionSortDirection === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [userAttributions, attributionSortColumn, attributionSortDirection]);

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-y-auto">
      {/* Admin Console Header: section tabs + live account controls in one row */}
      <div className="border-b border-slate-200 bg-white/95 px-4 sm:px-6 py-2.5 backdrop-blur">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          {/* Section Navigation Strip: Sleek Segmented Control */}
          <div className="flex items-center overflow-x-auto">
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveSubTab('products')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer shrink-0 ${
                  activeSubTab === 'products'
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Box className="w-3.5 h-3.5 text-blue-600" />
                <span>AI Products</span>
                {hasProductChanges && (
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab('wallets')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer shrink-0 ${
                  activeSubTab === 'wallets'
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Developer Wallets & Credits</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab('rate-cards')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer shrink-0 ${
                  activeSubTab === 'rate-cards'
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Coins className="w-3.5 h-3.5 text-amber-600" />
                <span>Model Rate Cards</span>
                {hasRateChanges && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab('rate-plans')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer shrink-0 ${
                  activeSubTab === 'rate-plans'
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600" />
                <span>Product Rate Plans & Subscriptions</span>
              </button>
            </div>
          </div>

          {/* Quick Header Actions: Developer Selector, Active Wallet Chip & Refresh */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Developer Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs shadow-2xs">
              <User className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              <span className="text-slate-500 text-[11px] font-semibold">Dev:</span>
              <select
                value={selectedDeveloper}
                onChange={(e) => setSelectedDeveloper(e.target.value)}
                className="bg-transparent text-slate-800 font-sans text-xs focus:outline-none cursor-pointer max-w-[210px] truncate font-medium"
                title="Select Developer Account to Inspect & Manage"
              >
                {availableDevelopers.map((d) => (
                  <option key={d.email} value={d.email} className="bg-white text-slate-900 font-sans">
                    {d.name ? `${d.name} (${d.email})` : d.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Live Wallet Chip */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs shadow-2xs"
              title={`Exact balance: $${rawWalletAmountExact} USD`}
            >
              <Wallet className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-slate-500 text-[11px] font-semibold">Wallet:</span>
              <span className={`font-mono font-bold ${isSimulatingExhaustedWallet ? 'text-rose-600 line-through' : 'text-emerald-600'}`}>
                ${displayWalletAmount} <span className="text-[10px] font-normal text-slate-500 font-sans">USD</span>
              </span>
              {isSimulatingExhaustedWallet && (
                <span className="text-[9px] bg-rose-50 text-rose-700 px-1 py-0.2 rounded border border-rose-200 font-semibold">
                  403
                </span>
              )}
            </div>

            {/* Quick Refresh */}
            <button
              type="button"
              onClick={() => handleRefreshAll(true)}
              disabled={walletLoading || ratesLoading || plansLoading || productsLoading}
              className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer shadow-2xs disabled:opacity-50"
              title="Synchronize all data from Management API"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${walletLoading || ratesLoading || plansLoading || productsLoading ? 'animate-spin text-emerald-500' : 'text-slate-500'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 w-full space-y-3.5 flex-1">
        {/* Status Alerts */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* SUB-TAB 0: AI PRODUCTS & ENTITLEMENTS */}
        {activeSubTab === 'products' && (
          <div className="space-y-3">
            {/* Unified Command Bar: Tiers, Apigee Metadata & Actions */}
            <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
              {/* Left: Tier Switcher (Enterprise AI Tier First) */}
              <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-lg border border-slate-200/80">
                {['Enterprise AI Tier', 'Standard AI Tier'].map((tierName) => {
                  const isSelected = selectedProductName === tierName;
                  const isEnterprise = tierName === 'Enterprise AI Tier';
                  const prod = editedProducts[tierName] || products.find((p) => p.name === tierName);
                  const orig = products.find((p) => p.name === tierName);
                  const isDirty = prod && orig && JSON.stringify(prod) !== JSON.stringify(orig);
                  const modelCount = prod?.llmOperationGroup?.operationConfigs?.length || 0;

                  return (
                    <button
                      key={tierName}
                      type="button"
                      onClick={() => setSelectedProductName(tierName)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                        isSelected
                          ? isEnterprise
                            ? 'bg-purple-600 text-white shadow-2xs'
                            : 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                      }`}
                    >
                      {isEnterprise ? <Sparkles className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                      <span>{tierName}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-normal ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {modelCount} models
                      </span>
                      {isDirty && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Unsaved changes" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowProductResetModal(true)}
                  disabled={productResetting || productsLoading}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-semibold transition cursor-pointer shadow-2xs disabled:opacity-50"
                  title="Restore default models, rate limits, and routing from canonical demo configurations"
                >
                  <RotateCcw className={`w-3 h-3 ${productResetting ? 'animate-spin' : ''}`} />
                  <span>{productResetting ? 'Resetting...' : 'Reset Defaults'}</span>
                </button>

                {hasProductChanges && (
                  <button
                    type="button"
                    onClick={handleRevertProduct}
                    disabled={productSaving}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer"
                  >
                    <span>Revert</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSaveProduct}
                  disabled={!hasProductChanges || productSaving || productsLoading}
                  className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer ${
                    hasProductChanges && !productSaving
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  }`}
                  title="Deploy changes directly to Apigee Management API"
                >
                  <Save className={`w-3 h-3 ${productSaving ? 'animate-spin' : ''}`} />
                  <span>{productSaving ? 'Saving...' : 'Save to Apigee'}</span>
                </button>
              </div>
            </div>

            {/* Product Configuration Categories Navigation */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {/* Tab 1: Whitelisted Models & Rate Limits */}
              <button
                type="button"
                onClick={() => setProductConfigSection('models')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  productConfigSection === 'models'
                    ? 'bg-blue-50/90 border-blue-500 text-blue-950 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${productConfigSection === 'models' ? 'bg-blue-600 text-white shadow-2xs' : 'bg-blue-100 text-blue-700'}`}>
                    <Cpu className="w-3.5 h-3.5" />
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    productConfigSection === 'models' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200/80'
                  }`}>
                    {configuredModels.length} {configuredModels.length === 1 ? 'model' : 'models'}
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900 leading-snug">Whitelisted Models & Quotas</div>
                <div className="text-[10px] text-slate-500 leading-tight mt-0.5 truncate">Per-model token rate limits</div>
              </button>

              {/* Tab 2: Prompt Auto-Routing Targets */}
              <button
                type="button"
                onClick={() => setProductConfigSection('routing')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  productConfigSection === 'routing'
                    ? 'bg-purple-50/90 border-purple-500 text-purple-950 ring-2 ring-purple-500/20 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${productConfigSection === 'routing' ? 'bg-purple-600 text-white shadow-2xs' : 'bg-purple-100 text-purple-700'}`}>
                    <Route className="w-3.5 h-3.5" />
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    productConfigSection === 'routing' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200/80'
                  }`}>
                    4 targets
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900 leading-snug">Auto-Routing Model Mapping</div>
                <div className="text-[10px] text-slate-500 leading-tight mt-0.5 truncate">Target models for auto requests</div>
              </button>

              {/* Tab 3: Developer Budget Governance */}
              <button
                type="button"
                onClick={() => setProductConfigSection('budget')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  productConfigSection === 'budget'
                    ? 'bg-emerald-50/90 border-emerald-500 text-emerald-950 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${productConfigSection === 'budget' ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-emerald-100 text-emerald-700'}`}>
                    <Coins className="w-3.5 h-3.5" />
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    productConfigSection === 'budget' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200/80'
                  }`}>
                    ${budgetUsd}/mo
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900 leading-snug">Budget Governance</div>
                <div className="text-[10px] text-slate-500 leading-tight mt-0.5 truncate">Periodic spending limits</div>
              </button>

              {/* Tab 4: Custom Attributes */}
              <button
                type="button"
                onClick={() => setProductConfigSection('custom')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  productConfigSection === 'custom'
                    ? 'bg-amber-50/90 border-amber-500 text-amber-950 ring-2 ring-amber-500/20 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${productConfigSection === 'custom' ? 'bg-amber-600 text-white shadow-2xs' : 'bg-amber-100 text-amber-700'}`}>
                    <Tag className="w-3.5 h-3.5" />
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    productConfigSection === 'custom' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200/80'
                  }`}>
                    {customAttributesList.length} {customAttributesList.length === 1 ? 'attr' : 'attrs'}
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900 leading-snug">Custom Attributes</div>
                <div className="text-[10px] text-slate-500 leading-tight mt-0.5 truncate">Key-value product metadata</div>
              </button>
            </div>

            {/* CARD 1: Whitelisted Models & Token Rate Quotas */}
            {productConfigSection === 'models' && (
              <div className="bg-white rounded-xl border-2 border-blue-200/90 shadow-xs overflow-hidden">
                <div className="bg-slate-50/90 px-4 py-2.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xs font-bold text-slate-900">
                          Whitelisted Models & Rate Limits (Token Quotas)
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Restricts proxy routing to allowed models and enforces per-model token rate limits for this tier.
                      </p>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono font-semibold text-blue-800 bg-white border border-blue-200 px-2.5 py-1 rounded-lg shrink-0 shadow-2xs self-start sm:self-auto">
                    {configuredModels.length} active models
                  </div>
                </div>

                <div className="p-3.5 space-y-2.5">
                  {/* Models List */}
                  <div className="space-y-2">
                    {configuredModels.map((m) => {
                      const isHaiku = m.model === 'claude-haiku-4-5@20251001';
                      const isAuto = m.model === 'auto';
                      const isLowLimit = parseInt(m.limit, 10) <= 100;

                      return (
                        <div
                          key={m.model}
                          className={`p-2.5 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                            isHaiku && isLowLimit
                              ? 'bg-amber-50/60 border-amber-200'
                              : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-[240px]">
                            <ModelProviderIcon model={m.model} />
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold text-slate-900">{m.model}</span>
                                {isAuto && (
                                  <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded-full border border-purple-200">
                                    Auto-Routed
                                  </span>
                                )}
                                {isHaiku && isLowLimit && (
                                  <span className="text-[10px] font-semibold bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded-full border border-rose-200">
                                    429 Trigger (50 tpm)
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Resource: {m.resource}
                              </div>
                            </div>
                          </div>

                          {/* Quota inputs and preset pills */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-2xs">
                              <span className="text-[11px] font-semibold text-slate-500">Quota:</span>
                              <input
                                type="number"
                                min="1"
                                value={m.limit}
                                onChange={(e) => handleUpdateModelQuota(m.model, 'limit', e.target.value)}
                                className="w-16 font-mono text-xs font-bold text-slate-900 text-right bg-slate-50 rounded px-1 py-0.5 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <span className="text-[10px] text-slate-400">tokens /</span>
                              <input
                                type="number"
                                min="1"
                                value={m.interval}
                                onChange={(e) => handleUpdateModelQuota(m.model, 'interval', e.target.value)}
                                className="w-10 font-mono text-xs font-bold text-slate-900 text-center bg-slate-50 rounded px-1 py-0.5 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <select
                                value={m.timeUnit}
                                onChange={(e) => handleUpdateModelQuota(m.model, 'timeUnit', e.target.value)}
                                className="text-xs font-mono text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                              >
                                <option value="minute">minute</option>
                                <option value="hour">hour</option>
                                <option value="day">day</option>
                                <option value="week">week</option>
                                <option value="month">month</option>
                              </select>
                            </div>

                            {/* Quick Presets */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleUpdateModelQuota(m.model, 'limit', '50')}
                                className={`px-1.5 py-1 rounded-md text-[10px] font-mono font-medium transition cursor-pointer border ${
                                  m.limit === '50'
                                    ? 'bg-rose-50 text-rose-700 border-rose-300 font-bold'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                                title="Set to 50 tokens (triggers 429 quota exhaustion on 1 prompt)"
                              >
                                50 tpm
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateModelQuota(m.model, 'limit', '2000')}
                                className={`px-1.5 py-1 rounded-md text-[10px] font-mono font-medium transition cursor-pointer border ${
                                  m.limit === '2000'
                                    ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                                title="Set to 2,000 tokens (Standard default)"
                              >
                                2k
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateModelQuota(m.model, 'limit', '50000')}
                                className={`px-1.5 py-1 rounded-md text-[10px] font-mono font-medium transition cursor-pointer border ${
                                  m.limit === '50000'
                                    ? 'bg-purple-50 text-purple-700 border-purple-300 font-bold'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                                title="Set to 50,000 tokens (Enterprise default)"
                              >
                                50k
                              </button>
                            </div>

                            {/* Remove Button */}
                            {!isAuto && (
                              <button
                                type="button"
                                onClick={() => handleRemoveModel(m.model)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                title={`Remove ${m.model} from tier`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Models Controls */}
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <span className="text-xs font-semibold text-slate-700">Quick-Add Catalog Models:</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {CATALOG_MODELS.filter((cat) => !configuredModels.some((m) => m.model === cat.id)).map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handleAddProductModel(cat.id, selectedProductName === 'Enterprise AI Tier' ? { limit: '50000', interval: '1', timeUnit: 'minute' } : { limit: '2000', interval: '1', timeUnit: 'minute' })}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border border-slate-200 text-xs text-slate-700 transition cursor-pointer shadow-2xs"
                          title={cat.desc}
                        >
                          {cat.provider === 'google' ? <GoogleLogo className="w-3.5 h-3.5 shrink-0" /> : <AnthropicLogo className="w-3.5 h-3.5 shrink-0" />}
                          <span className="font-semibold">{cat.name}</span>
                          <Plus className="w-3 h-3 ml-0.5 text-slate-400" />
                        </button>
                      ))}
                    </div>

                    {/* Custom Model Input */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={customModelInput}
                        onChange={(e) => setCustomModelInput(e.target.value)}
                        placeholder="Custom Model ID (e.g. meta/llama-3.3-70b or mistral-large)..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddProductModel(customModelInput)}
                        disabled={!customModelInput.trim()}
                        className="flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50 shadow-xs"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Model</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CARD 2: Prompt Auto-Routing Targets */}
            {productConfigSection === 'routing' && (
              <div className="bg-white rounded-xl border-2 border-purple-200/90 shadow-xs overflow-hidden">
                <div className="bg-purple-50/50 px-4 py-2.5 border-b border-purple-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <Route className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xs font-bold text-slate-900">
                          Auto-Routing Model Mappings
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        When callers request <code className="font-mono text-purple-700 font-semibold">auto</code>, the gateway analyzes prompt task complexity and directs traffic to the designated target model.
                      </p>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono font-semibold text-purple-800 bg-white border border-purple-200 px-2.5 py-1 rounded-lg shrink-0 shadow-2xs self-start sm:self-auto">
                    4 routing targets
                  </div>
                </div>

                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      {
                        key: 'routing.model.coding',
                        label: 'Coding & Development',
                        desc: 'Directed here when prompt involves code generation, debugging, refactoring, or syntax.',
                        icon: Code2,
                        iconColor: 'text-blue-600 bg-blue-50 border-blue-200',
                      },
                      {
                        key: 'routing.model.deep_reasoning',
                        label: 'Complex Reasoning & Math',
                        desc: 'Directed here for multi-step logic, problem solving, architecture planning, and math.',
                        icon: Brain,
                        iconColor: 'text-purple-600 bg-purple-50 border-purple-200',
                      },
                      {
                        key: 'routing.model.simple',
                        label: 'Quick Lookups & Facts',
                        desc: 'Directed here for fast factual answers, dictionary lookups, and short questions.',
                        icon: Zap,
                        iconColor: 'text-amber-600 bg-amber-50 border-amber-200',
                      },
                      {
                        key: 'routing.model.general',
                        label: 'General Tasks & Dialogue',
                        desc: 'Default catch-all for broad creative writing, general assistance, and dialogue.',
                        icon: MessageSquare,
                        iconColor: 'text-emerald-600 bg-emerald-50 border-emerald-200',
                      },
                    ].map(({ key, label, desc, icon: IconComponent, iconColor }) => {
                      const currentTarget = getProductAttr(key);
                      return (
                        <div key={key} className="bg-slate-50/80 rounded-xl border border-slate-200 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-md flex items-center justify-center border ${iconColor}`}>
                                <IconComponent className="w-3 h-3" />
                              </div>
                              <span className="text-xs font-bold text-slate-900">{label}</span>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-relaxed">{desc}</p>
                          <div className="pt-0.5">
                            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-2.5 py-1 shadow-2xs focus-within:ring-1 focus-within:ring-purple-500">
                              <span className="text-[11px] font-semibold text-slate-400">Target:</span>
                              <select
                                value={currentTarget}
                                onChange={(e) => setProductAttr(key, e.target.value)}
                                className="flex-1 bg-transparent text-xs font-mono font-bold text-slate-900 focus:outline-none cursor-pointer"
                              >
                                {configuredModels.filter((m) => m.model !== 'auto').map((m) => (
                                  <option key={m.model} value={m.model}>
                                    {m.model}
                                  </option>
                                ))}
                                {currentTarget && !configuredModels.some((m) => m.model === currentTarget) && (
                                  <option value={currentTarget}>{currentTarget}</option>
                                )}
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* CARD 3: Developer Monthly Budget Cap */}
            {productConfigSection === 'budget' && (
              <div className="bg-white rounded-xl border-2 border-emerald-200/90 shadow-xs overflow-hidden">
                <div className="bg-emerald-50/50 px-4 py-2.5 border-b border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <Coins className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xs font-bold text-slate-900">
                          Developer Budget Governance
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Enforces developer spending caps and periodic budget ceilings across gateway traffic.
                      </p>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono font-semibold text-emerald-800 bg-white border border-emerald-200 px-2.5 py-1 rounded-lg shrink-0 shadow-2xs self-start sm:self-auto">
                    ${budgetUsd} USD cap
                  </div>
                </div>

                <div className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/80 p-3 rounded-xl border border-slate-200">
                    <div>
                      <div className="text-xs font-bold text-slate-900">Periodic Spending Ceiling</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Enterprise default: $20.00 / month • Standard default: $5.00 / month
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-white border border-slate-300 rounded-lg px-2.5 py-1 shadow-2xs">
                        <span className="text-slate-400 font-mono text-xs mr-1">$</span>
                        <input
                          type="number"
                          step="0.50"
                          min="0"
                          value={budgetUsd}
                          onChange={(e) => handleBudgetUsdChange(e.target.value)}
                          className="w-16 text-xs font-mono font-bold text-slate-900 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400 font-sans ml-1">USD</span>
                      </div>

                      <span className="text-xs text-slate-400">per</span>
                      <input
                        type="number"
                        min="1"
                        value={getProductAttr('developer.budget.interval') || '1'}
                        onChange={(e) => setProductAttr('developer.budget.interval', e.target.value)}
                        className="w-10 bg-white border border-slate-300 rounded-lg px-1.5 py-1 text-xs font-mono font-bold text-slate-900 text-center shadow-2xs focus:outline-none"
                      />

                      <select
                        value={getProductAttr('developer.budget.timeunit') || 'month'}
                        onChange={(e) => setProductAttr('developer.budget.timeunit', e.target.value)}
                        className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono text-slate-700 shadow-2xs focus:outline-none cursor-pointer"
                      >
                        <option value="minute">minute</option>
                        <option value="hour">hour</option>
                        <option value="day">day</option>
                        <option value="week">week</option>
                        <option value="month">month</option>
                        <option value="year">year</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CARD 4: Other Custom Attributes */}
            {productConfigSection === 'custom' && (
              <div className="bg-white rounded-xl border-2 border-amber-200/90 shadow-xs overflow-hidden">
                <div className="bg-amber-50/50 px-4 py-2.5 border-b border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <Tag className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xs font-bold text-slate-900">
                          Other Custom Attributes
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Additional custom key-value metadata attached to this API Product for downstream governance and integrations.
                      </p>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono font-semibold text-amber-800 bg-white border border-amber-200 px-2.5 py-1 rounded-lg shrink-0 shadow-2xs self-start sm:self-auto">
                    {customAttributesList.length} custom attributes
                  </div>
                </div>

                <div className="p-4 space-y-2.5">
                  {customAttributesList.length === 0 ? (
                    <div className="text-xs text-slate-400 italic py-2">
                      No additional custom attributes defined on this product.
                    </div>
                  ) : (
                    customAttributesList.map((attr: { name: string; value: string }) => (
                      <div
                        key={attr.name}
                        className="flex items-center justify-between gap-2.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <span className="font-bold text-slate-800">{attr.name}</span>
                          <span className="text-slate-400">=</span>
                          <input
                            type="text"
                            value={attr.value}
                            onChange={(e) => setProductAttr(attr.name, e.target.value)}
                            className="flex-1 bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-700 text-xs focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeProductAttr(attr.name)}
                          className="text-slate-400 hover:text-rose-600 transition p-1 cursor-pointer"
                          title="Remove attribute"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}

                  {/* Add new attribute row */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="New attribute key..."
                      value={newCustomAttrKey}
                      onChange={(e) => setNewCustomAttrKey(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                    <input
                      type="text"
                      placeholder="New attribute value..."
                      value={newCustomAttrVal}
                      onChange={(e) => setNewCustomAttrVal(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!newCustomAttrKey.trim()) return;
                        setProductAttr(newCustomAttrKey.trim(), newCustomAttrVal.trim());
                        setNewCustomAttrKey('');
                        setNewCustomAttrVal('');
                      }}
                      disabled={!newCustomAttrKey.trim()}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 1: DEVELOPER WALLETS & TOP-UP */}
        {activeSubTab === 'wallets' && (
          <div className="space-y-6">
            {/* Fleet Overview KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Registered Accounts
                  </span>
                  <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                    {userAttributions.length}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Enterprise callers & developer personas
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Total Fleet Token Spend
                  </span>
                  <div className="text-2xl font-bold font-mono text-amber-600 mt-1">
                    ${userAttributions.reduce((acc, u) => acc + (u.totalConsumedUsd || 0), 0).toFixed(2)}{' '}
                    <span className="text-xs font-sans text-slate-500 font-normal">USD</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {userAttributions.reduce((acc, u) => acc + (u.totalCalls || 0), 0).toLocaleString()} calls • {(() => {
                      const tot = userAttributions.reduce((acc, u) => acc + (u.totalTokens || 0), 0);
                      return tot >= 1_000_000 ? `${(tot / 1e6).toFixed(2)}M tokens` : tot >= 1_000 ? `${(tot / 1e3).toFixed(1)}k tokens` : `${tot} tokens`;
                    })()}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                  <Coins className="w-5 h-5 text-amber-600" />
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Available Prepaid Pool
                  </span>
                  <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">
                    ${userAttributions.reduce((acc, u) => acc + (u.currentBalanceUsd || 0), 0).toFixed(2)}{' '}
                    <span className="text-xs font-sans text-slate-500 font-normal">USD</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                  <Wallet className="w-5 h-5 text-emerald-600" />
                </div>
              </div>
            </div>

            {/* Enterprise User & Persona Attribution: Consumed vs Balance */}
            <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Enterprise User & Persona Attribution (Consumed vs Balance)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
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
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* Attribution Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-semibold select-none">
                      <th
                        onClick={() => handleAttributionSort('name')}
                        className="pb-3 cursor-pointer hover:text-slate-900 transition group/th"
                        title="Click to sort by User & Persona"
                      >
                        <div className="flex items-center gap-1">
                          <span className={attributionSortColumn === 'name' ? 'text-slate-900 font-bold' : ''}>User & Persona</span>
                          {attributionSortColumn === 'name' ? (
                            attributionSortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover/th:text-slate-600 transition shrink-0 opacity-60 group-hover/th:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleAttributionSort('tier')}
                        className="pb-3 cursor-pointer hover:text-slate-900 transition group/th"
                        title="Click to sort by Entitlement Tier"
                      >
                        <div className="flex items-center gap-1">
                          <span className={attributionSortColumn === 'tier' ? 'text-slate-900 font-bold' : ''}>Entitlement Tier</span>
                          {attributionSortColumn === 'tier' ? (
                            attributionSortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover/th:text-slate-600 transition shrink-0 opacity-60 group-hover/th:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleAttributionSort('billing')}
                        className="pb-3 cursor-pointer hover:text-slate-900 transition group/th"
                        title="Click to sort by Billing Mode"
                      >
                        <div className="flex items-center gap-1">
                          <span className={attributionSortColumn === 'billing' ? 'text-slate-900 font-bold' : ''}>Billing Mode</span>
                          {attributionSortColumn === 'billing' ? (
                            attributionSortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover/th:text-slate-600 transition shrink-0 opacity-60 group-hover/th:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleAttributionSort('consumed')}
                        className="pb-3 cursor-pointer hover:text-slate-900 transition group/th"
                        title="Click to sort by Total Consumed"
                      >
                        <div className="flex items-center gap-1">
                          <span className={attributionSortColumn === 'consumed' ? 'text-slate-900 font-bold' : ''}>Total Consumed</span>
                          {attributionSortColumn === 'consumed' ? (
                            attributionSortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover/th:text-slate-600 transition shrink-0 opacity-60 group-hover/th:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleAttributionSort('balance')}
                        className="pb-3 cursor-pointer hover:text-slate-900 transition group/th"
                        title="Click to sort by Active Balance"
                      >
                        <div className="flex items-center gap-1">
                          <span className={attributionSortColumn === 'balance' ? 'text-slate-900 font-bold' : ''}>Active Balance</span>
                          {attributionSortColumn === 'balance' ? (
                            attributionSortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover/th:text-slate-600 transition shrink-0 opacity-60 group-hover/th:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleAttributionSort('quota')}
                        className="pb-3 cursor-pointer hover:text-slate-900 transition group/th"
                        title="Click to sort by Wallet Status & Quota"
                      >
                        <div className="flex items-center gap-1">
                          <span className={attributionSortColumn === 'quota' ? 'text-slate-900 font-bold' : ''}>Wallet Status & Quota</span>
                          {attributionSortColumn === 'quota' ? (
                            attributionSortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover/th:text-slate-600 transition shrink-0 opacity-60 group-hover/th:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-xs">
                    {sortedUserAttributions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                          No users or personas found matching &ldquo;{userAttributionSearch}&rdquo;
                        </td>
                      </tr>
                    ) : (
                      sortedUserAttributions.map((user) => {
                      const isSelected = user.userEmail.toLowerCase() === selectedDeveloper.toLowerCase();
                      const isPrepaid = user.billingType === 'PREPAID';
                      const isDepleted = isPrepaid && (user.currentBalanceUsd <= 0);

                      const totalAllocated = (user.totalConsumedUsd || 0) + (user.currentBalanceUsd || 0);
                      const consumedPct = totalAllocated > 0
                        ? Math.min(100, Math.round(((user.totalConsumedUsd || 0) / totalAllocated) * 100))
                        : 0;

                      return (
                        <tr
                          key={user.userEmail}
                          onClick={() => setSelectedDeveloper(user.userEmail)}
                          className={`cursor-pointer transition group ${
                            isSelected
                              ? 'bg-emerald-50/70'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          {/* User & Persona */}
                          <td className="py-3 font-sans">
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  isSelected
                                    ? 'bg-emerald-500 animate-pulse ring-2 ring-emerald-400/30'
                                    : isDepleted
                                    ? 'bg-rose-500'
                                    : isPrepaid
                                    ? 'bg-emerald-500'
                                    : 'bg-blue-400'
                                }`}
                              />
                              <div>
                                <div className="font-semibold text-slate-900 group-hover:text-slate-900 flex items-center gap-1.5">
                                  <span>{user.name}</span>
                                  {isSelected && (
                                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      ACTIVE
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  {user.userEmail}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Entitlement Tier */}
                          <td className="py-3 font-sans">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                              user.badge === 'Enterprise AI' || user.badge === 'SSO Caller' || user.tier?.includes('Enterprise')
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {user.badge || user.tier || 'Developer'}
                            </span>
                          </td>

                          {/* Billing Mode */}
                          <td className="py-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                              isPrepaid
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}>
                              {user.billingType}
                            </span>
                          </td>

                          {/* Consumed (Sum) */}
                          <td className="py-3">
                            <div
                              className="font-bold text-slate-900"
                              title={`Exact consumed: $${Number(user.totalConsumedUsd || 0).toFixed(6)} USD`}
                            >
                              ${Number(user.totalConsumedUsd || 0).toFixed(2)}{' '}
                              <span className="text-[10px] font-normal text-slate-500 font-sans">USD</span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-sans">
                              {(user.totalCalls || 0).toLocaleString()} calls • {(() => {
                                const tot = user.totalTokens || 0;
                                return tot >= 1_000_000 ? `${(tot / 1e6).toFixed(2)}M tokens` : tot >= 1_000 ? `${(tot / 1e3).toFixed(1)}k tokens` : `${tot} tokens`;
                              })()}
                            </div>
                          </td>

                          {/* Active Balance */}
                          <td className="py-3">
                            {isPrepaid ? (
                              <>
                                <div
                                  className={`font-bold ${isDepleted ? 'text-rose-600' : 'text-emerald-600'}`}
                                  title={`Exact balance: $${Number(user.currentBalanceUsd || 0).toFixed(6)} USD`}
                                >
                                  ${Number(user.currentBalanceUsd || 0).toFixed(2)}{' '}
                                  <span className="text-[10px] font-normal text-slate-500 font-sans">USD</span>
                                </div>
                                <div className="text-[10px] text-slate-500 font-sans">
                                  {isDepleted ? 'Depleted (403 Blocked)' : 'Prepaid Available'}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="font-bold text-slate-600">
                                  N/A <span className="text-[10px] font-normal text-slate-500 font-sans">(Invoiced)</span>
                                </div>
                                <div className="text-[10px] text-slate-500 font-sans">
                                  Postpaid Monthly
                                </div>
                              </>
                            )}
                          </td>

                          {/* Consumed vs Balance Health */}
                          <td className="py-3 w-48 font-sans">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px]">
                                {isPrepaid ? (
                                  <>
                                    <span className="text-slate-500 font-mono">{consumedPct}% Used</span>
                                    <span className={`font-mono font-semibold ${isDepleted ? 'text-rose-600' : 'text-emerald-600'}`}>
                                      {isDepleted ? 'DEPLETED' : 'HEALTHY'}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-slate-500 font-mono">Invoiced</span>
                                    <span className="font-mono font-semibold text-blue-600">POSTPAID</span>
                                  </>
                                )}
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                {isPrepaid ? (
                                  <div
                                    className={`h-full rounded-full ${
                                      isDepleted
                                        ? 'bg-rose-500'
                                        : consumedPct > 75
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${isDepleted ? 100 : Math.max(6, consumedPct)}%` }}
                                  />
                                ) : (
                                  <div
                                    className="h-full rounded-full bg-blue-400"
                                    style={{ width: '100%' }}
                                  />
                                )}
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
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
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
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 transition cursor-pointer flex items-center gap-1 shadow-xs"
                                title="Top up prepaid wallet credits for this user"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Credit</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 2: KVM MODEL RATE CARDS */}
        {activeSubTab === 'rate-cards' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by model ID (e.g., gemini-3.1, claude-opus, flash)..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setFilterProvider('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                      filterProvider === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterProvider('google')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                      filterProvider === 'google' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <GoogleLogo className="w-3.5 h-3.5" />
                    <span>Google</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterProvider('anthropic')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                      filterProvider === 'anthropic' ? 'bg-stone-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <AnthropicLogo className="w-3.5 h-3.5" />
                    <span>Anthropic</span>
                  </button>
                </div>

                {hasRateChanges && (
                  <button
                    type="button"
                    onClick={() => setRates(JSON.parse(JSON.stringify(initialRates)))}
                    disabled={ratesSaving}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Revert</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
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
                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  }`}
                >
                  <Save className={`w-3.5 h-3.5 ${ratesSaving ? 'animate-spin' : ''}`} />
                  <span>{ratesSaving ? 'Saving...' : 'Save to KVM'}</span>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200 font-bold">
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
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {ratesLoading ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-500" />
                          Loading live rate cards...
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
                          <tr key={modelId} className="hover:bg-slate-50 transition">
                            <td className="py-3 px-4 font-medium text-slate-900 flex items-center gap-2">
                              <span className={isDefault ? 'text-amber-600 font-bold' : 'text-slate-800'}>
                                {modelId}
                              </span>
                              {isDefault && (
                                <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-300">
                                  Default Fallback
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 font-sans">
                              {item.provider === 'anthropic' ? (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-stone-800 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md">
                                  <AnthropicLogo className="w-3 h-3" />
                                  <span>Anthropic Vertex</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                                  <GoogleLogo className="w-3 h-3" />
                                  <span>Google Gemini</span>
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 font-sans">
                              <select
                                value={item.tier || 'medium'}
                                onChange={(e) => handleTierChange(modelId, e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-[11px] font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                              >
                                <option value="low">Low (Flash)</option>
                                <option value="medium">Medium</option>
                                <option value="high">High (Pro/Opus)</option>
                              </select>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400">$</span>
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  value={item.input}
                                  onChange={(e) => handleRateChange(modelId, 'input', e.target.value)}
                                  className="w-24 bg-white border border-slate-300 hover:border-slate-400 focus:border-amber-500 rounded-lg px-2.5 py-1 text-slate-900 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-xs"
                                />
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400 font-mono text-xs">$</span>
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  value={item.output}
                                  onChange={(e) => handleRateChange(modelId, 'output', e.target.value)}
                                  className="w-24 bg-white border border-slate-300 hover:border-slate-400 focus:border-amber-500 rounded-lg px-2.5 py-1 text-slate-900 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-xs"
                                />
                              </div>
                            </td>

                            <td className="py-3 px-4 font-mono text-emerald-600 font-semibold">
                              ${sampleCallCost}
                            </td>

                            <td className="py-3 px-4 text-right font-sans">
                              {!isDefault && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteModel(modelId)}
                                  className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
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

            {/* Interactive Cost & Budget Simulator */}
            <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-amber-500" />
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                    Interactive Cost & Wallet Deduction Simulator
                  </h2>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  Simulates <span className="text-emerald-600 font-semibold">CalculateCost.js</span> rating logic
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">
                    Target Model
                  </label>
                  <select
                    value={calcModel}
                    onChange={(e) => setCalcModel(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer shadow-xs"
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
                    <label className="text-[10px] uppercase font-bold text-slate-500">Prompt Tokens</label>
                    <span className="font-mono text-amber-600 font-bold">{calcPromptTokens.toLocaleString()}</span>
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
                    <label className="text-[10px] uppercase font-bold text-slate-500">Output Tokens</label>
                    <span className="font-mono text-emerald-600 font-bold">{calcOutputTokens.toLocaleString()}</span>
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

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-center">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Calculated Cost</div>
                  <div className="text-lg font-bold text-amber-600 font-mono mt-0.5">
                    ${calculatedCost.total.toFixed(6)} <span className="text-xs text-slate-500 font-normal">USD</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Wallet Deduction: <span className="text-emerald-600 font-bold">{calculatedCost.micros}</span> micro-dollars
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 3: PRODUCT RATE PLANS & SUBSCRIPTIONS */}
        {activeSubTab === 'rate-plans' && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-purple-600" />
                    <span>Published Product Rate Plans</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Native Monetization rate plans attached to API Products for consumption rating
                  </p>
                </div>
              </div>

              {plansLoading ? (
                <div className="py-12 text-center text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-purple-500" />
                  Loading rate plans from the gateway...
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
                        className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3 relative overflow-hidden"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-purple-600 tracking-wider">
                              {plan.apiproduct}
                            </span>
                            <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                              {plan.displayName || plan.name}
                            </h4>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                              isPublished
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                          >
                            {plan.state}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-xs font-mono">
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase font-sans">Billing Cycle</div>
                            <div className="text-slate-800 mt-0.5">{plan.billingPeriod}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase font-sans">Currency</div>
                            <div className="text-emerald-600 mt-0.5 font-bold">{plan.currencyCode}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase font-sans">Pricing Model</div>
                            <div className="text-slate-800 mt-0.5 truncate">{plan.consumptionPricingType}</div>
                          </div>
                        </div>

                        <div className="text-[10px] font-mono text-slate-400 truncate pt-1 border-t border-slate-200">
                          ID: {plan.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Developer Active Subscriptions */}
            <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span>Active Developer Subscriptions for {selectedDeveloper}</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
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
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-slate-900">{prod}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5">
                          {isSubscribed ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-emerald-600 font-medium">Active Subscription</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                              <span className="text-rose-600 font-medium">Not Subscribed (403 Blocked)</span>
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
      </div>

      {/* Custom Top-Up Modal */}
      {showCustomTopUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-slate-900 text-base">Top-Up Prepaid Wallet</h3>
              </div>
              <button
                onClick={() => setShowCustomTopUpModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Developer Account
                </label>
                <input
                  type="text"
                  disabled
                  value={selectedDeveloper}
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Billing Mode</div>
                  <div className="text-xs font-bold font-mono text-slate-900">{monetizationConfig.billingType}</div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleBillingType}
                  disabled={configSaving}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium transition cursor-pointer disabled:opacity-50"
                  title="Switch between PREPAID (enforced limits) and POSTPAID"
                >
                  {configSaving ? 'Updating...' : `Switch to ${monetizationConfig.billingType === 'PREPAID' ? 'POSTPAID' : 'PREPAID'}`}
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Credit Amount (USD)
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">Instant Credit</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm">$</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={customTopUpAmount}
                    onChange={(e) => setCustomTopUpAmount(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl pl-8 pr-3 py-2 text-slate-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 shadow-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5 pt-2">
                  {['10', '25', '50', '100'].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCustomTopUpAmount(amt)}
                      className={`flex-1 py-1 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
                        customTopUpAmount === amt
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      }`}
                    >
                      +${amt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCustomTopUpModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer"
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
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-slate-900 text-base">Add Model Rate Card</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddModel} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Model ID / Name (exact or prefix)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., gemini-3.1-pro-preview, claude-opus-4-5@20251101"
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 shadow-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Provider</label>
                  <select
                    value={newProvider}
                    onChange={(e) => setNewProvider(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer shadow-xs"
                  >
                    <option value="google">Google Gemini</option>
                    <option value="anthropic">Anthropic Vertex</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Cost Tier</label>
                  <select
                    value={newTier}
                    onChange={(e) => setNewTier(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer shadow-xs"
                  >
                    <option value="low">Low (Flash)</option>
                    <option value="medium">Medium</option>
                    <option value="high">High (Pro/Opus)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Input Rate ($/1M tokens)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    value={newInputRate}
                    onChange={(e) => setNewInputRate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Output Rate ($/1M tokens)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    value={newOutputRate}
                    onChange={(e) => setNewOutputRate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 shadow-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer"
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

      {/* Product Reset Confirmation Modal */}
      {showProductResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reset to Demo Defaults</h3>
                  <p className="text-xs text-slate-500">Restore canonical Apigee configurations</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProductResetModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This will restore the canonical product configurations, default model rate limits, routing intents, and budget caps.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 space-y-1.5">
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Restores Standard AI Tier Demo Rate Limits</span>
              </div>
              <p className="text-slate-500 pl-5">
                Sets Claude Haiku back to 50 tokens/min to ensure rate-limit demo scenarios function reliably.
              </p>
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Restores Default Auto-Routing Targets</span>
              </div>
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Restores Developer Budget Caps ($5.00 & $20.00)</span>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowProductResetModal(false)}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleResetProduct(selectedProductName as any)}
                disabled={productResetting}
                className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {productResetting ? 'Resetting...' : `Reset ${selectedProductName}`}
              </button>
              <button
                type="button"
                onClick={() => handleResetProduct('all')}
                disabled={productResetting}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {productResetting ? 'Resetting All...' : 'Reset All Tiers'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
