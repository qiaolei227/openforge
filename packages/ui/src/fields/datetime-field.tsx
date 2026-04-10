'use client';

import { useRef } from 'react';
import { format, parseISO } from 'date-fns';
import type { FieldComponentProps } from './field-props';

const WRAPPER_BASE =
  'flex h-9 w-full items-center rounded-md border bg-background px-3 py-1 text-sm shadow-xs border-input disabled:cursor-not-allowed disabled:opacity-50';

function CalendarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

export default function DatetimeField({ field, value, onChange, disabled, error, mode }: FieldComponentProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (mode === 'view') {
    if (!value) return <span className="text-sm">{'\u2014'}</span>;
    try {
      return <span className="text-sm">{format(parseISO(value), 'yyyy-MM-dd HH:mm:ss')}</span>;
    } catch {
      return <span className="text-sm">{String(value)}</span>;
    }
  }

  // Convert ISO string to datetime-local format for the input
  let inputValue = value ?? '';
  if (inputValue && inputValue.includes('T')) {
    inputValue = inputValue.slice(0, 16);
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
          type="datetime-local"
          className="flex-1 bg-transparent outline-none text-sm [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden [&::-webkit-clear-button]:hidden"
          value={inputValue}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw ? raw + ':00' : null);
          }}
          disabled={disabled}
        />
        <button
          type="button"
          className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
          onClick={openPicker}
          disabled={disabled}
          tabIndex={-1}
        >
          <CalendarIcon />
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
