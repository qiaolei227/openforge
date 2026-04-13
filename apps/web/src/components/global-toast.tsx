'use client';

import { useToastStore } from '@/stores/toast-store';
import { CheckCircle, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function GlobalToast() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center gap-2 rounded-lg border px-4 py-2.5 shadow-lg text-sm animate-in fade-in slide-in-from-top-2 duration-200',
            toast.type === 'success'
              ? 'bg-background border-green-200 text-green-700 dark:border-green-800 dark:text-green-400'
              : 'bg-background border-red-200 text-red-700 dark:border-red-800 dark:text-red-400',
          )}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
            onClick={() => dismiss(toast.id)}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
