import React, { useState } from 'react';

export interface DonutSlice {
  id: string;
  label: string;
  badge?: string;
  sublabel?: string;
  value: number;
  formattedValue: string;
  color: string;
  badgeBg?: string;
  percentage: number;
}

export interface DonutPieChartProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  data: DonutSlice[];
  totalFormatted: string;
  totalLabel: string;
  unitLabel?: string;
  centerBadgeColor?: string;
}

function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(angleInRadians),
    y: cy + r * Math.sin(angleInRadians),
  };
}

function describeArc(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number) {
  const delta = Math.min(endAngle - startAngle, 359.99);
  const actualEnd = startAngle + delta;

  const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, actualEnd);
  const p3 = polarToCartesian(cx, cy, rInner, actualEnd);
  const p4 = polarToCartesian(cx, cy, rInner, startAngle);

  const largeArcFlag = delta > 180 ? 1 : 0;

  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export const DonutPieChart: React.FC<DonutPieChartProps> = ({
  title,
  subtitle,
  icon,
  data,
  totalFormatted,
  totalLabel,
  unitLabel,
  centerBadgeColor = 'text-slate-900 dark:text-white',
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const total = data.reduce((acc, d) => acc + d.value, 0);

  // Compute start and end angles for each slice
  let currentAngle = 0;
  const slicesWithAngles = data.map((item) => {
    const fraction = total > 0 ? item.value / total : 0;
    const sweepAngle = fraction * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sweepAngle;
    currentAngle = endAngle;

    return {
      ...item,
      startAngle,
      endAngle,
      fraction,
    };
  });

  const activeSlice = slicesWithAngles.find((s) => s.id === hoveredId);

  return (
    <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
      {/* Header with Semrush-inspired purple underline accent */}
      <div className="flex items-start justify-between">
        <div>
          <div className="border-b-2 border-purple-500 inline-flex items-center gap-1.5 pb-0.5 font-bold text-sm text-slate-900 dark:text-white">
            {icon}
            <span>{title}</span>
          </div>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
        </div>
      </div>

      {/* Chart & Categorized Legend (Inspired by Semrush On Page SEO Checker) */}
      <div className="flex flex-col sm:flex-row items-center gap-6 pt-1">
        {/* SVG Donut Canvas */}
        <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
          <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
            {/* Background ring */}
            <circle
              cx="100"
              cy="100"
              r="70"
              fill="none"
              strokeWidth="24"
              className="stroke-slate-100 dark:stroke-slate-800"
            />

            {/* Slices */}
            {slicesWithAngles.map((s) => {
              if (s.value <= 0) return null;
              const isHovered = s.id === hoveredId;
              const rOuter = isHovered ? 86 : 82;
              const rInner = isHovered ? 52 : 54;
              const d = describeArc(100, 100, rOuter, rInner, s.startAngle, s.endAngle);

              return (
                <path
                  key={s.id}
                  d={d}
                  fill={s.color}
                  strokeWidth="2"
                  className="stroke-white dark:stroke-slate-900 transition-all duration-200 cursor-pointer"
                  style={{
                    filter: isHovered ? 'drop-shadow(0 0 8px rgba(0, 0, 0, 0.2))' : 'none',
                    opacity: hoveredId && !isHovered ? 0.4 : 1,
                  }}
                  onMouseEnter={() => setHoveredId(s.id)}
                  onMouseLeave={() => setHoveredId(null)}
                />
              );
            })}
          </svg>

          {/* Center Callout Overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-slate-400 font-semibold leading-none mb-1 truncate max-w-[90px]">
              {activeSlice ? activeSlice.label : totalLabel}
            </span>
            <span className={`text-base sm:text-lg font-bold font-mono tracking-tight leading-none ${centerBadgeColor}`}>
              {activeSlice ? activeSlice.formattedValue : totalFormatted}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-none mt-1">
              {activeSlice ? `${activeSlice.percentage.toFixed(1)}% Share` : unitLabel || 'Total'}
            </span>
          </div>
        </div>

        {/* Categorized List with 2-Letter Badges (Semrush Reference Pattern) */}
        <div className="flex-1 w-full space-y-2 text-xs">
          {slicesWithAngles.map((item) => {
            const isHovered = item.id === hoveredId;
            const badgeText = item.badge || item.label.slice(0, 2).toUpperCase();

            return (
              <div
                key={item.id}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`flex items-center justify-between p-2 rounded-xl border transition cursor-pointer ${
                  isHovered
                    ? 'bg-slate-50 dark:bg-slate-800/80 border-slate-300 dark:border-slate-600 shadow-sm'
                    : 'bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                {/* 2-Letter Badge + Label */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-6 h-6 rounded-lg font-mono font-bold text-[10px] text-white flex items-center justify-center shrink-0 shadow-xs"
                    style={{ backgroundColor: item.color }}
                  >
                    {badgeText}
                  </span>
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {item.label}
                    </div>
                    {item.sublabel && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {item.sublabel}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Aligned Value + Percentage */}
                <div className="text-right shrink-0 pl-3">
                  <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                    {item.formattedValue}
                  </div>
                  <div className="text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {item.percentage.toFixed(1)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
