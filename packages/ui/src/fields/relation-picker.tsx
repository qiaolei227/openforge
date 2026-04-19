'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { FieldComponentProps, ApiQueryFn, PickerColumn } from './field-props';
import ReferencePickerDialog from './reference-picker-dialog';
import { usePickerColumns } from './use-picker-columns';
import { useSetReferenceRecord } from '@openforge/render-engine';

export interface RelationPickerExtraProps {
  queryFn: ApiQueryFn;
  targetAppCode: string;
  targetModelCode: string;
  targetModelName: string;
  displayValue?: string;
  fetchSchema?: (appCode: string, modelCode: string) => Promise<any>;
  t?: (key: string, values?: Record<string, any>) => string;
  /** Entity context for subtable multi-select (injected by buildFieldExtraProps) */
  entityContext?: {
    existingIds: string[];
    onBatchAddRows?: (rows: Record<string, any>[]) => void;
  };
}

const INPUT_BASE =
  'flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs border-input disabled:cursor-not-allowed disabled:opacity-50';

/* ── Format a popover cell value, preferring backend-resolved __display ── */
function formatPopoverCell(record: Record<string, any>, col: PickerColumn): string {
  const ft = col.fieldType;
  if (ft === 'REFERENCE' || ft === 'USER' || ft === 'ORGANIZATION') {
    const display = record[`${col.key}__display`];
    if (display !== null && display !== undefined && display !== '') return String(display);
    const raw = record[col.key];
    return raw == null ? '' : String(raw);
  }
  if (ft === 'MULTI_REFERENCE') {
    const items = record[`${col.key}__m2m`];
    if (Array.isArray(items) && items.length > 0) {
      return items.map((it: any) => it.displayValue ?? it.id).join(', ');
    }
    return '';
  }
  const val = record[col.key];
  if (val == null) return '';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

/* ── ExternalLink inline SVG icon ── */
function ExternalLinkIcon() {
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
      className="shrink-0"
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

export default function RelationPicker(props: FieldComponentProps & Partial<RelationPickerExtraProps>) {
  const { field, value, onChange, disabled, error, mode, queryFn, targetAppCode, targetModelCode, targetModelName, displayValue, fetchSchema, t } = props;
  const setReferenceRecord = useSetReferenceRecord();

  const displayField = field.options?.targetDisplayField || 'name';

  const { columns } = usePickerColumns(
    field,
    targetAppCode ?? '',
    targetModelCode ?? '',
    fetchSchema ?? (async () => ({ fields: [], views: [] })),
  );

  // Popover columns: field.options.targetDisplayFields if configured, else first 2 from picker columns
  const popoverColumns = useMemo<PickerColumn[]>(() => {
    const configured = field.options?.targetDisplayFields as string[] | undefined;
    if (configured?.length) {
      const colMap = new Map(columns.map((c) => [c.key, c]));
      const resolved = configured.map((k) => colMap.get(k)).filter(Boolean) as PickerColumn[];
      if (resolved.length > 0) return resolved;
    }
    return columns.slice(0, 2);
  }, [field.options?.targetDisplayFields, columns]);
  const searchFields = useMemo(() => popoverColumns.map((c) => c.key), [popoverColumns]);

  const entityCtx = (props as any).entityContext;
  const pickerMode = entityCtx ? 'multiple' : 'single';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [dropdownData, setDropdownData] = useState<Record<string, any>[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [displayText, setDisplayText] = useState(displayValue ?? '');
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync displayValue prop to local state
  useEffect(() => {
    setDisplayText(displayValue ?? '');
  }, [displayValue]);

  // Outside click detection — check both wrapper and portal dropdown
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        wrapperRef.current && !wrapperRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute dropdown position relative to viewport (for portal)
  useEffect(() => {
    if (dropdownOpen && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [dropdownOpen]);

  const [dropdownTotal, setDropdownTotal] = useState(0);

  // Debounced search — empty/space triggers a load-all query
  const doSearch = useCallback(
    async (kw: string) => {
      if (!queryFn || !targetAppCode || !targetModelCode) {
        setDropdownData([]);
        setDropdownOpen(false);
        return;
      }
      try {
        const keyword = kw.trim() || undefined; // empty → load all
        const result = await queryFn(
          { appCode: targetAppCode, modelCode: targetModelCode },
          { keyword, page: 1, pageSize: 6, includeArchived: false, searchFields },
        );
        setDropdownData(result.data.slice(0, 5));
        setDropdownTotal(result.total);
        setDropdownOpen(result.data.length > 0);
      } catch {
        setDropdownData([]);
        setDropdownTotal(0);
        setDropdownOpen(false);
      }
    },
    [queryFn, targetAppCode, targetModelCode, searchFields],
  );

  function handleInputChange(val: string) {
    setSearchKeyword(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(val);
    }, 300);
  }

  // On blur: auto-select if exactly one match, otherwise clear invalid input
  function handleInputBlur() {
    // Small delay so that dropdown item clicks can fire before blur clears state
    setTimeout(() => {
      if (value) return; // Already has a valid selection
      if (dropdownData.length === 1) {
        // Auto-select the single match
        handleSelectRecord(dropdownData[0]);
      } else {
        // No match or multiple — clear the invalid text
        setSearchKeyword('');
        setDropdownOpen(false);
      }
    }, 200);
  }

  function handleSelectRecord(record: Record<string, any>) {
    onChange(record.id);
    setDisplayText(record[displayField] ?? String(record.id));
    setReferenceRecord(field.columnName, record);
    setSearchKeyword('');
    setDropdownOpen(false);
  }

  function handleClear() {
    onChange(null);
    setDisplayText('');
    setReferenceRecord(field.columnName, null);
    setSearchKeyword('');
    setDropdownOpen(false);
  }

  // View mode
  if (mode === 'view') {
    return <span className="text-sm">{displayText || '\u2014'}</span>;
  }

  const hasValue = value != null && value !== '';

  return (
    <div ref={wrapperRef} className="relative">
      <div className={`flex items-center ${INPUT_BASE} ${error ? 'border-red-500' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        {hasValue ? (
          <>
            {/* Display value */}
            <span className="flex-1 truncate text-sm">{displayText || String(value)}</span>
            {/* Clear button */}
            {!disabled && (
              <button
                type="button"
                className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
                onClick={handleClear}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            )}
            {/* Separator */}
            <div className="mx-1.5 h-4 w-px bg-border shrink-0" />
            {/* ExternalLink icon */}
            <button
              type="button"
              className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => !disabled && setDialogOpen(true)}
              disabled={disabled}
            >
              <ExternalLinkIcon />
            </button>
          </>
        ) : (
          <>
            {/* Search input */}
            <input
              type="text"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              value={searchKeyword}
              onChange={(e) => handleInputChange(e.target.value)}
              onBlur={handleInputBlur}
              disabled={disabled}
              placeholder={field.name}
            />
            {/* ExternalLink icon */}
            <button
              type="button"
              className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => !disabled && setDialogOpen(true)}
              disabled={disabled}
            >
              <ExternalLinkIcon />
            </button>
          </>
        )}
      </div>

      {/* Dropdown — rendered via Portal to escape subtable overflow:auto */}
      {dropdownOpen && dropdownData.length > 0 && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          data-rp-portal="dropdown"
          className="fixed z-[100] rounded-md border bg-popover shadow-md"
          style={{ top: dropdownPos.top, left: dropdownPos.left, minWidth: dropdownPos.width }}
        >
          <div className="py-1">
            {dropdownData.map((record) => (
              <button
                key={record.id}
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors flex items-center gap-3"
                onClick={() => handleSelectRecord(record)}
              >
                {popoverColumns.map((col, i) => {
                  const text = formatPopoverCell(record, col);
                  return i === 0 ? (
                    <span key={col.key} className="font-medium truncate">{text || record.id}</span>
                  ) : (
                    <span key={col.key} className="text-muted-foreground truncate">{text}</span>
                  );
                })}
              </button>
            ))}
          </div>
          {dropdownTotal > 5 && (
            <button
              type="button"
              className="w-full border-t px-3 py-1.5 text-center text-xs text-primary hover:bg-muted transition-colors"
              onClick={() => { setDropdownOpen(false); setDialogOpen(true); }}
            >
              {t ? t('referencePicker.more', { total: dropdownTotal }) : `更多 (${dropdownTotal})`}
            </button>
          )}
        </div>,
        document.body,
      )}

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {/* Picker dialog */}
      {queryFn && targetAppCode && targetModelCode && (
        <ReferencePickerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode={pickerMode}
          queryFn={queryFn}
          targetAppCode={targetAppCode}
          targetModelCode={targetModelCode}
          targetModelName={targetModelName ?? ''}
          columns={columns}
          excludeIds={entityCtx?.existingIds ?? []}
          onConfirmSingle={pickerMode === 'single' ? (record) => {
            const df = field.options?.targetDisplayField || 'name';
            onChange(record.id);
            setDisplayText(record[df] ?? record.id);
            setReferenceRecord(field.columnName, record);
          } : undefined}
          onConfirmMultiple={pickerMode === 'multiple' ? (records) => {
            if (!entityCtx?.onBatchAddRows || records.length === 0) return;
            const df = field.options?.targetDisplayField || 'name';
            const columnName = field.columnName;
            // Map ALL records to row data — onBatchAddRows handles filling
            // the current row (first) and appending new rows (rest) in one call.
            const mapped = records.map((r) => ({
              [columnName]: r.id,
              [`${columnName}__display`]: r[df] ?? r.id,
            }));
            entityCtx.onBatchAddRows(mapped);
            // Update local display for the current cell
            setDisplayText(records[0][df] ?? records[0].id);
          } : undefined}
          t={t ?? ((k: string) => k)}
        />
      )}
    </div>
  );
}
