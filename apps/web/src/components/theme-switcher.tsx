'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';

const themes = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
] as const;

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations('theme');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const current = themes.find((t) => t.value === theme) || themes[2];
  const CurrentIcon = current.icon;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-accent hover:text-accent-foreground transition-colors text-muted-foreground"
        aria-label={t('toggle')}
      >
        {mounted ? <CurrentIcon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 rounded-md border bg-popover shadow-md z-50">
          {themes.map(({ value, icon: Icon }) => (
            <button
              key={value}
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors ${
                theme === value ? 'bg-accent/50 font-medium' : ''
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t(value)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
