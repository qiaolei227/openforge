'use client';

import type { FieldComponentProps } from './field-props';

const INPUT_BASE =
  'flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs border-input disabled:cursor-not-allowed disabled:opacity-50';

export default function StringField({ field, value, onChange, disabled, error, mode }: FieldComponentProps) {
  if (mode === 'view') {
    return <span className="text-sm">{value ?? '\u2014'}</span>;
  }

  const maxLength = field.options?.maxLength;

  return (
    <div>
      <input
        type="text"
        className={`${INPUT_BASE} ${error ? 'border-red-500' : ''}`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={field.name}
      />
      {maxLength && (
        <span className="mt-1 block text-xs text-muted-foreground text-right">
          {(value?.length ?? 0)}/{maxLength}
        </span>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
