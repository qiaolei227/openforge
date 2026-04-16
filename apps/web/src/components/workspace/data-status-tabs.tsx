'use client';

import { useTranslations } from 'next-intl';

const STATUSES = ['all', 'draft', 'submitted', 'approved', 'reaudit'] as const;
type StatusKey = (typeof STATUSES)[number];

const STATUS_COLORS: Record<StatusKey, string> = {
  all: 'bg-muted text-muted-foreground',
  draft: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  reaudit: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

interface DataStatusTabsProps {
  activeTab: string | null; // null = 'all'
  counts: Record<string, number>;
  onChange: (status: string | null) => void;
}

export function DataStatusTabs({ activeTab, counts, onChange }: DataStatusTabsProps) {
  const tStatus = useTranslations('dataStatus');
  const t = useTranslations('workspace');

  const current = activeTab ?? 'all';

  return (
    <div className="flex items-center gap-1">
      {STATUSES.map((key) => {
        const isActive = current === key;
        const count = key === 'all' ? (counts.all ?? 0) : (counts[key] ?? 0);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key === 'all' ? null : key)}
            className={`inline-flex items-center gap-1.5 h-7 px-3 text-xs rounded-md border transition-colors ${
              isActive
                ? 'border-primary bg-primary/5 text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {key === 'all' ? t('statusTab.all') : tStatus(key)}
            <span
              className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full text-[10px] px-1 ${
                isActive ? STATUS_COLORS[key] : 'bg-muted text-muted-foreground'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
