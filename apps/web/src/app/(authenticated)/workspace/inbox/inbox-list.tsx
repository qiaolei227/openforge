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
        const submitter =
          item.submitter?.displayName ||
          item.submitter?.username ||
          '';
        const title = item.title || item.recordId || item.id;
        return (
          <div
            key={item.id}
            className="px-4 py-3 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{title}</div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                  {submitter && <span>{submitter}</span>}
                  {item.status && (
                    <span className="text-muted-foreground/70">
                      · {item.status}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground shrink-0">
                {item.createdAt &&
                  formatDistanceToNow(new Date(item.createdAt), {
                    addSuffix: true,
                    locale: dateLocale,
                  })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
