'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';

const locales = [
  { code: 'zh-CN', flag: '🇨🇳', label: '简体中文' },
  { code: 'en', flag: '🇺🇸', label: 'English' },
];

function getCurrentLocale(): string {
  if (typeof document === 'undefined') return 'zh-CN';
  return (
    document.cookie
      .split('; ')
      .find((row) => row.startsWith('locale='))
      ?.split('=')[1] || 'zh-CN'
  );
}

export function LocaleSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [currentLocale, setCurrentLocale] = useState('zh-CN');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentLocale(getCurrentLocale());
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const current = locales.find((l) => l.code === currentLocale) || locales[0];

  const handleSelect = (code: string) => {
    document.cookie = `locale=${code};path=/;max-age=${60 * 60 * 24 * 365}`;
    setCurrentLocale(code);
    setOpen(false);
    router.refresh();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium h-8 px-2.5 hover:bg-accent hover:text-accent-foreground transition-colors text-muted-foreground"
      >
        <Globe className="w-4 h-4" />
        <span>{current.label}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 rounded-md border bg-popover shadow-md z-50">
          {locales.map((locale) => (
            <button
              key={locale.code}
              onClick={() => handleSelect(locale.code)}
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors ${
                locale.code === currentLocale ? 'bg-accent/50 font-medium' : ''
              }`}
            >
              <span className="text-base">{locale.flag}</span>
              <span>{locale.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
