'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { workflowUserSearchApi } from '@/lib/api/workflow';

interface Props {
  instance: any;
}

/**
 * Resolve UUIDs → display names via the `sys:self`-gated workflow user search
 * (the `/users/:id` endpoint requires `sys:users`, so we cannot use it for
 * non-admin viewers of an approval log).
 *
 * Strategy: pull a single bounded batch (≤50) from `workflow-tasks/users/search`
 * once per session and lazily fall back to the UUID prefix for IDs the batch
 * doesn't cover. Good enough for typical org sizes; a follow-up can add a true
 * batch endpoint if larger tenants hit the cap.
 */
function useUserNames(userIds: string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});

  // userIds is a stable membership signal — join it so effect rerun only on diff
  const key = userIds.join(',');

  useEffect(() => {
    const missing = userIds.filter((id) => id && !(id in names));
    if (missing.length === 0) return;

    let cancelled = false;
    workflowUserSearchApi
      .search()
      .then((users) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const u of users) {
          next[u.id] = u.displayName || u.username;
        }
        setNames((prev) => ({ ...prev, ...next }));
      })
      .catch(() => {
        // swallow — render falls back to UUID prefix below
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return names;
}

/**
 * Collapsible operation history for the form-page workflow section.
 *
 * Sorted newest-first. For `transfer` / `add-before` / `add-after` we render
 * `operator → target` so the signing chain is readable. For solo actions
 * (approve/reject/withdraw/urge/etc.) we show the operator only.
 */
export function WorkflowLogs({ instance }: Props) {
  const tSection = useTranslations('workflow.section');
  const tLog = useTranslations('workflow.logActions');

  const [expanded, setExpanded] = useState(false);

  const logs = useMemo(() => {
    const raw: any[] = instance?.logs ?? [];
    return raw
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [instance?.logs]);

  const userIds = useMemo(() => {
    const set = new Set<string>();
    for (const log of logs) {
      if (log.operatorUserId) set.add(log.operatorUserId);
      if (log.targetUserId) set.add(log.targetUserId);
    }
    return Array.from(set);
  }, [logs]);
  const userNames = useUserNames(userIds);

  if (logs.length === 0) return null;

  const labelFor = (action: string): string => {
    try {
      return tLog(action as any);
    } catch {
      return action;
    }
  };

  const nameFor = (id?: string | null): string | null => {
    if (!id) return null;
    return userNames[id] || id.substring(0, 8);
  };

  const PAIR_ACTIONS = new Set(['transfer', 'add-before', 'add-after']);
  const OPERATOR_ACTIONS = new Set([
    'submit',
    'approve',
    'reject',
    'return-prev',
    'return-start',
    'withdraw',
    'cancel',
    'urge',
  ]);

  return (
    <div className="border-t pt-3">
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <span>{tSection('logsToggle', { count: logs.length })}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto pr-2">
          {logs.map((log) => {
            const operator = nameFor(log.operatorUserId);
            const target = nameFor(log.targetUserId);
            const isPair = PAIR_ACTIONS.has(log.action);
            const isSolo = OPERATOR_ACTIONS.has(log.action);

            return (
              <div key={log.id} className="flex items-start gap-3 text-xs">
                <span className="text-muted-foreground whitespace-nowrap min-w-[110px] tabular-nums">
                  {format(new Date(log.createdAt), 'MM-dd HH:mm:ss')}
                </span>
                <span className="font-medium text-foreground/90 whitespace-nowrap">
                  {labelFor(log.action)}
                </span>
                {isPair && operator && target && (
                  <span className="text-muted-foreground whitespace-nowrap">
                    {operator}
                    <span className="mx-1 opacity-60">→</span>
                    {target}
                  </span>
                )}
                {!isPair && isSolo && operator && (
                  <span className="text-muted-foreground whitespace-nowrap">
                    {operator}
                  </span>
                )}
                {log.comment && (
                  <span className="text-muted-foreground italic break-all">
                    &ldquo;{log.comment}&rdquo;
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
