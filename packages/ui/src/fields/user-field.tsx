'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { FieldComponentProps, SystemQueryFn } from './field-props';
import { useSetReferenceRecord } from '@openforge/render-engine';

export interface UserFieldExtraProps {
  systemQueryFn: SystemQueryFn;
  displayValue?: string;
  /**
   * Optional callback that hands the full picked record up to the parent so
   * it can persist id, display, and any sibling LOOKUP-target columns. Falls
   * back to plain `onChange(id)` when absent.
   */
  onPickRecord?: (record: Record<string, any> | null) => void;
}

const INPUT_BASE =
  'flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs border-input disabled:cursor-not-allowed disabled:opacity-50';

/* ── Inline SVG icons ── */

function UserIcon() {
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
      className="shrink-0 text-muted-foreground"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ClearIcon() {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function SpinnerIcon() {
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
      className="animate-spin shrink-0 text-muted-foreground"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export default function UserField(props: FieldComponentProps & Partial<UserFieldExtraProps>) {
  const { field, value, onChange, disabled, error, mode, systemQueryFn, displayValue, onPickRecord } = props;
  const setReferenceRecord = useSetReferenceRecord();

  const [searchKeyword, setSearchKeyword] = useState('');
  const [dropdownData, setDropdownData] = useState<Record<string, any>[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [displayText, setDisplayText] = useState(displayValue ?? '');
  const [searching, setSearching] = useState(false);

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
      if (!kw.trim() || !systemQueryFn) {
        setDropdownData([]);
        setDropdownOpen(false);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const result = await systemQueryFn('users', {
          keyword: kw,
          page: 1,
          pageSize: 10,
        });
        setDropdownData(result.data);
        setDropdownOpen(result.data.length > 0);
      } catch {
        setDropdownData([]);
        setDropdownOpen(false);
      } finally {
        setSearching(false);
      }
    },
    [systemQueryFn],
  );

  function handleInputChange(val: string) {
    setSearchKeyword(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(val);
    }, 300);
  }

  function handleSelectRecord(record: Record<string, any>) {
    const display = record.displayName || record.username || String(record.id);
    if (onPickRecord) {
      onPickRecord(record);
    } else {
      onChange(record.id);
    }
    setDisplayText(display);
    setReferenceRecord(field.columnName, record);
    setSearchKeyword('');
    setDropdownOpen(false);
  }

  function handleClear() {
    if (onPickRecord) {
      onPickRecord(null);
    } else {
      onChange(null);
    }
    setDisplayText('');
    setReferenceRecord(field.columnName, null);
    setSearchKeyword('');
    setDropdownOpen(false);
  }

  // View mode
  if (mode === 'view') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <UserIcon />
        {displayText || '\u2014'}
      </span>
    );
  }

  const hasValue = value != null && value !== '';

  return (
    <div ref={wrapperRef} className="relative">
      <div className={`flex items-center ${INPUT_BASE} ${error ? 'border-red-500' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <UserIcon />
        <div className="mx-1.5 h-4 w-px bg-border shrink-0" />
        {hasValue ? (
          <>
            <span className="flex-1 truncate text-sm">{displayText || String(value)}</span>
            {!disabled && (
              <button
                type="button"
                className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
                onClick={handleClear}
              >
                <ClearIcon />
              </button>
            )}
          </>
        ) : (
          <>
            <input
              type="text"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              value={searchKeyword}
              onChange={(e) => handleInputChange(e.target.value)}
              disabled={disabled}
              placeholder={field.name}
            />
            {searching && <SpinnerIcon />}
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
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
                onClick={() => handleSelectRecord(record)}
              >
                <UserIcon />
                <span>{record.displayName || record.username}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
