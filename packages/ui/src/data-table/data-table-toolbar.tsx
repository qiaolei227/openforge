'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

/* ── Inline SVG icons ── */
function SearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="text-muted-foreground">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="animate-spin text-muted-foreground">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function Trash2Icon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function CheckboxIcon({ checked }: { checked: boolean }) {
  if (checked) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="text-primary">
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="text-muted-foreground">
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}

export interface DataTableToolbarProps {
  selectedCount: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searching: boolean;
  includeArchived: boolean;
  onArchiveToggle: () => void;
  onNew: () => void;
  onBatchArchive: () => void;
  onBatchDelete: () => void;
  onClearSelection: () => void;
  t: (key: string, values?: Record<string, any>) => string;
}

export function DataTableToolbar({
  selectedCount,
  searchValue,
  onSearchChange,
  searching,
  includeArchived,
  onArchiveToggle,
  onNew,
  onBatchArchive,
  onBatchDelete,
  onClearSelection,
  t,
}: DataTableToolbarProps) {
  const [localValue, setLocalValue] = useState(searchValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external searchValue changes
  useEffect(() => {
    setLocalValue(searchValue);
  }, [searchValue]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setLocalValue(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearchChange(val);
      }, 300);
    },
    [onSearchChange],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Batch mode
  if (selectedCount > 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
        <span className="text-sm font-medium">
          {t('dataTab.selected', { count: selectedCount })}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onBatchArchive}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md border border-input bg-background hover:bg-muted transition-colors"
        >
          <ArchiveIcon />
          {t('archive.archive')}
        </button>
        <button
          type="button"
          onClick={onBatchDelete}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md border border-red-200 bg-background text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2Icon />
          {t('common.delete')}
        </button>
        <button
          type="button"
          onClick={onClearSelection}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md text-muted-foreground hover:text-foreground transition-colors"
        >
          <XIcon />
          {t('dataTab.clearSelection')}
        </button>
      </div>
    );
  }

  // Default mode
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b">
      {/* Search input */}
      <div className="relative flex-1 max-w-sm">
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          {searching ? <SpinnerIcon /> : <SearchIcon />}
        </div>
        <input
          type="text"
          value={localValue}
          onChange={handleChange}
          placeholder={t('common.searchPlaceholder')}
          className="h-9 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {/* Show archived toggle */}
      <button
        type="button"
        onClick={onArchiveToggle}
        className="inline-flex items-center gap-1.5 h-9 px-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <CheckboxIcon checked={includeArchived} />
        {t('archive.showArchived')}
      </button>

      <div className="flex-1" />

      {/* New button */}
      <button
        type="button"
        onClick={onNew}
        className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium rounded-md bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
      >
        <PlusIcon />
        {t('common.create')}
      </button>
    </div>
  );
}
