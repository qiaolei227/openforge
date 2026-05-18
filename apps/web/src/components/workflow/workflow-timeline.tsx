'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface TimelineProps {
  instance: any;
}

function formatDuration(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  if (ms < 60_000) return `${Math.round(ms / 1000)}秒`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}分钟`;
  if (ms < 86400_000) return `${(ms / 3600_000).toFixed(1)}小时`;
  return `${(ms / 86400_000).toFixed(1)}天`;
}

/**
 * Horizontal node trajectory for the form-page workflow section.
 *
 * Node colouring:
 * - passed   → green (workflow has exited this node, seen in logs as `node-exit`)
 * - active   → primary (currently in `instance.activeNodeIds`)
 * - pending  → muted (downstream, not reached yet)
 *
 * Start/End nodes are hidden — only meaningful approval / cc / branch nodes are shown.
 */
export function WorkflowTimeline({ instance }: TimelineProps) {
  const tStatus = useTranslations('workflow.status');

  const def = instance?.workflowVersion?.definition;
  const logs: any[] = instance?.logs ?? [];
  const activeNodeIds: string[] = instance?.activeNodeIds ?? [];

  const { passedIds, activeIds, nodesToShow } = useMemo(() => {
    if (!def || !Array.isArray(def.nodes)) {
      return {
        passedIds: new Set<string>(),
        activeIds: new Set<string>(),
        nodesToShow: [] as any[],
      };
    }
    const passed = new Set<string>(
      logs
        .filter((l) => l.action === 'node-exit' && l.nodeId)
        .map((l) => l.nodeId),
    );
    const active = new Set<string>(activeNodeIds);
    const visible = def.nodes.filter(
      (n: any) => n.type !== 'start' && n.type !== 'end',
    );
    return { passedIds: passed, activeIds: active, nodesToShow: visible };
  }, [def, logs, activeNodeIds]);

  // Map nodeId → last duration (a node may be entered multiple times via returnPrev;
  // the most recent completed pass is the most informative to show).
  const durationByNode = useMemo(() => {
    const map = new Map<string, number>();
    const timings: any[] = instance?.nodeDurations ?? [];
    for (const t of timings) {
      if (t?.nodeId && typeof t.durationMs === 'number') {
        map.set(t.nodeId, t.durationMs);
      }
    }
    return map;
  }, [instance?.nodeDurations]);

  if (!def) return null;

  const statusKey = instance.status as
    | 'running'
    | 'approved'
    | 'rejected'
    | 'returned'
    | 'cancelled'
    | 'withdrawn'
    | undefined;

  const statusLabel = statusKey ? tStatus(statusKey) : '';

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      {nodesToShow.map((n: any, idx: number) => {
        const isPassed = passedIds.has(n.id);
        const isActive = activeIds.has(n.id);
        const status: 'passed' | 'active' | 'pending' = isPassed
          ? 'passed'
          : isActive
            ? 'active'
            : 'pending';
        const cls = cn(
          'px-3 py-1.5 rounded-md text-xs whitespace-nowrap border',
          status === 'passed' &&
            'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-900/50',
          status === 'active' &&
            'bg-primary text-primary-foreground border-primary',
          status === 'pending' &&
            'bg-muted text-muted-foreground border-transparent',
        );
        const durationLabel = formatDuration(durationByNode.get(n.id));
        return (
          <div key={n.id} className="flex items-center gap-2 shrink-0">
            <div className="flex flex-col items-center gap-0.5">
              <div className={cls}>{n.name || n.type}</div>
              {durationLabel && (
                <div className="text-[10px] text-muted-foreground">
                  {durationLabel}
                </div>
              )}
            </div>
            {idx < nodesToShow.length - 1 && (
              <span className="text-muted-foreground text-xs">›</span>
            )}
          </div>
        );
      })}
      {statusLabel && (
        <div className="ml-2 text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground shrink-0">
          {statusLabel}
        </div>
      )}
      {instance.totalDurationMs != null && (
        <div className="ml-2 text-xs text-muted-foreground shrink-0">
          总耗时：{formatDuration(instance.totalDurationMs)}
        </div>
      )}
    </div>
  );
}
