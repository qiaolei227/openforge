'use client';

import type { FieldComponentProps } from './field-props';

const INPUT_BASE =
  'flex h-9 w-full items-center rounded-md border bg-muted/30 px-3 py-1 text-sm border-input cursor-not-allowed';

export default function AutoNumberField({ value, mode, ...rest }: FieldComponentProps & { placeholder?: string }) {
  // Edit mode, no value yet → disabled input with placeholder text
  if (mode === 'edit') {
    if (value != null && value !== '') {
      return (
        <div className={INPUT_BASE}>
          <span className="font-mono text-muted-foreground">{String(value)}</span>
        </div>
      );
    }
    const placeholder = (rest as any).placeholder;
    return (
      <div className={INPUT_BASE}>
        <span className="italic text-muted-foreground/60">{placeholder ?? '—'}</span>
      </div>
    );
  }

  // View mode
  if (value != null && value !== '') {
    return <span className="text-sm font-mono text-muted-foreground">{String(value)}</span>;
  }
  return <span className="text-sm text-muted-foreground/60">—</span>;
}
