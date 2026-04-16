'use client';

import { useMemo } from 'react';

/* ── Inline SVG icons ── */
function ChevronLeftIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export interface DataTablePaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  t: (key: string, values?: Record<string, any>) => string;
}

export function DataTablePagination({ total, page, pageSize, onPageChange, onPageSizeChange, t }: DataTablePaginationProps) {
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {t('common.total', { count: total })}
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">{t('common.perPage')}</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 rounded-md border border-input bg-background px-2 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={!hasPrev}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center justify-center h-8 px-3 text-sm rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:pointer-events-none transition-colors"
          aria-label={t('common.prevPage')}
        >
          <ChevronLeftIcon />
          <span className="ml-1">{t('common.prevPage')}</span>
        </button>

        <span className="inline-flex items-center justify-center h-8 px-3 text-sm text-muted-foreground">
          {page} / {totalPages}
        </span>

        <button
          type="button"
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center justify-center h-8 px-3 text-sm rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:pointer-events-none transition-colors"
          aria-label={t('common.nextPage')}
        >
          <span className="mr-1">{t('common.nextPage')}</span>
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  );
}
