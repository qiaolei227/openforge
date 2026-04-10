'use client';

import { useRef } from 'react';
import type { FieldComponentProps } from './field-props';

const WRAPPER_BASE =
  'flex h-9 w-full items-center rounded-md border bg-background px-3 py-1 text-sm shadow-xs border-input disabled:cursor-not-allowed disabled:opacity-50';

function ClockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export default function TimeField({ field, value, onChange, disabled, error, mode }: FieldComponentProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (mode === 'view') {
    return <span className="text-sm">{value ?? '\u2014'}</span>;
  }

  const openPicker = () => {
    if (disabled) return;
    const el = inputRef.current;
    if (!el) return;
    if (typeof (el as any).showPicker === 'function') {
      try {
        (el as any).showPicker();
        return;
      } catch {
        // fall through
      }
    }
    el.focus();
  };

  return (
    <div>
      <div className={`${WRAPPER_BASE} ${error ? 'border-red-500' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <input
          ref={inputRef}
          type="time"
          className="flex-1 bg-transparent outline-none text-sm [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden [&::-webkit-clear-button]:hidden"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
        />
        <button
          type="button"
          className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
          onClick={openPicker}
          disabled={disabled}
          tabIndex={-1}
        >
          <ClockIcon />
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
