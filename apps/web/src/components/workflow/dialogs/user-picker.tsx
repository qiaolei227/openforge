'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UserIcon, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  workflowUserSearchApi,
  type WorkflowUserSearchItem,
} from '@/lib/api/workflow';

interface Props {
  value: WorkflowUserSearchItem | null;
  onChange: (user: WorkflowUserSearchItem | null) => void;
  disabled?: boolean;
  /** Optional id for the connected <Label htmlFor>. */
  id?: string;
}

/**
 * Lightweight user picker for workflow approver pickers (transfer / add-signer).
 *
 * Implementation:
 * - Backed by `GET /workflow-tasks/users/search` (sys:self perm) so it works for
 *   any authenticated user.
 * - Debounced 300ms keyword search; empty keyword loads the first page.
 * - Click outside closes the dropdown.
 */
export function UserPicker({ value, onChange, disabled, id }: Props) {
  const tDialog = useTranslations('workflow.dialog');

  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<WorkflowUserSearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      let cancelled = false;
      setLoading(true);
      workflowUserSearchApi
        .search(keyword)
        .then((data) => {
          if (cancelled) return;
          setResults(data);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [keyword]);

  // Click-outside to close
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const hasValue = value != null;

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={cn(
          'flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <UserIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="mx-1.5 h-4 w-px bg-border shrink-0" />
        {hasValue ? (
          <>
            <span className="flex-1 truncate text-sm">
              {value!.displayName || value!.username}
            </span>
            {!disabled && (
              <button
                type="button"
                className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => onChange(null)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        ) : (
          <>
            <input
              id={id}
              type="text"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onFocus={() => setOpen(true)}
              disabled={disabled}
              placeholder={tDialog('userPlaceholder')}
            />
            {loading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </>
        )}
      </div>

      {open && !hasValue && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="max-h-48 overflow-y-auto py-1">
            {results.map((u) => (
              <button
                key={u.id}
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
                onClick={() => {
                  onChange(u);
                  setOpen(false);
                  setKeyword('');
                }}
              >
                <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{u.displayName || u.username}</span>
                {u.displayName && u.username !== u.displayName && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {u.username}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
