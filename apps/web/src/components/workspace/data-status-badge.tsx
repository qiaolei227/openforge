'use client';

import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  pending_revision: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export function DataStatusBadge({ status }: { status: string }) {
  const t = useTranslations('dataStatus');
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        STATUS_STYLES[status] || 'bg-muted text-muted-foreground',
      )}
    >
      {t(status)}
    </span>
  );
}
