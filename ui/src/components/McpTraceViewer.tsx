import React, { useState } from 'react';
import { McpTelemetry, McpTool } from '../types';
import {
  Activity,
  Clock,
  Code2,
  Copy,
  Check,
  FileJson,
  Send,
  User,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Table,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Database,
} from 'lucide-react';

interface McpTraceViewerProps {
  telemetry: McpTelemetry | null;
  loading?: boolean;
}

/**
 * High-contrast JSON syntax highlighter for dark terminal/code editor views
 */
const highlightJson = (json: any): string => {
  if (typeof json !== 'string') {
    json = JSON.stringify(json, null, 2);
  }
  if (!json) return '';

  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match: string) => {
      let cls = 'text-amber-400'; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-cyan-400 font-semibold'; // JSON key
        } else {
          cls = 'text-emerald-400'; // string value
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-purple-400 font-bold'; // boolean
      } else if (/null/.test(match)) {
        cls = 'text-rose-400 italic'; // null
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
};

/**
 * Formats snake_case or camelCase property names into clean human labels
 */
const formatLabel = (key: string): string => {
  const specialMap: Record<string, string> = {
    sku: 'Part SKU',
    part_SKU: 'Part SKU',
    discounted_price: 'Discounted Price',
    original_price: 'Original Price',
    applicationId: 'Application ID',
    applicantName: 'Applicant Name',
    firstName: 'First Name',
    lastName: 'Last Name',
    dateOfBirth: 'Date of Birth',
    ssnLast4: 'SSN (Last 4)',
    zipCode: 'ZIP Code',
    creditScore: 'Credit Score',
    applicantSegment: 'Customer Segment',
    phoneNumber: 'Phone Number',
    loanAmount: 'Loan Amount',
    loanProductType: 'Loan Product Type',
    loanTermMonths: 'Term (Months)',
    faultstring: 'Diagnostic Message',
    errorcode: 'Error Code',
  };
  if (specialMap[key]) return specialMap[key];

  return key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 *Categorizes MCP tools into business service domains
 */
const getToolDomain = (toolName: string): { label: string; badgeClass: string } => {
  const lower = toolName.toLowerCase();
  if (lower.includes('loan')) {
    return {
      label: 'Loans & Banking',
      badgeClass:
        'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60',
    };
  }
  if (lower.includes('discount') || lower.includes('sku') || lower.includes('part')) {
    return {
      label: 'Sales & Inventory',
      badgeClass:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60',
    };
  }
  return {
    label: 'Core Enterprise',
    badgeClass:
      'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/60',
  };
};

/**
 * Renders an individual table cell or record value with rich formatting
 */
const renderFormattedValue = (key: string, val: any): React.ReactNode => {
  if (val === null || val === undefined) {
    return <span className="text-slate-400 italic">—</span>;
  }

  const lowerKey = key.toLowerCase();

  // Price / Currency formatting
  if (
    typeof val === 'number' &&
    (lowerKey.includes('price') || lowerKey.includes('amount') || lowerKey.includes('income'))
  ) {
    return (
      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
        ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    );
  }

  // Status badges
  if (lowerKey === 'status' && typeof val === 'string') {
    const upper = val.toUpperCase();
    const isApproved = upper.includes('APPROV') || upper === 'OK' || upper === 'ACTIVE';
    const isRejected = upper.includes('REJECT') || upper.includes('DENI') || upper.includes('FAIL');
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
          isApproved
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
            : isRejected
            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
            : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
        }`}
      >
        {val}
      </span>
    );
  }

  // SKU / ID / Code badges
  if (
    typeof val === 'string' &&
    (lowerKey.includes('sku') ||
      lowerKey.includes('id') ||
      lowerKey === 'errorcode' ||
      /^[A-Z0-9_-]{5,}$/.test(val))
  ) {
    return (
      <span className="font-mono font-semibold text-cyan-700 dark:text-cyan-300 bg-cyan-50/80 dark:bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-200/60 dark:border-cyan-800/50 text-[11px]">
        {val}
      </span>
    );
  }

  if (typeof val === 'boolean') {
    return (
      <span
        className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
          val
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
        }`}
      >
        {String(val)}
      </span>
    );
  }

  if (typeof val === 'object') {
    return (
      <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
        {JSON.stringify(val)}
      </span>
    );
  }

  return <span className="text-slate-800 dark:text-slate-200 font-medium">{String(val)}</span>;
};

/**
 * Flattens nested object properties for clean 2-column business record tables
 */
const flattenObjectEntries = (
  obj: Record<string, any>,
  prefix = ''
): Array<{ section?: string; key: string; label: string; value: any }> => {
  const rows: Array<{ section?: string; key: string; label: string; value: any }> = [];

  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const sectionTitle = formatLabel(k);
      const nested = flattenObjectEntries(v, `${prefix}${k}.`);
      if (nested.length > 0) {
        nested[0].section = sectionTitle;
        rows.push(...nested);
      }
    } else {
      rows.push({
        key: `${prefix}${k}`,
        label: formatLabel(k),
        value: v,
      });
    }
  }
  return rows;
};

type ParsedMcpView =
  | { kind: 'catalog'; tools: McpTool[] }
  | { kind: 'array'; rows: Array<Record<string, any>>; toolName: string }
  | { kind: 'record'; record: Record<string, any>; toolName: string }
  | { kind: 'fault'; fault: Record<string, any>; status: number; toolName: string }
  | { kind: 'text'; text: string; toolName: string };

const parseMcpPayload = (telemetry: McpTelemetry): ParsedMcpView => {
  const raw = telemetry.rawResponse;
  const toolMatch = telemetry.method.match(/tools\/call\s*\(([^)]+)\)/);
  const toolName = toolMatch ? toolMatch[1] : telemetry.method;

  // 1. Check for tools/list catalog
  if (telemetry.method === 'tools/list' || Array.isArray(raw?.result?.tools)) {
    return {
      kind: 'catalog',
      tools: raw?.result?.tools || [],
    };
  }

  // 2. Extract inner text content from MCP tools/call response if present
  let innerData: any = raw?.result;
  if (raw?.result?.content && Array.isArray(raw.result.content) && raw.result.content[0]?.text) {
    const rawText = raw.result.content[0].text;
    try {
      innerData = JSON.parse(rawText);
    } catch {
      innerData = rawText;
    }
  } else if (raw?.error) {
    innerData = raw.error;
  } else if (!innerData && raw) {
    innerData = raw;
  }

  // 3. Check if response is an error / policy block / upstream fault
  const isErrorStatus = telemetry.status >= 400 || raw?.result?.isError === true || Boolean(raw?.error);
  const hasFaultObject =
    innerData && typeof innerData === 'object' && (innerData.fault || innerData.error || innerData.errorcode);

  if (isErrorStatus || hasFaultObject) {
    const faultObj = innerData?.fault || innerData?.error || innerData || { message: telemetry.statusText };
    return {
      kind: 'fault',
      fault: typeof faultObj === 'object' ? faultObj : { message: String(faultObj) },
      status: telemetry.status,
      toolName,
    };
  }

  // 4. Array of records (e.g. listAllDiscounts)
  if (Array.isArray(innerData)) {
    return {
      kind: 'array',
      rows: innerData,
      toolName,
    };
  }

  // 5. Single structured object record (e.g. getDiscountForSku, getLoanApplication)
  if (innerData && typeof innerData === 'object') {
    return {
      kind: 'record',
      record: innerData,
      toolName,
    };
  }

  // 6. Plain text fallback
  return {
    kind: 'text',
    text: typeof innerData === 'string' ? innerData : JSON.stringify(innerData, null, 2),
    toolName,
  };
};

export const McpTraceViewer: React.FC<McpTraceViewerProps> = ({ telemetry, loading }) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const sub = new URLSearchParams(window.location.search).get('subtab');
      if (sub === 'headers' || sub === 'request' || sub === 'response') return true;
    }
    return false;
  });

  const [activeTab, setActiveTab] = useState<'response' | 'request' | 'headers'>(() => {
    if (typeof window !== 'undefined') {
      const sub = new URLSearchParams(window.location.search).get('subtab');
      if (sub === 'headers' || sub === 'request' || sub === 'response') return sub;
    }
    return 'response';
  });

  const [copied, setCopied] = useState(false);

  const getLatencyColor = (ms: number) => {
    if (ms < 250) return 'text-emerald-600 dark:text-emerald-400';
    if (ms < 1000) return 'text-blue-600 dark:text-blue-400';
    if (ms < 2500) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
        <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-600 dark:border-t-cyan-400 rounded-full animate-spin mb-4" />
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-200">Executing MCP Request</h4>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xs">
          Validating governance policies and executing tool via MCP Gateway...
        </p>
      </div>
    );
  }

  if (!telemetry) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400 mb-4">
          <Activity className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-200">MCP Protocol & Trace Telemetry</h4>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-sm leading-relaxed">
          Select a registered tool and click <span className="text-cyan-600 dark:text-cyan-300 font-medium">Execute Tool</span> or choose a preset scenario to inspect structured results and live telemetry.
        </p>
      </div>
    );
  }

  const parsedView = parseMcpPayload(telemetry);
  const isSuccess = telemetry.status >= 200 && telemetry.status < 300 && parsedView.kind !== 'fault';
  const isRateLimited = telemetry.status === 429;

  const handleCopy = (content: any) => {
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 font-sans text-xs overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
      {/* Top Header Bar */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between bg-white dark:bg-slate-900/60 shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isSuccess ? 'bg-emerald-500 animate-pulse' : isRateLimited ? 'bg-amber-500' : 'bg-rose-500'
            }`}
          />
          <h2 className="font-bold text-slate-800 dark:text-slate-200 text-xs tracking-wide uppercase">
            MCP Gateway Telemetry
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
              isSuccess
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                : isRateLimited
                ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 text-amber-300 dark:border-amber-500/30'
                : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30'
            }`}
          >
            HTTP {telemetry.status} {telemetry.statusText}
          </span>
        </div>
      </div>

      {/* Scrollable Main Content Body */}
      <div className="p-3.5 space-y-3 flex-1 overflow-y-auto">
        {/* Executive Telemetry Summary Cards (2-Column Grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Card 1: Protocol & Execution */}
          <div className="p-3 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  MCP Operation
                </span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 font-semibold">
                JSON-RPC 2.0
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-0.5">
              <div className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs truncate max-w-[180px]">
                {telemetry.method}
              </div>
              <div className="flex items-center gap-1 font-mono text-xs font-bold">
                <Clock className="w-3 h-3 text-slate-400" />
                <span className={getLatencyColor(telemetry.latencyMs)}>{telemetry.latencyMs} ms</span>
              </div>
            </div>
          </div>

          {/* Card 2: Caller Identity & Policy Governance */}
          <div className="p-3 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {isSuccess ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                )}
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Access Governance
                </span>
              </div>
              {telemetry.activeUser && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-semibold text-[9px] border border-amber-300 dark:border-amber-500/30 tracking-wide uppercase">
                  {telemetry.activeUser.replace('_', ' ')}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-0.5 text-[11px]">
              <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300 truncate max-w-[180px]">
                <User className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-mono truncate">
                  {telemetry.userEmail || telemetry.ssoUser?.email || 'SSO Authenticated'}
                </span>
              </div>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border font-semibold ${
                  isRateLimited
                    ? 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/60'
                    : 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/50'
                }`}
              >
                {isRateLimited ? 'Quota Breached' : 'Policies Verified'}
              </span>
            </div>
          </div>
        </div>

        {/* Structured Result View Section (Replaces Raw JSON Dump) */}
        <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
          {/* Section Header */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Table className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                {parsedView.kind === 'catalog'
                  ? 'Discovered MCP Tool Catalog'
                  : parsedView.kind === 'array'
                  ? `Tool Execution Result — ${parsedView.toolName}`
                  : parsedView.kind === 'record'
                  ? `Business Record Result — ${parsedView.toolName}`
                  : parsedView.kind === 'fault'
                  ? `Gateway & Service Diagnostic — ${parsedView.toolName}`
                  : 'Tool Execution Output'}
              </span>
            </div>

            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {parsedView.kind === 'catalog'
                ? `${parsedView.tools.length} Registered Tools`
                : parsedView.kind === 'array'
                ? `${parsedView.rows.length} Records Returned`
                : parsedView.kind === 'record'
                ? 'Structured Entity'
                : parsedView.kind === 'fault'
                ? 'Policy / Auth Notice'
                : 'Text Output'}
            </span>
          </div>

          {/* CASE 1: Tool Discovery Catalog Table (tools/list) */}
          {parsedView.kind === 'catalog' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-950/60 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3.5">Tool Name</th>
                    <th className="py-2.5 px-3">Domain</th>
                    <th className="py-2.5 px-3">Parameters</th>
                    <th className="py-2.5 px-3.5">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/60 text-xs">
                  {parsedView.tools.map((tool) => {
                    const domain = getToolDomain(tool.name);
                    const props = tool.inputSchema?.properties || {};
                    const requiredList = tool.inputSchema?.required || [];
                    const paramKeys = Object.keys(props);

                    return (
                      <tr
                        key={tool.name}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-850/40 transition"
                      >
                        <td className="py-2.5 px-3.5 font-mono font-bold text-cyan-700 dark:text-cyan-300 whitespace-nowrap">
                          {tool.name}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${domain.badgeClass}`}
                          >
                            {domain.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {paramKeys.length === 0 ? (
                            <span className="text-[11px] text-slate-400 italic">None</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {paramKeys.map((pKey) => {
                                const isReq = requiredList.includes(pKey);
                                return (
                                  <span
                                    key={pKey}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                  >
                                    <span>{pKey}</span>
                                    {isReq && <span className="text-rose-500 font-bold">*</span>}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-300 text-[11px] leading-snug max-w-xs">
                          {tool.description}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* CASE 2: Array of Records Table (e.g. listAllDiscounts) */}
          {parsedView.kind === 'array' && (
            <div className="overflow-x-auto">
              {parsedView.rows.length === 0 ? (
                <div className="p-6 text-center text-slate-500 italic">No records returned.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-950/60 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3.5 w-10 text-center">#</th>
                      {Object.keys(parsedView.rows[0]).map((colKey) => (
                        <th key={colKey} className="py-2.5 px-3.5">
                          {formatLabel(colKey)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/60 text-xs">
                    {parsedView.rows.map((row, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-850/40 transition"
                      >
                        <td className="py-2.5 px-3.5 text-center font-mono text-[11px] text-slate-400">
                          {idx + 1}
                        </td>
                        {Object.entries(row).map(([colKey, val]) => (
                          <td key={colKey} className="py-2.5 px-3.5">
                            {renderFormattedValue(colKey, val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* CASE 3: Single Business Entity Record Table (e.g. getDiscountForSku, getLoanApplication) */}
          {parsedView.kind === 'record' && (
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800/60">
              {flattenObjectEntries(parsedView.record).map((item) => (
                <React.Fragment key={item.key}>
                  {item.section && (
                    <div className="px-4 py-1.5 bg-slate-100/80 dark:bg-slate-950/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Database className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                      <span>{item.section}</span>
                    </div>
                  )}
                  <div className="px-4 py-2.5 flex items-center justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-850/30 transition">
                    <span className="text-slate-600 dark:text-slate-400 font-medium text-xs">
                      {item.label}
                    </span>
                    <div className="text-right">{renderFormattedValue(item.key, item.value)}</div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* CASE 4: Policy / Governance Block or Upstream Service Fault */}
          {parsedView.kind === 'fault' && (
            <div className="p-4 space-y-3">
              <div
                className={`p-3 rounded-xl border flex items-start gap-3 ${
                  telemetry.status === 429
                    ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-500/40 text-amber-900 dark:text-amber-200'
                    : 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-500/40 text-rose-900 dark:text-rose-200'
                }`}
              >
                <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1 text-xs">
                  <div className="font-bold">
                    {telemetry.status === 429
                      ? 'Gateway Rate Quota Enforcement Triggered (HTTP 429)'
                      : telemetry.status === 401 || telemetry.status === 403
                      ? 'Gateway Authorization Enforcement Triggered'
                      : 'Downstream Service Response Captured'}
                  </div>
                  <p className="text-[11px] opacity-90 leading-relaxed">
                    {telemetry.status === 429
                      ? 'The MCP Gateway Q-Limit policy intercepted this tool call because the caller exceeded the allowed burst rate limit.'
                      : 'The MCP Gateway validated the JSON-RPC 2.0 protocol envelope and captured the following response from the target service.'}
                  </p>
                </div>
              </div>

              {/* Structured Fault Details Table */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-200/70 dark:divide-slate-800/60">
                {flattenObjectEntries(parsedView.fault).map((item) => (
                  <div
                    key={item.key}
                    className="px-3.5 py-2 flex items-start justify-between gap-4 bg-slate-50/40 dark:bg-slate-900/40"
                  >
                    <span className="text-slate-500 dark:text-slate-400 font-medium text-[11px] shrink-0">
                      {item.label}
                    </span>
                    <div className="text-right break-all">{renderFormattedValue(item.key, item.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CASE 5: Plain Text Output */}
          {parsedView.kind === 'text' && (
            <div className="p-4 font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
              {parsedView.text}
            </div>
          )}
        </div>

        {/* Collapsible Accordion: Inspect JSON-RPC Wire Payload & HTTP Headers */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-white hover:bg-slate-100/80 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 transition text-xs shadow-2xs cursor-pointer"
          >
            <div className="flex items-center gap-2 font-semibold">
              <Code2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Inspect JSON-RPC Wire Payload & HTTP Headers</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              <span>{showTechnicalDetails ? 'Hide' : 'Show'}</span>
              {showTechnicalDetails ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </button>

          {showTechnicalDetails && (
            <div className="mt-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm animate-in fade-in duration-150">
              {/* Tab Switcher for Wire Details */}
              <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab('response')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'response'
                        ? 'bg-cyan-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <FileJson className="w-3.5 h-3.5" />
                    JSON-RPC Response
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('request')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'request'
                        ? 'bg-cyan-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    JSON-RPC Request
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('headers')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'headers'
                        ? 'bg-cyan-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Headers
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const content =
                      activeTab === 'response'
                        ? telemetry.rawResponse
                        : activeTab === 'request'
                        ? telemetry.rawRequest
                        : {
                            headersReceived: telemetry.headersReceived,
                            headersSent: telemetry.headersSent,
                          };
                    handleCopy(content);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-medium transition cursor-pointer shadow-2xs"
                  title="Copy payload"
                >
                  {copied ? (
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              {/* Tab Content Display */}
              <div className="p-3.5 font-mono text-xs leading-relaxed">
                {activeTab === 'response' && (
                  <pre
                    className="code-editor-dark p-3.5 rounded-xl border border-slate-800 overflow-x-auto text-xs leading-relaxed selection:bg-cyan-900 shadow-inner max-h-80"
                    style={{ backgroundColor: '#0f172a', color: '#e2e8f0' }}
                    dangerouslySetInnerHTML={{
                      __html: highlightJson(telemetry.rawResponse),
                    }}
                  />
                )}

                {activeTab === 'request' && (
                  <div className="space-y-2">
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 font-sans">
                      Payload posted to{' '}
                      <code className="font-mono text-cyan-600 dark:text-cyan-400 font-semibold">
                        {telemetry.endpointUrl}
                      </code>
                      :
                    </div>
                    <pre
                      className="code-editor-dark p-3.5 rounded-xl border border-slate-800 overflow-x-auto text-xs leading-relaxed selection:bg-cyan-900 shadow-inner max-h-80"
                      style={{ backgroundColor: '#0f172a', color: '#e2e8f0' }}
                      dangerouslySetInnerHTML={{
                        __html: highlightJson(telemetry.rawRequest),
                      }}
                    />
                  </div>
                )}

                {activeTab === 'headers' && (
                  <div className="space-y-3">
                    {/* Headers Received from Gateway */}
                    <div className="bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3 shadow-2xs">
                      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200 dark:border-slate-800">
                        <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 font-sans uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                          <span>Headers Received from Gateway</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-medium">
                          {Object.keys(telemetry.headersReceived).length} headers
                        </span>
                      </div>
                      <div className="divide-y divide-slate-200/80 dark:divide-slate-800/60 font-mono text-[11px] max-h-48 overflow-y-auto">
                        {Object.entries(telemetry.headersReceived).map(([k, v]) => (
                          <div key={k} className="py-1.5 px-1 flex items-start justify-between gap-3">
                            <span className="text-cyan-700 dark:text-cyan-400 font-semibold select-all shrink-0">
                              {k}:
                            </span>
                            <span className="text-slate-900 dark:text-slate-100 text-right break-all select-all font-medium">
                              {v}
                            </span>
                          </div>
                        ))}
                        {Object.keys(telemetry.headersReceived).length === 0 && (
                          <div className="py-3 text-center text-slate-500 dark:text-slate-400 text-xs italic font-sans">
                            No headers received in response
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Headers Sent by Client */}
                    <div className="bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3 shadow-2xs">
                      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200 dark:border-slate-800">
                        <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 font-sans uppercase tracking-wider flex items-center gap-1.5">
                          <Send className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                          <span>Headers Sent by Client</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-medium">
                          {Object.keys(telemetry.headersSent).length} headers
                        </span>
                      </div>
                      <div className="divide-y divide-slate-200/80 dark:divide-slate-800/60 font-mono text-[11px]">
                        {Object.entries(telemetry.headersSent).map(([k, v]) => (
                          <div key={k} className="py-1.5 px-1 flex items-start justify-between gap-3">
                            <span className="text-slate-700 dark:text-slate-300 font-semibold select-all shrink-0">
                              {k}:
                            </span>
                            <span className="text-slate-900 dark:text-slate-100 text-right break-all select-all font-medium">
                              {k.toLowerCase() === 'x-apikey' && v && v.length > 12
                                ? `${v.slice(0, 8)}...${v.slice(-4)}`
                                : v}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


