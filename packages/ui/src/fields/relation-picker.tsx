'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { FieldComponentProps, ApiQueryFn } from './field-props';
import RelationPickerDialog from './relation-picker-dialog';

export interface RelationPickerExtraProps {
  queryFn: ApiQueryFn;
  targetAppCode: string;
  targetModelCode: string;
  targetModelName: string;
  displayValue?: string;
}

const INPUT_BASE =
  'flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs border-input disabled:cursor-not-allowed disabled:opacity-50';

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
  const { field, value, onChange, disabled, error, mode, queryFn, targetAppCode, targetModelCode, targetModelName, displayValue } = props;

  const displayField = field.options?.targetDisplayField || 'id';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [dropdownData, setDropdownData] = useState<Record<string, any>[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [displayText, setDisplayText] = useState(displayValue ?? '');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync displayValue prop to local state
  useEffect(() => {
    setDisplayText(displayValue ?? '');
  }, [displayValue]);

  // Outside click detection
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  const doSearch = useCallback(
    async (kw: string) => {
      if (!kw.trim() || !queryFn || !targetAppCode || !targetModelCode) {
        setDropdownData([]);
        setDropdownOpen(false);
        return;
      }
      try {
        const result = await queryFn(
          { appCode: targetAppCode, modelCode: targetModelCode },
          {
            keyword: kw,
            page: 1,
            pageSize: 10,
            includeArchived: false,
          },
        );
        setDropdownData(result.data);
        setDropdownOpen(result.data.length > 0);
      } catch {
        setDropdownData([]);
        setDropdownOpen(false);
      }
    },
    [queryFn, targetAppCode, targetModelCode],
  );

  function handleInputChange(val: string) {
    setSearchKeyword(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(val);
    }, 300);
  }

  function handleSelectRecord(record: Record<string, any>) {
    onChange(record.id);
    setDisplayText(record[displayField] ?? String(record.id));
    setSearchKeyword('');
    setDropdownOpen(false);
  }

  function handleClear() {
    onChange(null);
    setDisplayText('');
    setSearchKeyword('');
    setDropdownOpen(false);
  }

  function handleDialogSelect(record: Record<string, any>) {
    onChange(record.id);
    setDisplayText(record[displayField] ?? String(record.id));
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

      {/* Dropdown */}
      {dropdownOpen && dropdownData.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="max-h-48 overflow-y-auto py-1">
            {dropdownData.map((record) => (
              <button
                key={record.id}
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
                onClick={() => handleSelectRecord(record)}
              >
                {record[displayField] ?? record.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {/* Picker dialog */}
      {queryFn && targetAppCode && targetModelCode && (
        <RelationPickerDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSelect={handleDialogSelect}
          appCode={targetAppCode}
          modelCode={targetModelCode}
          displayField={displayField}
          title={targetModelName ?? ''}
          queryFn={queryFn}
        />
      )}
    </div>
  );
}
