'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { FieldType } from '@openforge/shared';
import type { ApiQueryFn, PickerColumn } from './field-props';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ReferencePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'single' | 'multiple';
  queryFn: ApiQueryFn;
  targetAppCode: string;
  targetModelCode: string;
  targetModelName: string;
  columns: PickerColumn[];
  /** Pre-selected record IDs (multiple mode) */
  selectedIds?: string[];
  /** Exclude these IDs from results (e.g. already in subtable rows) */
  excludeIds?: string[];
  onConfirmSingle?: (record: Record<string, any>) => void;
  onConfirmMultiple?: (records: Record<string, any>[]) => void;
  t: (key: string, values?: Record<string, any>) => string;
}

// ---------------------------------------------------------------------------
// Cell formatting
// ---------------------------------------------------------------------------

function formatCellValue(value: any, fieldType: FieldType): string {
  if (value === null || value === undefined) return '';
  if (fieldType === 'BOOLEAN') return value ? '✓' : '';
  if (fieldType === 'DATE' || fieldType === 'DATETIME') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// Inline SVG icons (no external dependencies)
// ---------------------------------------------------------------------------

function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function Loader2Icon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

const BTN_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none';
const BTN_PRIMARY = `${BTN_BASE} bg-primary text-primary-foreground hover:bg-primary/90`;
const BTN_OUTLINE = `${BTN_BASE} border border-input bg-background hover:bg-accent hover:text-accent-foreground`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;

export default function ReferencePickerDialog({
  open,
  onOpenChange,
  mode,
  queryFn,
  targetAppCode,
  targetModelCode,
  targetModelName,
  columns,
  selectedIds = [],
  excludeIds = [],
  onConfirmSingle,
  onConfirmMultiple,
  t,
}: ReferencePickerDialogProps) {
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Single mode
  const [singleSelected, setSingleSelected] = useState<Record<string, any> | null>(null);

  // Multiple mode: track selected IDs + a full-record cache so we can return
  // complete objects on confirm even if those records are on another page.
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const recordCacheRef = useRef<Map<string, Record<string, any>>>(new Map());

  const excludeSet = new Set(excludeIds);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ----- Reset state when dialog opens -----
  useEffect(() => {
    if (open) {
      setKeyword('');
      setPage(1);
      setData([]);
      setTotal(0);
      setSingleSelected(null);
      setMultiSelected(new Set(selectedIds));
      recordCacheRef.current = new Map();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ----- Fetch data on keyword/page change -----
  const fetchData = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const result = await queryFn(
        { appCode: targetAppCode, modelCode: targetModelCode },
        { keyword: keyword || undefined, page, pageSize: PAGE_SIZE, includeArchived: false },
      );
      // Filter out excluded IDs client-side
      const filtered = (result.data ?? []).filter((r) => !excludeSet.has(r.id));
      setData(filtered);
      setTotal(result.total);

      // Populate record cache for multiple mode
      if (mode === 'multiple') {
        for (const record of filtered) {
          recordCacheRef.current.set(record.id, record);
        }
      }
    } catch {
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, queryFn, targetAppCode, targetModelCode, keyword, page, mode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ----- Confirm handlers -----
  function handleConfirmSingle() {
    if (singleSelected && onConfirmSingle) {
      onConfirmSingle(singleSelected);
    }
    onOpenChange(false);
  }

  function handleConfirmMultiple() {
    if (onConfirmMultiple) {
      const records: Record<string, any>[] = [];
      for (const id of multiSelected) {
        const cached = recordCacheRef.current.get(id);
        if (cached) records.push(cached);
      }
      onConfirmMultiple(records);
    }
    onOpenChange(false);
  }

  // ----- Select-all on current page -----
  const pageIds = data.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => multiSelected.has(id));
  const somePageSelected = pageIds.some((id) => multiSelected.has(id));

  function handleToggleAllOnPage() {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) {
          next.add(id);
          // Ensure cache has these records
          const r = data.find((row) => row.id === id);
          if (r) recordCacheRef.current.set(id, r);
        }
      }
      return next;
    });
  }

  function handleToggleRow(record: Record<string, any>) {
    if (mode === 'single') {
      setSingleSelected((prev) => (prev?.id === record.id ? null : record));
    } else {
      setMultiSelected((prev) => {
        const next = new Set(prev);
        if (next.has(record.id)) {
          next.delete(record.id);
        } else {
          next.add(record.id);
          recordCacheRef.current.set(record.id, record);
        }
        return next;
      });
    }
  }

  if (!open) return null;

  const confirmDisabled =
    mode === 'single' ? singleSelected === null : multiSelected.size === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal */}
      <div className="relative z-10 flex w-full max-w-2xl flex-col rounded-lg border border-border bg-background shadow-lg"
        style={{ maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            {t('referencePicker.title', { name: targetModelName })}
          </h3>
          <button
            type="button"
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            <XIcon />
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 border-b border-border px-4 py-2">
          <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5">
            <span className="text-muted-foreground">
              <SearchIcon />
            </span>
            <input
              type="text"
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
              placeholder={t('referencePicker.search')}
            />
            {loading && (
              <span className="text-muted-foreground">
                <Loader2Icon />
              </span>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-background">
              <tr>
                {/* Selection column */}
                <th className="w-10 px-3 py-2 text-left">
                  {mode === 'multiple' ? (
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={allPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = somePageSelected && !allPageSelected;
                      }}
                      onChange={handleToggleAllOnPage}
                      disabled={data.length === 0}
                    />
                  ) : (
                    <span className="sr-only">Select</span>
                  )}
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-2 text-left font-medium text-muted-foreground"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && data.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    {t('referencePicker.empty')}
                  </td>
                </tr>
              )}
              {loading && data.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Loader2Icon />
                      {t('referencePicker.loading')}
                    </span>
                  </td>
                </tr>
              )}
              {data.map((record) => {
                const isSelected =
                  mode === 'single'
                    ? singleSelected?.id === record.id
                    : multiSelected.has(record.id);
                return (
                  <tr
                    key={record.id}
                    className={`cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-accent/50 ${
                      isSelected ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => handleToggleRow(record)}
                  >
                    {/* Selection cell */}
                    <td className="w-10 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      {mode === 'single' ? (
                        <input
                          type="radio"
                          className="h-4 w-4 accent-primary"
                          checked={isSelected}
                          onChange={() => handleToggleRow(record)}
                        />
                      ) : (
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input"
                          checked={isSelected}
                          onChange={() => handleToggleRow(record)}
                        />
                      )}
                    </td>
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className="px-3 py-2 text-foreground"
                      >
                        {formatCellValue(record[col.key], col.fieldType)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-3">
          {/* Left: total + pagination */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {t('referencePicker.total', { count: total })}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={`${BTN_OUTLINE} px-1.5 py-1`}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeftIcon />
              </button>
              <span className="min-w-[56px] text-center text-xs text-muted-foreground">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className={`${BTN_OUTLINE} px-1.5 py-1`}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRightIcon />
              </button>
            </div>
          </div>

          {/* Right: cancel + confirm */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={BTN_OUTLINE}
              onClick={() => onOpenChange(false)}
            >
              {t('referencePicker.cancel')}
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={confirmDisabled}
              onClick={mode === 'single' ? handleConfirmSingle : handleConfirmMultiple}
            >
              {mode === 'multiple' && multiSelected.size > 0
                ? t('referencePicker.confirmCount', { count: multiSelected.size })
                : t('referencePicker.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
