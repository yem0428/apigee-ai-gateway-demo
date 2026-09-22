import React, { useState, useMemo, useEffect } from 'react';
import {
  Coins,
  Wallet,
  Sparkles,
  Database,
  Bot,
  Zap,
  Filter,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  TableProperties,
  Info,
  User,
  ScrollText,
} from 'lucide-react';
import { GatewaySettings, UserConsumptionRecord, UserMonetizationAttribution } from '../types';
import { DEFAULT_SSO_USER } from '../services/defaultSettings';
import { DonutPieChart, DonutSlice } from './DonutPieChart';
import { CallLogsModal } from './CallLogsModal';
import { fetchFleetAnalytics, FleetAnalyticsResponse, fetchDeveloperAttributions } from '../services/api';

export interface AnalyticsDashboardProps {
  settings: GatewaySettings;
  viewMode?: 'admin' | 'user';
  timeRange?: '24h' | '7d' | '30d';
  setLoading?: (loading: boolean) => void;
  registerRefresh?: (fn: () => void) => void;
  userFilter?: string;
  onUserFilterChange?: (user: string) => void;
  onUserListChange?: (users: { email: string; name?: string }[]) => void;
}

type SortField = 'userEmail' | 'model' | 'totalTraffic' | 'inputTokens' | 'outputTokens' | 'costUsd';

const formatTokens = (num: number): string => {
  if (!num || num <= 0) return '0';
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  return num.toLocaleString();
};

const formatCost = (usd: number): string => {
  if (!usd || usd <= 0) return '$0.00';
  if (usd < 0.01) {
    return `$${usd.toFixed(4)}`;
  }
  return `$${usd.toFixed(2)}`;
};

// Mini Area Sparkline Component (Inspired by Semrush Domain Analytics Sparklines)
const AreaSparkline: React.FC<{
  data: number[];
  color?: string;
  id: string;
}> = ({ data, color = '#3b82f6', id }) => {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 120;
  const height = 28;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 6) - 3;
    return { x, y };
  });

  const lineD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '');
  const areaD = `${lineD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-7 overflow-visible">
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${id})`} />
      <path d={lineD} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  settings,
  viewMode = 'admin',
  timeRange = '24h',
  setLoading: controlledSetLoading,
  registerRefresh,
  userFilter: controlledUserFilter,
  onUserFilterChange: controlledOnUserFilterChange,
  onUserListChange,
}) => {
  const [, setInternalLoading] = useState(false);
  const setLoading = controlledSetLoading ?? setInternalLoading;

  const [internalUserFilter, setInternalUserFilter] = useState<string>('all');
  const userFilter = controlledUserFilter ?? internalUserFilter;
  const setUserFilter = (u: string) => {
    if (controlledOnUserFilterChange) {
      controlledOnUserFilterChange(u);
    } else {
      setInternalUserFilter(u);
    }
  };

  const [modelFilter, setModelFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('costUsd');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [distributionMode, setDistributionMode] = useState<'spend' | 'tokens'>('spend');

  const currentUserEmail = settings.ssoUser?.email || settings.userEmail || DEFAULT_SSO_USER.email;

  const [fleetData, setFleetData] = useState<FleetAnalyticsResponse | null>(null);
  const [attributions, setAttributions] = useState<UserMonetizationAttribution[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Ledger row whose per-call audit trail is open. Null == modal closed.
  const [logsTarget, setLogsTarget] = useState<{ userEmail: string; model: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [fleetRes, attrRes] = await Promise.allSettled([
        fetchFleetAnalytics(timeRange, 'prod'),
        fetchDeveloperAttributions(),
      ]);
      if (fleetRes.status === 'fulfilled') {
        setFleetData(fleetRes.value);
      } else {
        setFetchError(fleetRes.reason?.message || 'Failed to load Management API stats');
      }
      if (attrRes.status === 'fulfilled' && attrRes.value.attributions) {
        setAttributions(attrRes.value.attributions);
      }
    } catch (err: any) {
      setFetchError(err.message || 'Failed to load Management API stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeRange]);

  useEffect(() => {
    if (registerRefresh) {
      registerRefresh(loadData);
    }
  }, [registerRefresh, timeRange]);

  // Analytics Management API data.
  //
  // The fleet-stats endpoint can emit MORE THAN ONE row for the same
  // (userEmail, model) pair: the Analytics-indexed row and the wallet
  // reconciliation row for spend that analytics has not indexed yet. Left as-is
  // those pairs produce duplicate React keys in the ledger table, which breaks
  // list reconciliation and leaves stale <tr> nodes in the DOM whenever the row
  // set shrinks (e.g. when the user filter is applied). Collapse them here so
  // every (userEmail, model) pair appears exactly once with summed totals.
  const allConsumptionRecords: UserConsumptionRecord[] = useMemo(() => {
    const rows = fleetData?.consumptionRows || [];
    const merged = new Map<string, UserConsumptionRecord>();

    rows.forEach((row) => {
      const key = `${row.userEmail.toLowerCase()}__${row.model}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...row });
        return;
      }
      existing.totalTraffic += row.totalTraffic;
      existing.inputTokens += row.inputTokens;
      existing.outputTokens += row.outputTokens;
      existing.costUsd += row.costUsd;
      // undefined means "not recorded", so only produce a number when at least one side has one.
      if (row.errorCount !== undefined || existing.errorCount !== undefined) {
        existing.errorCount = (existing.errorCount ?? 0) + (row.errorCount ?? 0);
      }
      existing.isUnauthenticated = Boolean(existing.isUnauthenticated) && Boolean(row.isUnauthenticated);
    });

    return Array.from(merged.values());
  }, [fleetData]);

  // Authoritative user/developer list based strictly on Developer Management API
  const userList = useMemo(() => {
    const map = new Map<string, { email: string; name?: string }>();
    attributions.forEach((a) => {
      map.set(a.userEmail.toLowerCase(), { email: a.userEmail, name: a.name });
    });
    if (map.size === 0 && currentUserEmail) {
      map.set(currentUserEmail.toLowerCase(), { email: currentUserEmail, name: currentUserEmail.split('@')[0] });
    }
    return Array.from(map.values()).sort((a, b) => {
      const nameA = (a.name || a.email).toLowerCase();
      const nameB = (b.name || b.email).toLowerCase();
      const cmp = nameA.localeCompare(nameB);
      return cmp !== 0 ? cmp : a.email.localeCompare(b.email);
    });
  }, [attributions, currentUserEmail]);

  useEffect(() => {
    if (onUserListChange && userList.length > 0) {
      onUserListChange(userList);
    }
  }, [userList, onUserListChange]);

  // Active consumption records based on Admin Fleet vs Personal User viewMode and userFilter
  const activeConsumptionRecords: UserConsumptionRecord[] = useMemo(() => {
    if (viewMode === 'user') {
      return allConsumptionRecords.filter(
        (r) => r.userEmail.toLowerCase() === currentUserEmail.toLowerCase()
      );
    }
    if (userFilter && userFilter !== 'all') {
      return allConsumptionRecords.filter(
        (r) => r.userEmail.toLowerCase() === userFilter.toLowerCase()
      );
    }
    return allConsumptionRecords;
  }, [allConsumptionRecords, viewMode, currentUserEmail, userFilter]);

  // Available Balance: Added together for Admin View (All Users) or individual for selected user / user view
  const availableBalanceData = useMemo(() => {
    if (viewMode === 'user') {
      const match = attributions.find(
        (u) => u.userEmail.toLowerCase() === currentUserEmail.toLowerCase()
      );
      const bal = match ? match.currentBalanceUsd : 0;
      const isPrepaid = match ? match.billingType === 'PREPAID' : true;
      const handle = currentUserEmail.split('@')[0] || currentUserEmail;
      return {
        amount: Number(bal || 0).toFixed(2),
        exactAmount: Number(bal || 0).toFixed(6).replace(/(\.\d{2,}?)0+$/, '$1'),
        badge: isPrepaid ? 'Prepaid' : 'Postpaid',
        subtitle: `Active Wallet (${handle})`,
        sparkline: bal > 0 ? [bal, bal, bal, bal, bal] : [0, 0, 0, 0, 0],
      };
    }

    if (userFilter !== 'all') {
      const match = attributions.find(
        (u) => u.userEmail.toLowerCase() === userFilter.toLowerCase()
      );
      const bal = match ? match.currentBalanceUsd : 0;
      const isPrepaid = match ? match.billingType === 'PREPAID' : true;
      const handle = userFilter.split('@')[0] || userFilter;
      return {
        amount: Number(bal || 0).toFixed(2),
        exactAmount: Number(bal || 0).toFixed(6).replace(/(\.\d{2,}?)0+$/, '$1'),
        badge: isPrepaid ? 'Prepaid' : 'Postpaid',
        subtitle: isPrepaid ? `Prepaid Wallet (${handle})` : `Postpaid Plan (${handle})`,
        sparkline: bal > 0 ? [bal, bal, bal, bal, bal] : [0, 0, 0, 0, 0],
      };
    }

    // Admin view with All Users (Fleet Total): Sum of all developers added together
    const totalPool = attributions.reduce((acc, u) => acc + (u.currentBalanceUsd || 0), 0);
    const userCount = attributions.length || userList.length || 1;
    return {
      amount: Number(totalPool || 0).toFixed(2),
      exactAmount: Number(totalPool || 0).toFixed(6).replace(/(\.\d{2,}?)0+$/, '$1'),
      badge: 'Pool',
      subtitle: `All Users Pool • ${userCount} developer${userCount === 1 ? '' : 's'}`,
      sparkline: totalPool > 0 ? [totalPool, totalPool, totalPool, totalPool, totalPool] : [0, 0, 0, 0, 0],
    };
  }, [viewMode, userFilter, currentUserEmail, attributions, userList]);

  // Overall KPI card summary stats directly from Management API or computed for filtered View.
  //
  // slaHealth / faultCount are `null` when the window genuinely has nothing to report, and the
  // cards render an em dash. They must never fall back to a flattering literal: this panel
  // previously hardcoded `slaHealth: 100, faultCount: 0` for every scoped view, so an individual
  // user showed a perfect 100% while the fleet showed 54%, even while that same user was being
  // blocked by Model Armor and token quotas.
  const aggregatedStats = useMemo(() => {
    if (viewMode === 'admin' && userFilter === 'all' && fleetData?.kpis) {
      return {
        totalCalls: fleetData.kpis.totalCalls.toLocaleString(),
        totalTokens: formatTokens(fleetData.kpis.totalTokens),
        totalSpend: fleetData.kpis.totalSpendUsd.toFixed(2),
        cacheSavings:
          fleetData.kpis.cacheCostSavingsUsd == null
            ? null
            : fleetData.kpis.cacheCostSavingsUsd.toFixed(2),
        cacheHitRate: fleetData.kpis.cacheHitRate == null ? null : Math.round(fleetData.kpis.cacheHitRate),
        slaHealth: fleetData.kpis.slaHealth == null ? null : Math.round(fleetData.kpis.slaHealth),
        faultCount: fleetData.kpis.isErrorCount ?? null,
      };
    }
    let calls = 0;
    let tokens = 0;
    let spend = 0;
    // Counted separately from `calls`: synthetic wallet-reconciliation rows have no error signal,
    // so including them in the denominator would dilute the rate towards a false 100%.
    let measuredCalls = 0;
    let errors = 0;
    let hasErrorData = false;

    activeConsumptionRecords.forEach((r) => {
      calls += r.totalTraffic;
      tokens += r.inputTokens + r.outputTokens;
      spend += r.costUsd;

      measuredCalls += r.totalTraffic;
      if (r.errorCount !== undefined) {
        hasErrorData = true;
        errors += r.errorCount;
      }
    });

    const canReportSla = hasErrorData && measuredCalls > 0;

    // Real scoped cache metrics from the dc_user_email,dc_cache_status dimension.
    // Only HIT and MISS count toward the rate; DISABLED and (not set) traffic is excluded.
    const targetEmails = new Set<string>();
    if (viewMode === 'user') {
      targetEmails.add(currentUserEmail.toLowerCase());
    } else if (userFilter !== 'all') {
      targetEmails.add(userFilter.toLowerCase());
    } else {
      activeConsumptionRecords.forEach((r) => targetEmails.add(r.userEmail.toLowerCase()));
    }

    let userHits = 0;
    let userMisses = 0;
    let hasMeasuredCache = false;

    if (fleetData?.userCacheStats) {
      targetEmails.forEach((email) => {
        const stat = fleetData.userCacheStats?.[email];
        if (stat) {
          userHits += stat.hits || 0;
          userMisses += stat.misses || 0;
          if ((stat.hits || 0) + (stat.misses || 0) > 0) {
            hasMeasuredCache = true;
          }
        }
      });
    }

    const userMeasured = userHits + userMisses;
    const userCacheHitRate =
      hasMeasuredCache && userMeasured > 0
        ? Math.round((userHits / userMeasured) * 100)
        : null;

    let userCacheSavings: string | null = null;
    if (userCacheHitRate !== null && userHits > 0) {
      const modelCalls = Math.max(1, calls - userHits);
      let costPerModelCall = calls > 0 && spend > 0 ? spend / modelCalls : 0;
      if (costPerModelCall === 0 && fleetData?.kpis?.totalSpendUsd && fleetData?.kpis?.totalCalls) {
        const fleetHits = fleetData.kpis.cacheHitCount || 0;
        const fleetModelCalls = Math.max(1, fleetData.kpis.totalCalls - fleetHits);
        costPerModelCall = fleetData.kpis.totalSpendUsd / fleetModelCalls;
      }
      userCacheSavings = (costPerModelCall * userHits).toFixed(2);
    }

    return {
      totalCalls: calls.toLocaleString(),
      totalTokens: formatTokens(tokens),
      totalSpend: spend.toFixed(2),
      cacheSavings: userCacheSavings,
      cacheHitRate: userCacheHitRate,
      slaHealth: canReportSla ? Math.round((1 - errors / measuredCalls) * 100) : null,
      faultCount: hasErrorData ? errors : null,
    };
  }, [viewMode, userFilter, fleetData, activeConsumptionRecords, currentUserEmail]);

  // Dynamic Routing & Model Volume Stats
  const routingStats = useMemo(() => {
    if (viewMode === 'admin' && userFilter === 'all' && fleetData?.routing) {
      return {
        flashCalls: fleetData.routing.flashCalls,
        proCalls: fleetData.routing.proOpusCalls,
        flashPercent: fleetData.routing.flashPercent,
        proPercent: fleetData.routing.proOpusPercent,
      };
    }

    let flashCalls = 0;
    let proCalls = 0;
    activeConsumptionRecords.forEach((r) => {
      if (r.tier === 'high') {
        proCalls += r.totalTraffic;
      } else {
        flashCalls += r.totalTraffic;
      }
    });

    const total = flashCalls + proCalls || 1;
    const flashPercent = Number(((flashCalls / total) * 100).toFixed(1));
    const proPercent = Number(((proCalls / total) * 100).toFixed(1));

    return {
      flashCalls,
      proCalls,
      flashPercent,
      proPercent,
    };
  }, [viewMode, userFilter, fleetData, activeConsumptionRecords]);

  // Per-model aggregations specifically for the 2 Pie Charts
  const modelStatsForPies = useMemo(() => {
    const modelMap = new Map<string, {
      model: string;
      provider: string;
      tier: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      cost: number;
      color: string;
      badge: string;
    }>();

    const colorPalette: Record<string, { color: string; badge: string }> = {
      'claude-opus-4-5@20251101': { color: '#9333ea', badge: 'Op' }, // Purple
      'claude-opus-4-5': { color: '#9333ea', badge: 'Op' },          // Purple
      'claude-haiku-4-5@20251001': { color: '#0d9488', badge: 'Hk' }, // Teal-600
      'claude-haiku-4-5': { color: '#0d9488', badge: 'Hk' },         // Teal-600
      'gemini-3-flash-preview': { color: '#2563eb', badge: 'Gf' },   // Blue
      'gemini-2.5-flash': { color: '#0284c7', badge: 'F2' },         // Sky
      'gemini-3.1-flash-lite': { color: '#059669', badge: 'Fl' },    // Emerald
      // Warm colours deliberately: these two are priced above the Pro models, so they should
      // not sit in the cool green/blue range the cheap Flash models use.
      'gemini-3.7-flash': { color: '#ea580c', badge: 'F7' },         // Orange-600
      'gemini-3.8-flash': { color: '#c2410c', badge: 'F8' },         // Orange-700
      'gemini-3.1-pro-preview': { color: '#4f46e5', badge: 'Pr' },   // Indigo
      'gemini-2.5-pro': { color: '#6366f1', badge: 'P2' },          // Indigo-500
      'unknown-model': { color: '#94a3b8', badge: 'BL' },           // Slate-400 (Blocked / Unrouted)
    };

    activeConsumptionRecords.forEach((r) => {
      // Only include records that have traffic
      if (r.totalTraffic <= 0) return;

      // Filter out non-model calls (blocked pre-flow calls, unrouted faults).
      // These are already accounted for in the Request Success Rate & Errors Logged counters.
      if (r.model === 'unknown-model' || r.model === '{flow.model}' || r.model === 'null') return;

      // Normalize model name (e.g. claude-opus-4-5@20251101 -> claude-opus-4-5)
      const normalizedModel = r.model.replace(/@\d+$/, '');
      const existing = modelMap.get(normalizedModel);
      const rowTokens = r.inputTokens + r.outputTokens;
      const meta = colorPalette[normalizedModel] || colorPalette[r.model] || { color: '#d97706', badge: normalizedModel.slice(0, 2).toUpperCase() };
      if (existing) {
        existing.calls += r.totalTraffic;
        existing.inputTokens += r.inputTokens;
        existing.outputTokens += r.outputTokens;
        existing.totalTokens += rowTokens;
        existing.cost += r.costUsd;
      } else {
        modelMap.set(normalizedModel, {
          model: normalizedModel,
          provider: r.provider,
          tier: r.tier,
          calls: r.totalTraffic,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          totalTokens: rowTokens,
          cost: r.costUsd,
          color: meta.color,
          badge: meta.badge,
        });
      }
    });

    return Array.from(modelMap.values())
      .filter((m) => m.calls > 0)
      .sort((a, b) => b.cost - a.cost);
  }, [activeConsumptionRecords]);

  // Pie Chart 1: Model vs Cost Slices.
  // Every model with traffic and non-zero spend is shown. Do NOT reintroduce a
  // minimum-cost threshold here: it silently drops models that the Tokens view
  // still lists, and leaves the legend unable to account for the donut total.
  const costSlices: DonutSlice[] = useMemo(() => {
    const totalCost = modelStatsForPies.reduce((acc, m) => acc + m.cost, 0);
    return modelStatsForPies
      .filter((m) => m.calls > 0 && m.cost > 0)
      .map((m) => ({
        id: m.model,
        label: m.model,
        badge: m.badge,
        sublabel: `${m.provider} • ${m.tier.toUpperCase()}`,
        value: m.cost,
        // Sub-cent spend is common on flash-tier models; $0.00 would be misleading.
        formattedValue:
          m.cost > 0 && m.cost < 0.01
            ? `$${m.cost.toFixed(4)} USD`
            : `$${m.cost.toFixed(2)} USD`,
        percentage: totalCost > 0 ? (m.cost / totalCost) * 100 : 0,
        color: m.color,
      }));
  }, [modelStatsForPies]);

  // Pie Chart 2: Model vs Token Volume Slices (only models that have actual traffic and non-zero tokens)
  const tokenSlices: DonutSlice[] = useMemo(() => {
    const totalTokens = modelStatsForPies.reduce((acc, m) => acc + m.totalTokens, 0);
    return [...modelStatsForPies]
      .filter((m) => m.calls > 0 && m.totalTokens > 0)
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .map((m) => {
        const formatted = m.totalTokens >= 1_000_000
          ? `${(m.totalTokens / 1e6).toFixed(1)}M`
          : m.totalTokens.toLocaleString();
        const inFormatted = m.inputTokens >= 1_000_000
          ? `${(m.inputTokens / 1e6).toFixed(1)}M`
          : m.inputTokens.toLocaleString();
        const outFormatted = m.outputTokens >= 1_000_000
          ? `${(m.outputTokens / 1e6).toFixed(1)}M`
          : m.outputTokens.toLocaleString();
        return {
          id: m.model,
          label: m.model,
          badge: m.badge,
          sublabel: `${m.provider} • In: ${inFormatted} | Out: ${outFormatted}`,
          value: m.totalTokens,
          formattedValue: formatted,
          percentage: totalTokens > 0 ? (m.totalTokens / totalTokens) * 100 : 0,
          color: m.color,
        };
      });
  }, [modelStatsForPies]);

  const totalModelTraffic = useMemo(() => {
    return modelStatsForPies.reduce((sum, m) => sum + m.calls, 0);
  }, [modelStatsForPies]);

  // Dynamic Sparkline points based on actual model traffic distribution from Management API
  const sparklineCalls = useMemo(() => {
    if (modelStatsForPies.length === 0) return [1, 2, 3, 5, 8];
    const points = modelStatsForPies.map((m) => m.calls).reverse();
    return points.length >= 2 ? points : [...points, ...points];
  }, [modelStatsForPies]);

  const sparklineTokens = useMemo(() => {
    if (modelStatsForPies.length === 0) return [10, 20, 50, 100];
    const points = modelStatsForPies.map((m) => Math.round(m.totalTokens / 1000)).reverse();
    return points.length >= 2 ? points : [...points, ...points];
  }, [modelStatsForPies]);

  const sparklineSpend = useMemo(() => {
    if (modelStatsForPies.length === 0) return [1, 3, 5, 10];
    const points = modelStatsForPies.map((m) => Math.round(m.cost * 100)).reverse();
    return points.length >= 2 ? points : [...points, ...points];
  }, [modelStatsForPies]);

  // Unique model options for dropdown filter (only models that have traffic in active view)
  const uniqueModels = useMemo(() => {
    return Array.from(new Set(activeConsumptionRecords.filter((r) => r.totalTraffic > 0).map((r) => r.model))).sort();
  }, [activeConsumptionRecords]);

  useEffect(() => {
    if (modelFilter !== 'all' && !uniqueModels.includes(modelFilter)) {
      setModelFilter('all');
    }
  }, [uniqueModels, modelFilter]);

  // Filtered & Sorted Consumption Rows for the Consumption Dashboard Table (only rows with traffic)
  const displayedConsumptionRows = useMemo(() => {
    let rows = activeConsumptionRecords.filter((r) => r.totalTraffic > 0);

    if (modelFilter !== 'all') {
      rows = rows.filter((r) => r.model === modelFilter);
    }

    return [...rows].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [activeConsumptionRecords, modelFilter, sortField, sortOrder]);

  // Summary Totals for the Consumption Table Footer
  const tableTotals = useMemo(() => {
    let traffic = 0;
    let inTokens = 0;
    let outTokens = 0;
    let cost = 0;
    displayedConsumptionRows.forEach((r) => {
      traffic += r.totalTraffic;
      inTokens += r.inputTokens;
      outTokens += r.outputTokens;
      cost += r.costUsd;
    });

    const totTokens = inTokens + outTokens;
    return {
      traffic: traffic.toLocaleString(),
      inTokens: formatTokens(inTokens),
      outTokens: formatTokens(outTokens),
      totalTokens: formatTokens(totTokens),
      cost: cost < 0.01 && cost > 0 ? cost.toFixed(4) : cost.toFixed(2),
    };
  }, [displayedConsumptionRows]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="h-full bg-slate-50 text-slate-900 overflow-y-auto p-4 sm:px-6 sm:py-5 space-y-5">

      {fetchError && (
        <div className="max-w-7xl mx-auto p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between">
          <span>{fetchError}</span>
          <button type="button" onClick={() => loadData()} className="underline font-semibold cursor-pointer ml-2">Retry</button>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* SECTION 1: UNIFIED GATEWAY ANALYTICS STRIP (Inspired by Semrush "Domain Analytics") */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          {/* Header with Purple Underline Accent */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="border-b-2 border-purple-500 inline-flex items-center gap-2 pb-1 font-bold text-sm text-slate-900">
              <span>{viewMode === 'user' ? 'Gateway Analytics (User View)' : 'Gateway Analytics'}</span>
              <span title="Real-time AI Gateway telemetry and consumption metrics">
                <Info className="w-3.5 h-3.5 text-slate-400 hover:text-purple-500 cursor-pointer" />
              </span>
            </div>

            <div className="flex items-center gap-2.5 text-xs text-slate-500 font-sans flex-wrap">
              {viewMode === 'user' ? (
                <>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                    <User className="w-3 h-3 text-blue-600" />
                    {currentUserEmail}
                  </span>
                  <span>•</span>
                </>
              ) : (
                <>
                  {/* Admin User Filter Dropdown */}
                  <div className="flex items-center bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs shadow-xs">
                    <User className="w-3.5 h-3.5 text-purple-600 mr-1.5 shrink-0" />
                    <span className="text-slate-500 mr-1 text-[11px] font-semibold">User:</span>
                    <select
                      value={userFilter}
                      onChange={(e) => setUserFilter(e.target.value)}
                      className="bg-transparent text-slate-800 text-xs font-mono focus:outline-none cursor-pointer max-w-[190px] sm:max-w-[220px] truncate"
                      title="Filter Analytics by user or view fleet totals"
                    >
                      <option value="all">All Users (Fleet)</option>
                      {userList.map((u) => (
                        <option key={u.email} value={u.email}>
                          {u.name ? `${u.name} (${u.email})` : u.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span>•</span>
                </>
              )}
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Production
              </span>
              <span>•</span>
              <span className="font-mono text-[11px] text-slate-500">Updated 1m ago</span>
            </div>
          </div>

          {/* 6-Column Metric Strip with Sparklines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            {/* Col 1: Request Success Rate */}
            <div className="p-3 sm:px-4 space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>Request Success Rate</span>
                <span title="Percentage of successful client requests (100% minus error rate) processed by the gateway. Shows an em dash when no error data was recorded for this scope and window.">
                  <Info className="w-3 h-3 text-slate-400 hover:text-purple-500 cursor-pointer" />
                </span>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <div className="w-11 h-11 rounded-full bg-teal-50 border-2 border-teal-500 flex items-center justify-center font-mono font-bold text-sm text-teal-600 shadow-xs">
                  {aggregatedStats.slaHealth === null ? '—' : `${Math.round(aggregatedStats.slaHealth)}%`}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    {aggregatedStats.faultCount === null
                      ? 'No Error Data'
                      : aggregatedStats.faultCount === 0
                        ? 'Optimal'
                        : 'Errors Logged'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {aggregatedStats.faultCount === null
                      ? 'Not recorded for this window'
                      : aggregatedStats.faultCount === 0
                        ? 'Zero Errors'
                        : `${aggregatedStats.faultCount} Request Errors`}
                  </div>
                </div>
              </div>
            </div>

            {/* Col 2: Available Balance */}
            <div className="p-3 sm:px-4 space-y-1 min-w-0 overflow-hidden">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between gap-1">
                <span className="truncate">Available Balance</span>
                <span title="Native Monetization prepaid wallet balance" className="shrink-0">
                  <Wallet className="w-3.5 h-3.5 text-emerald-500" />
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 pt-0.5 flex-wrap">
                <span
                  className="text-2xl font-bold font-mono text-emerald-600 tracking-tight"
                  title={`Exact balance: $${availableBalanceData.exactAmount} USD`}
                >
                  ${availableBalanceData.amount}
                </span>
                <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200 shrink-0 whitespace-nowrap">
                  {availableBalanceData.badge}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 leading-tight" title={availableBalanceData.subtitle}>
                {availableBalanceData.subtitle}
              </div>
              {/* Mini Area Sparkline */}
              <div className="pt-0.5">
                <AreaSparkline data={availableBalanceData.sparkline} color="#10b981" id="balance" />
              </div>
            </div>

            {/* Col 3: Total Model Calls */}
            <div className="p-3 sm:px-4 space-y-1 min-w-0 overflow-hidden">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between gap-1">
                <span className="truncate">Total Model Calls</span>
                <Bot className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              </div>
              <div className="flex items-baseline gap-1.5 pt-0.5 flex-wrap">
                <span className="text-2xl font-bold font-mono text-blue-600">
                  {aggregatedStats.totalCalls}
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 shrink-0">
                  {routingStats.flashPercent}% Flash
                </span>
              </div>
              {/* Mini Area Sparkline */}
              <div className="pt-1">
                <AreaSparkline data={sparklineCalls} color="#3b82f6" id="calls" />
              </div>
            </div>

            {/* Col 4: Total Token Volume */}
            <div className="p-3 sm:px-4 space-y-1 min-w-0 overflow-hidden">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between gap-1">
                <span className="truncate">Total Token Volume</span>
                <Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              </div>
              <div className="flex items-baseline gap-1.5 pt-0.5 flex-wrap">
                <span className="text-2xl font-bold font-mono text-purple-600">
                  {aggregatedStats.totalTokens}
                </span>
                <span className="text-[11px] font-medium text-slate-500 shrink-0">
                  Tokens
                </span>
              </div>
              {/* Mini Area Sparkline */}
              <div className="pt-1">
                <AreaSparkline data={sparklineTokens} color="#9333ea" id="tokens" />
              </div>
            </div>

            {/* Col 5: Total Enterprise Spend */}
            <div className="p-3 sm:px-4 space-y-1 min-w-0 overflow-hidden">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between gap-1">
                <span className="truncate">{viewMode === 'user' ? 'My User Spend' : 'Total Enterprise Spend'}</span>
                <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              </div>
              <div className="flex items-baseline gap-1.5 pt-0.5 flex-wrap">
                <span className="text-2xl font-bold font-mono text-emerald-600">
                  ${aggregatedStats.totalSpend}
                </span>
                <span className="text-[11px] font-sans text-slate-500 font-medium shrink-0">
                  USD
                </span>
              </div>
              {/* Mini Area Sparkline */}
              <div className="pt-1">
                <AreaSparkline data={sparklineSpend} color="#059669" id="spend" />
              </div>
            </div>

            {/* Col 6: Semantic Cache Savings */}
            <div className="p-3 sm:px-4 space-y-1 min-w-0 overflow-hidden">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between gap-1">
                <span className="truncate">Cache Cost Savings</span>
                <Database className="w-3.5 h-3.5 text-teal-500 shrink-0" />
              </div>
              <div className="flex items-baseline gap-1.5 pt-0.5 flex-wrap">
                <span className="text-2xl font-bold font-mono text-teal-600">
                  {aggregatedStats.cacheSavings === null ? '—' : `$${aggregatedStats.cacheSavings}`}
                </span>
                <span
                  className="text-[11px] font-semibold text-emerald-600 shrink-0"
                  title={
                    aggregatedStats.cacheHitRate === null
                      ? 'No cacheable traffic (HIT or MISS) was recorded in this time window. DISABLED and (not set) requests are excluded.'
                      : 'Measured from the dc_cache_status dimension: HIT / (HIT + MISS).'
                  }
                >
                  {aggregatedStats.cacheHitRate === null
                    ? 'No cache data'
                    : `${aggregatedStats.cacheHitRate}% Hits`}
                </span>
              </div>
              {/* No sparkline here. It used to render a hardcoded [8,11,14…38] series that
                  always sloped upward regardless of actual cache behaviour. */}
              <div className="pt-1 h-[26px]" />
            </div>
          </div>
        </div>

        {/* SECTION 2: DUAL EXECUTIVE PANELS (Inspired by Semrush "Position Tracking" & "On Page SEO Checker") */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* PANEL 1: Auto-Routing Policy & Complexity Audit (like Semrush Site Audit & Position Tracking) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
            <div>
              {/* Header with Purple Underline Accent */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="border-b-2 border-purple-500 inline-flex items-center gap-2 pb-1 font-bold text-sm text-slate-900">
                    <Zap className="w-4 h-4 text-purple-500 shrink-0" />
                    <span>Auto-Routing Policy Audit</span>
                    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-purple-500 cursor-pointer" />
                  </div>
                </div>
                {/* Was `flashPercent * 0.55`, presented as a savings percentage. The 0.55 had
                    no basis — it was not a price ratio between the tiers and not measured.
                    Report the routing split itself, which is a real quantity. */}
                <div className="text-[11px] font-mono font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0">
                  {routingStats.flashPercent === null
                    ? '⚡ No routing data'
                    : `⚡ ${routingStats.flashPercent}% to low-cost tier`}
                </div>
              </div>

              {/* Site Health Style Semi-Circle Arc & Split Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center pt-4">
                {/* Arc Gauge */}
                <div className="flex flex-col items-center justify-center p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <div className="relative w-32 h-20 flex items-end justify-center overflow-hidden">
                    <svg viewBox="0 0 100 55" className="w-full h-full">
                      <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="12"
                      />
                      <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray="126"
                        strokeDashoffset={126 * (1 - (routingStats.flashPercent ?? 0) / 100)}
                      />
                    </svg>
                    <div className="absolute bottom-1 font-mono font-bold text-lg text-slate-900">
                      {routingStats.flashPercent === null ? '—' : `${routingStats.flashPercent}%`}
                    </div>
                  </div>
                  <div className="text-xs font-bold text-emerald-600 mt-1">
                    Flash Cost Optimized
                  </div>
                  <div className="text-[10px] text-slate-500">
                    High-Speed Flash Lite &amp; Flash
                  </div>
                </div>

                {/* Right Breakdown Cards */}
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-500">Flash Models (Standard)</div>
                      <div className="text-xs text-slate-600 font-sans">Low-cost fast response</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-600 text-sm">
                        {routingStats.flashCalls.toLocaleString()}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {routingStats.flashPercent}% calls
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-500">Pro / Opus (Enterprise)</div>
                      <div className="text-xs text-slate-600 font-sans">Complex code &amp; reasoning</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-purple-600 text-sm">
                        {routingStats.proCalls.toLocaleString()}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {routingStats.proPercent}% calls
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stacked Multi-Colored Volume Bar (Inspired by Semrush "Crawled Pages") */}
              <div className="pt-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Model Traffic Execution Stack</span>
                  <span className="font-mono font-bold text-slate-900">{totalModelTraffic.toLocaleString()} Calls</span>
                </div>
                <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-100 shadow-inner">
                  {[...modelStatsForPies].sort((a, b) => b.calls - a.calls).map((m) => {
                    const pct = totalModelTraffic > 0 ? (m.calls / totalModelTraffic) * 100 : 0;
                    if (pct <= 0) return null;
                    return (
                      <div
                        key={m.model}
                        className="h-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: m.color }}
                        title={`${m.model}: ${m.calls.toLocaleString()} calls (${pct.toFixed(1)}%)`}
                      />
                    );
                  })}
                </div>

                {/* Dynamic Legend Chips */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono pt-1">
                  {[...modelStatsForPies]
                    .sort((a, b) => b.calls - a.calls)
                    .slice(0, 4)
                    .map((m) => {
                      const pct = totalModelTraffic > 0 ? ((m.calls / totalModelTraffic) * 100).toFixed(0) : '0';
                      return (
                        <div key={m.model} className="flex items-center gap-1.5 text-slate-600">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                          <span className="truncate">{m.model.replace('@20251101', '').replace('gemini-', 'G-')} {pct}%</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>

          {/* PANEL 2: Model Spend & Token Breakdown (Inspired by Semrush "On Page SEO Checker") */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
            <div>
              {/* Header with Purple Underline Accent & Toggle Pills */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="border-b-2 border-purple-500 inline-flex items-center gap-2 pb-1 font-bold text-sm text-slate-900">
                    <Coins className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>{viewMode === 'user' ? 'My Model Split' : 'Model Split Across Catalog'}</span>
                    <span title="Model token volume and spend split">
                      <Info className="w-3.5 h-3.5 text-slate-400 hover:text-purple-500 cursor-pointer" />
                    </span>
                  </div>
                </div>

                {/* View Switcher: Spend ($ USD) vs Token Volume */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => setDistributionMode('spend')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      distributionMode === 'spend'
                        ? 'bg-white text-emerald-600 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Spend ($)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDistributionMode('tokens')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      distributionMode === 'tokens'
                        ? 'bg-white text-purple-600 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Tokens
                  </button>
                </div>
              </div>

              {/* Dynamic Donut Chart + Categorized 2-Letter Badges */}
              <div className="pt-2">
                {distributionMode === 'spend' ? (
                  <DonutPieChart
                    data={costSlices}
                    totalFormatted={`$${aggregatedStats.totalSpend}`}
                    totalLabel="Total Spend"
                    unitLabel="USD Spent"
                    centerBadgeColor="text-emerald-600"
                    borderless={true}
                  />
                ) : (
                  <DonutPieChart
                    data={tokenSlices}
                    totalFormatted={aggregatedStats.totalTokens}
                    totalLabel="Total Volume"
                    unitLabel="Tokens Processed"
                    centerBadgeColor="text-purple-600"
                    borderless={true}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: CONSUMPTION DASHBOARD TABLE (Inspired by Semrush "Backlink Audit" Data Table) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          {/* Table Header with Purple Underline Accent */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="border-b-2 border-purple-500 inline-flex items-center gap-2 pb-1 font-bold text-sm text-slate-900">
                <TableProperties className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  {viewMode === 'admin'
                    ? userFilter === 'all'
                      ? 'Model Consumption Ledger by User & Model'
                      : `Model Consumption Ledger for ${userFilter}`
                    : `Personal Model Consumption for ${currentUserEmail}`}
                </span>
                <Info className="w-3.5 h-3.5 text-slate-400 hover:text-purple-500 cursor-pointer" />
              </div>
            </div>

            {/* Filter Toolbar: ONLY Model Filter */}
            <div className="flex items-center gap-2.5">
              {/* Model Dropdown Filter */}
              <div className="flex items-center bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs shadow-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
                <span className="text-slate-500 mr-1.5 text-[11px]">Model:</span>
                <select
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  className="bg-transparent text-slate-800 text-xs font-mono focus:outline-none cursor-pointer"
                >
                  <option value="all">All Models ({uniqueModels.length})</option>
                  {uniqueModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Clean Enterprise Data Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-semibold select-none">
                  {/* User Email */}
                  <th
                    onClick={() => handleSort('userEmail')}
                    className="pb-3 cursor-pointer hover:text-slate-900 transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>User Email</span>
                      {sortField === 'userEmail' ? (
                        sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-purple-500" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-500" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>

                  {/* Model */}
                  <th
                    onClick={() => handleSort('model')}
                    className="pb-3 cursor-pointer hover:text-slate-900 transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>Model</span>
                      {sortField === 'model' ? (
                        sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-purple-500" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-500" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>

                  {/* Total Traffic (Sum) */}
                  <th
                    onClick={() => handleSort('totalTraffic')}
                    className="pb-3 text-right cursor-pointer hover:text-slate-900 transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Total Traffic (Sum)</span>
                      {sortField === 'totalTraffic' ? (
                        sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-purple-500" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-500" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>

                  {/* Input Token (Sum) */}
                  <th
                    onClick={() => handleSort('inputTokens')}
                    className="pb-3 text-right cursor-pointer hover:text-slate-900 transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Input Token (Sum)</span>
                      {sortField === 'inputTokens' ? (
                        sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-purple-500" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-500" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>

                  {/* Output Token (Sum) */}
                  <th
                    onClick={() => handleSort('outputTokens')}
                    className="pb-3 text-right cursor-pointer hover:text-slate-900 transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Output Token (Sum)</span>
                      {sortField === 'outputTokens' ? (
                        sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-purple-500" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-500" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>

                  {/* Cost (Sum) */}
                  <th
                    onClick={() => handleSort('costUsd')}
                    className="pb-3 text-right cursor-pointer hover:text-slate-900 transition"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Cost (Sum)</span>
                      {sortField === 'costUsd' ? (
                        sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-purple-500" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-500" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>

                  {/* Audit trail drill-down (not sortable) */}
                  <th className="pb-3 text-right">
                    <span>Logs</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                {displayedConsumptionRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                      No consumption records found with the selected model filter.
                    </td>
                  </tr>
                ) : (
                  displayedConsumptionRows.map((row) => {
                    const isCurrentUser =
                      row.userEmail.toLowerCase() === currentUserEmail.toLowerCase();

                    return (
                      <tr
                        key={`${row.userEmail}__${row.model}`}
                        className={`hover:bg-slate-50 transition group ${
                          isCurrentUser ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        {/* User Email */}
                        <td className="py-3 font-medium text-slate-800 flex items-center gap-2 font-sans">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isCurrentUser
                                ? 'bg-blue-500 ring-2 ring-blue-200'
                                : row.isUnauthenticated
                                ? 'bg-slate-400'
                                : 'bg-emerald-500'
                            }`}
                          />
                          <span className="truncate">{row.userEmail}</span>
                          {isCurrentUser && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                              You
                            </span>
                          )}
                        </td>

                        {/* Model & Provider Badge */}
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800">{row.model}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              {row.provider}
                            </span>
                          </div>
                        </td>

                        {/* Total Traffic (Sum) */}
                        <td className="py-3 text-right text-slate-800">
                          <span className="font-bold">{row.totalTraffic.toLocaleString()}</span>
                          <span className="text-[10px] text-slate-500 font-sans ml-1">calls</span>
                        </td>

                        {/* Input Token (Sum) */}
                        <td
                          className="py-3 text-right text-slate-600 font-mono"
                          title={`${row.inputTokens.toLocaleString()} tokens`}
                        >
                          {formatTokens(row.inputTokens)}
                        </td>

                        {/* Output Token (Sum) */}
                        <td
                          className="py-3 text-right text-slate-600 font-mono"
                          title={`${row.outputTokens.toLocaleString()} tokens`}
                        >
                          {formatTokens(row.outputTokens)}
                        </td>

                        {/* Cost (Sum) */}
                        <td className="py-3 text-right">
                          <span className="text-emerald-600 font-bold font-mono">
                            {formatCost(row.costUsd)}
                          </span>
                          <span className="text-[10px] text-slate-500 font-sans ml-1">USD</span>
                        </td>

                        {/* Per-call audit trail for this user + model pair */}
                        <td className="py-3 text-right">
                          <button
                            onClick={() =>
                              setLogsTarget({ userEmail: row.userEmail, model: row.model })
                            }
                            title={`View every call by ${row.userEmail} on ${row.model}`}
                            className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold text-blue-600 hover:underline cursor-pointer"
                          >
                            <ScrollText className="w-3.5 h-3.5" />
                            View logs
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Table Totals Summary Footer */}
              {displayedConsumptionRows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-mono text-xs bg-slate-50 font-bold">
                    <td className="py-3 text-slate-700 font-sans">
                      Total ({displayedConsumptionRows.length} rows)
                    </td>
                    <td className="py-3 text-slate-500 font-sans">
                      All Filtered Models
                    </td>
                    <td className="py-3 text-right text-slate-900">
                      {tableTotals.traffic} <span className="text-[10px] text-slate-500 font-sans font-normal">calls</span>
                    </td>
                    <td className="py-3 text-right text-slate-700">
                      {tableTotals.inTokens}
                    </td>
                    <td className="py-3 text-right text-slate-700">
                      {tableTotals.outTokens}
                    </td>
                    <td className="py-3 text-right text-emerald-600 text-sm">
                      ${tableTotals.cost} <span className="text-[10px] text-slate-500 font-sans font-normal">USD</span>
                    </td>
                    {/* Logs column has no meaningful total. */}
                    <td className="py-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
        {/*
          Per-call audit trail for a single ledger row. Keyed on the target and
          the dashboard range so React remounts it on each open -- that re-seeds
          the window selector from `timeRange` without an extra sync effect,
          which would otherwise fire a second Cloud Logging query on the stale
          window every time the modal opened.
        */}
        {logsTarget && (
          <CallLogsModal
            key={`${logsTarget.userEmail}|${logsTarget.model}|${timeRange}`}
            isOpen
            onClose={() => setLogsTarget(null)}
            userEmail={logsTarget.userEmail}
            model={logsTarget.model}
            initialWindow={timeRange}
          />
        )}
      </div>
    </div>
  );
};
