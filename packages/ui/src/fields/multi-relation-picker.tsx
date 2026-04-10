'use client';

import { useState, useCallback, useMemo } from 'react';
import type { Field } from '@openforge/shared';
import type { ApiQueryFn } from './field-props';

interface RelatedItem {
  id: string;
  displayValue: string;
}

interface MultiRelationPickerProps {
  field: Field;
  value: RelatedItem[];
  onChange: (added: string[], removed: string[]) => void;
  disabled?: boolean;
  mode: 'edit' | 'view';
  queryFn?: ApiQueryFn;
  targetAppCode?: string;
  targetModelCode?: string;
  targetModelName?: string;
  targetDisplayField?: string;
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={12} height={12} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function Loader2Icon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export default function MultiRelationPicker({
  field, value, onChange, disabled, mode, queryFn, targetAppCode, targetModelCode, targetModelName, targetDisplayField,
}: MultiRelationPickerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedInDialog, setSelectedInDialog] = useState<Set<string>>(new Set());

  const items = value ?? [];
  const originalIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const displayField = targetDisplayField ?? 'name';

  const handleRemoveTag = useCallback((id: string) => {
    onChange([], [id]);
  }, [onChange]);

  const handleOpenDialog = useCallback(async () => {
    setDialogOpen(true);
    setSelectedInDialog(new Set(items.map((i) => i.id)));
    setSearchKeyword('');
    if (queryFn && targetAppCode && targetModelCode) {
      setSearchLoading(true);
      try {
        const res = await queryFn(
          { appCode: targetAppCode, modelCode: targetModelCode },
          { keyword: '', page: 1, pageSize: 50 },
        );
        setSearchResults(res.data ?? []);
      } finally {
        setSearchLoading(false);
      }
    }
  }, [items, queryFn, targetAppCode, targetModelCode]);

  const handleSearch = useCallback(async (keyword: string) => {
    setSearchKeyword(keyword);
    if (!queryFn || !targetAppCode || !targetModelCode) return;
    setSearchLoading(true);
    try {
      const res = await queryFn(
        { appCode: targetAppCode, modelCode: targetModelCode },
        { keyword, page: 1, pageSize: 50 },
      );
      setSearchResults(res.data ?? []);
    } finally {
      setSearchLoading(false);
    }
  }, [queryFn, targetAppCode, targetModelCode]);

  const handleToggleInDialog = useCallback((id: string) => {
    setSelectedInDialog((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleConfirmDialog = useCallback(() => {
    const added: string[] = [];
    const removed: string[] = [];
    for (const id of selectedInDialog) {
      if (!originalIds.has(id)) added.push(id);
    }
    for (const id of originalIds) {
      if (!selectedInDialog.has(id)) removed.push(id);
    }
    onChange(added, removed);
    setDialogOpen(false);
  }, [selectedInDialog, originalIds, onChange]);

  if (mode === 'view') {
    if (items.length === 0) return <span className="text-sm text-muted-foreground">-</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span key={item.id} className="inline-flex items-center rounded-md border bg-muted px-2 py-0.5 text-xs">
            {item.displayValue}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background p-2 min-h-[36px]">
        {items.map((item) => (
          <span key={item.id} className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs">
            {item.displayValue}
            {!disabled && (
              <button type="button" className="hover:text-destructive" onClick={() => handleRemoveTag(item.id)}>
                <XIcon />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground" onClick={handleOpenDialog}>
            <PlusIcon />
          </button>
        )}
      </div>

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[500px] max-h-[70vh] rounded-lg border bg-background shadow-lg flex flex-col">
            <div className="border-b px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-medium">{targetModelName ?? 'Select'}</h3>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setDialogOpen(false)}>
                <XIcon />
              </button>
            </div>
            <div className="border-b px-4 py-2">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5">
                <SearchIcon />
                <input className="flex-1 bg-transparent text-sm outline-none" placeholder="Search..."
                  value={searchKeyword} onChange={(e) => handleSearch(e.target.value)} />
              </div>
            </div>
            <div className="flex-1 overflow-auto px-4 py-2">
              {searchLoading && <div className="flex items-center justify-center py-4"><Loader2Icon /></div>}
              {!searchLoading && searchResults.map((item: any) => (
                <label key={item.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer">
                  <input type="checkbox" checked={selectedInDialog.has(item.id)} onChange={() => handleToggleInDialog(item.id)} className="h-4 w-4 rounded border-gray-300" />
                  {item[displayField] ?? item.id}
                </label>
              ))}
              {!searchLoading && searchResults.length === 0 && <div className="py-4 text-center text-sm text-muted-foreground">-</div>}
            </div>
            <div className="border-t px-4 py-3 flex justify-end gap-2">
              <button type="button" className="rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-accent" onClick={() => setDialogOpen(false)}>Cancel</button>
              <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90" onClick={handleConfirmDialog}>
                Confirm ({selectedInDialog.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
