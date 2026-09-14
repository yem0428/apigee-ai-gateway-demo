import React, { useState, useRef, useEffect } from 'react';
import { Moon, Sun, Sunset, Zap, Check } from 'lucide-react';
import { AppTheme } from '../types';

interface ThemeSelectorProps {
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  direction?: 'up' | 'down';
}

interface ThemeOption {
  id: AppTheme;
  name: string;
  tag: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  previewBg: string;
  previewBorder: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'midnight',
    name: 'Midnight Dark',
    tag: 'Default',
    icon: Moon,
    accentColor: 'text-blue-400',
    previewBg: 'bg-slate-950',
    previewBorder: 'border-blue-500',
  },
  {
    id: 'light',
    name: 'Cloud Light',
    tag: 'Enterprise',
    icon: Sun,
    accentColor: 'text-amber-500',
    previewBg: 'bg-slate-100',
    previewBorder: 'border-amber-400',
  },
  {
    id: 'sunset',
    name: 'Apigee Sunset',
    tag: 'Warm Dark',
    icon: Sunset,
    accentColor: 'text-orange-400',
    previewBg: 'bg-stone-950',
    previewBorder: 'border-orange-500',
  },
  {
    id: 'cyber',
    name: 'Cyber Matrix',
    tag: 'High Contrast',
    icon: Zap,
    accentColor: 'text-emerald-400',
    previewBg: 'bg-black',
    previewBorder: 'border-emerald-400',
  },
];

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  theme,
  onThemeChange,
  direction = 'down',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const currentOption = THEME_OPTIONS.find((t) => t.id === theme) || THEME_OPTIONS[0];
  const CurrentIcon = currentOption.icon;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition cursor-pointer flex items-center gap-1.5 shadow-xs"
        title={`Current Theme: ${currentOption.name}. Click to change.`}
      >
        <CurrentIcon className={`w-4 h-4 ${currentOption.accentColor}`} />
        <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
          {currentOption.name.split(' ')[0]}
        </span>
      </button>

      {isOpen && (
        <div
          className={`absolute right-0 ${
            direction === 'up' ? 'bottom-full mb-2' : 'mt-2'
          } w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150`}
        >
          <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 flex items-center justify-between">
            <span>Color Theme</span>
            <span className="text-[10px] font-mono text-slate-500 lowercase">4 styles</span>
          </div>

          <div className="mt-1 space-y-1">
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = opt.id === theme;

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onThemeChange(opt.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition cursor-pointer text-xs ${
                    isSelected
                      ? 'bg-blue-600/15 border border-blue-500/40 text-white'
                      : 'hover:bg-slate-800/80 text-slate-300 hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-md ${opt.previewBg} border ${opt.previewBorder} flex items-center justify-center shadow-inner shrink-0`}
                    >
                      <Icon className={`w-3 h-3 ${opt.accentColor}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs truncate">{opt.name}</div>
                      <div className="text-[10px] text-slate-400">{opt.tag}</div>
                    </div>
                  </div>

                  {isSelected && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
