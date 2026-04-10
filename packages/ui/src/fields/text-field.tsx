'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { FieldComponentProps } from './field-props';

const TEXTAREA_BASE =
  'flex w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs border-input disabled:cursor-not-allowed disabled:opacity-50 resize-none';

export default function TextField({ field, value, onChange, disabled, error, mode }: FieldComponentProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.max(72, el.scrollHeight)}px`;
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  if (mode === 'view') {
    const displayValue = value ?? '\u2014';
    const truncated = typeof displayValue === 'string' && displayValue.length > 200
      ? displayValue.slice(0, 200) + '\u2026'
      : displayValue;
    return (
      <span className="text-sm whitespace-pre-wrap" title={typeof value === 'string' ? value : undefined}>
        {truncated}
      </span>
    );
  }

  return (
    <div>
      <textarea
        ref={textareaRef}
        className={`${TEXTAREA_BASE} min-h-[72px] ${error ? 'border-red-500' : ''}`}
        value={value ?? ''}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        disabled={disabled}
        placeholder={field.name}
        rows={3}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
