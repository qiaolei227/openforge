'use client';

import { useEffect, useCallback } from 'react';

/* ── Inline SVG icon ── */
function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export interface FormDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function FormDrawer({ open, onClose, title, width = 640, footer, children }: FormDrawerProps) {
  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className="relative flex flex-col border-l bg-background shadow-xl h-full"
        style={{ width: `min(${width}px, 100vw)` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <XIcon />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>

        {/* Optional sticky footer */}
        {footer && (
          <div className="shrink-0 border-t px-6 py-3 bg-background">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
