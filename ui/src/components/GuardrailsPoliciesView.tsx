import React, { useMemo, useState } from 'react';
import {
  Search,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Network,
  FileCode2,
  X,
} from 'lucide-react';
import {
  GUARDRAIL_CONTROLS,
  CATEGORY_STYLES,
  AI_PROXY,
  type GuardrailCategory,
  type GuardrailGateway,
} from '../data/guardrailPolicies';

interface GuardrailsPoliciesViewProps {
  /** Opens the Architecture blueprint on the matching gateway pipeline. */
  onInspectArchitecture?: (flow: 'ai-gateway' | 'mcp-gateway') => void;
}

const GATEWAY_LABEL: Record<GuardrailGateway, string> = {
  ai: 'AI Gateway',
  mcp: 'MCP Gateway',
};

export const GuardrailsPoliciesView: React.FC<GuardrailsPoliciesViewProps> = ({
  onInspectArchitecture,
}) => {
  const [category, setCategory] = useState<GuardrailCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const categories = useMemo(
    () => Array.from(new Set(GUARDRAIL_CONTROLS.map((c) => c.category))),
    []
  );

  const controls = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GUARDRAIL_CONTROLS.filter((c) => {
      if (category !== 'all' && c.category !== category) return false;
      if (!q) return true;
      const haystack = [
        c.title,
        c.summary,
        c.category,
        c.attachPoint,
        c.configSource,
        ...c.policies.flatMap((p) => [p.name, p.type, p.purpose]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [category, query]);

  const policyCount = controls.reduce((sum, c) => sum + c.policies.length, 0);
  const isFiltered = category !== 'all' || query.trim() !== '';

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-3.5">
      {/* Summary + filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4.5 h-4.5 text-blue-600" />
            </div>
            <div className="leading-snug">
              <div className="text-sm font-bold text-slate-900">
                {controls.length} guardrail{controls.length === 1 ? '' : 's'} ·{' '}
                {policyCount} polic{policyCount === 1 ? 'y' : 'ies'}
              </div>
              <div className="text-[11px] text-slate-500">
                Enforced by <span className="font-mono text-slate-700">{AI_PROXY}</span> on every request.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search guardrails or policy names"
                className="bg-transparent text-slate-800 text-xs focus:outline-none w-52 placeholder:text-slate-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition cursor-pointer ${
              category === 'all'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            All categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition cursor-pointer ${
                category === cat
                  ? 'bg-blue-600 text-white border-blue-600'
                  : `${CATEGORY_STYLES[cat]} hover:brightness-95`
              }`}
            >
              {cat}
            </button>
          ))}
          {isFiltered && (
            <button
              type="button"
              onClick={() => {
                setCategory('all');
                setQuery('');
              }}
              className="ml-auto text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      {controls.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">
          No guardrails match the current filters.
        </div>
      ) : (
        <div className="space-y-2.5">
          {controls.map((control) => {
            const Icon = control.icon;
            const isOpen = !!expanded[control.id];
            return (
              <div
                key={`${control.gateway}-${control.id}`}
                className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggle(control.id)}
                  className="w-full text-left p-3.5 flex items-start gap-3 hover:bg-slate-50/80 transition cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-slate-600" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900">{control.title}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${
                          CATEGORY_STYLES[control.category]
                        }`}
                      >
                        {control.category}
                      </span>
                      <span className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600">
                        {GATEWAY_LABEL[control.gateway]}
                      </span>
                      <span className="px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700">
                        Active
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-snug mt-1">{control.summary}</p>

                    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-1.5 text-[10px] text-slate-500">
                      <span>
                        <span className="font-semibold text-slate-600">Runs at:</span>{' '}
                        {control.attachPoint}
                      </span>
                      <span>
                        <span className="font-semibold text-slate-600">On violation:</span>{' '}
                        {control.onViolation}
                      </span>
                      <span>
                        <span className="font-semibold text-slate-600">Configured by:</span>{' '}
                        {control.configSource}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pl-1">
                    <span className="text-[10px] font-semibold text-slate-500">
                      {control.policies.length} polic{control.policies.length === 1 ? 'y' : 'ies'}
                    </span>
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                        <FileCode2 className="w-3.5 h-3.5 text-slate-400" />
                        Policies in {control.proxy}
                      </div>
                      {onInspectArchitecture && (
                        <button
                          type="button"
                          onClick={() =>
                            onInspectArchitecture(
                              control.gateway === 'ai' ? 'ai-gateway' : 'mcp-gateway'
                            )
                          }
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 transition cursor-pointer"
                        >
                          <Network className="w-3.5 h-3.5" />
                          View in Architecture
                        </button>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-left text-slate-500">
                            <th className="font-semibold pb-1.5 pr-3">Policy</th>
                            <th className="font-semibold pb-1.5 pr-3">Type</th>
                            <th className="font-semibold pb-1.5">What it does</th>
                          </tr>
                        </thead>
                        <tbody className="align-top">
                          {control.policies.map((policy) => (
                            <tr key={policy.name} className="border-t border-slate-200/70">
                              <td className="py-1.5 pr-3 font-mono font-semibold text-slate-800 whitespace-nowrap">
                                {policy.name}
                              </td>
                              <td className="py-1.5 pr-3 text-slate-600 whitespace-nowrap">
                                {policy.type}
                              </td>
                              <td className="py-1.5 text-slate-600 leading-snug">{policy.purpose}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
