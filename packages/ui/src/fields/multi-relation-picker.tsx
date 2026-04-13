'use client';

import { useState, useCallback, useMemo } from 'react';
import type { Field } from '@openforge/shared';
import type { ApiQueryFn } from './field-props';
import ReferencePickerDialog from './reference-picker-dialog';
import { usePickerColumns } from './use-picker-columns';

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
  fetchSchema?: (appCode: string, modelCode: string) => Promise<{ fields: any[]; views: any[] }>;
  t?: (key: string, values?: Record<string, any>) => string;
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

export default function MultiRelationPicker({
  field, value, onChange, disabled, mode, queryFn, targetAppCode, targetModelCode, targetModelName, targetDisplayField, fetchSchema, t,
}: MultiRelationPickerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const items = value ?? [];
  const originalIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const { columns } = usePickerColumns(
    field,
    targetAppCode ?? '',
    targetModelCode ?? '',
    fetchSchema ?? (async () => ({ fields: [], views: [] })),
  );

  const handleRemoveTag = useCallback((id: string) => {
    onChange([], [id]);
  }, [onChange]);

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
          <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => setDialogOpen(true)}>
            <PlusIcon />
          </button>
        )}
      </div>

      <ReferencePickerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode="multiple"
        queryFn={queryFn!}
        targetAppCode={targetAppCode!}
        targetModelCode={targetModelCode!}
        targetModelName={targetModelName ?? ''}
        columns={columns}
        selectedIds={items.map((item: any) => item.id)}
        onConfirmMultiple={(records) => {
          const newIds = new Set(records.map((r) => r.id));
          const added = records.filter((r) => !originalIds.has(r.id)).map((r) => r.id);
          const removed = [...originalIds].filter((id) => !newIds.has(id));
          onChange(added, removed);
        }}
        t={t ?? ((k: string) => k)}
      />
    </div>
  );
}
