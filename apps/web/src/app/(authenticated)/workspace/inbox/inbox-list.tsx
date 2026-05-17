'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import { inboxApi, type InboxItem } from '@/lib/api/inbox';

export type InboxType = 'pending' | 'done' | 'cc' | 'myInstances';

const POLL_INTERVAL_MS = 30000;

export function InboxList({ type }: { type: InboxType }) {
  const t = useTranslations('inbox');
  const locale = useLocale();
  const dateLocale = locale.startsWith('zh') ? zhCN : enUS;

  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = (silent: boolean) => {
      if (!silent) setLoading(true);
      inboxApi[type]({})
        .then((data) => {
          if (cancelled) return;
          setItems(data);
        })
        .catch(() => {
          if (cancelled) return;
          setItems([]);
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
          setInitialLoaded(true);
        });
    };
    setInitialLoaded(false);
    load(false);
    const id = setInterval(() => load(true), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [type]);

  if (loading && !initialLoaded) {
    return (
      <div className="py-12 flex justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        {t('empty')}
      </div>
    );
  }

  return (
    <div className="divide-y border rounded-md bg-card">
      {items.map((item) => {
        // For pending/done/cc items: item is a SysWorkflowTask with `instance.workflow` included.
        // For myInstances: item IS the instance, with `workflow` included.
        const isInstance = type === 'myInstances';
        const instance = isInstance ? item : (item as any).instance;
        const workflowName = instance?.workflow?.name || (isInstance ? '' : (item as any).nodeName) || '';
        const nodeName = isInstance ? '' : (item as any).nodeName || '';
        const recordId: string = (instance?.recordId || (item as any).recordId || '') as string;
        const startedAt: string | undefined = instance?.startedAt || (item as any).createdAt;
        const statusLabel = isInstance
          ? instance?.status
          : (item as any).status === 'pending'
            ? '待处理'
            : (item as any).status === 'approved'
              ? '已同意'
              : (item as any).status === 'rejected'
                ? '已驳回'
                : (item as any).status === 'transferred'
                  ? '已转交'
                  : (item as any).status;

        const recId = recordId;
        // Resolve appCode/modelCode for navigation via nested workflow.model.app
        const appCode =
          (instance as any)?.workflow?.model?.app?.code ||
          (item as any).appCode;
        const modelCode =
          (instance as any)?.workflow?.model?.code || (item as any).modelCode;
        const href =
          appCode && modelCode && recId
            ? `/workspace/${appCode}/${modelCode}?openRecord=${recId}`
            : `/workspace/inbox`;

        return (
          <a
            key={item.id}
            href={href}
            className="block px-4 py-3 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {workflowName || nodeName || recId || item.id}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                  {nodeName && !isInstance && <span>节点：{nodeName}</span>}
                  {statusLabel && (
                    <span className="text-muted-foreground/70">
                      · {statusLabel}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground shrink-0">
                {startedAt &&
                  formatDistanceToNow(new Date(startedAt), {
                    addSuffix: true,
                    locale: dateLocale,
                  })}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
