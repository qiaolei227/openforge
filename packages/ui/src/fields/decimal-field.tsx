'use client';

import type { FieldComponentProps } from './field-props';

const INPUT_BASE =
  'flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs border-input disabled:cursor-not-allowed disabled:opacity-50';

export default function DecimalField({ field, value, onChange, disabled, error, mode }: FieldComponentProps) {
  const scale = field.options?.scale ?? 2;

  if (mode === 'view') {
    if (value == null) return <span className="text-sm">{'\u2014'}</span>;
    return (
      <span className="text-sm text-right font-mono">
        {Number(value).toLocaleString(undefined, {
          minimumFractionDigits: scale,
          maximumFractionDigits: scale,
        })}
      </span>
    );
  }

  const step = Math.pow(10, -scale);

  return (
    <div>
      <input
        type="number"
        step={step}
        className={`${INPUT_BASE} text-right font-mono ${error ? 'border-red-500' : ''}`}
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(null);
          } else {
            const parsed = parseFloat(raw);
            if (!isNaN(parsed)) onChange(parsed);
          }
        }}
        disabled={disabled}
        placeholder={field.name}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
