'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getDistributionLog, type DistributionLogItem } from '@/lib/api/distribution';

interface Props {
  appCode: string;
  modelCode: string;
  recordId: string;
}

export function DistributionLogSection({ appCode, modelCode, recordId }: Props) {
  const t = useTranslations('distribute');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<DistributionLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getDistributionLog(appCode, modelCode, recordId, page, 20)
      .then((res) => {
        if (page === 1) setItems(res.items);
        else setItems((prev) => [...prev, ...res.items]);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [appCode, modelCode, recordId, page]);

  const hasMore = items.length < total;

  return (
    <section>
      <h3 className="text-sm font-semibold mb-3">{t('log')}</h3>
      {items.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground py-4">{t('noLogs')}</p>
      )}
      {items.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {items.map((l) => (
            <li
              key={l.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 border-b border-border/50"
            >
              <span className="text-xs text-muted-foreground font-mono min-w-[140px]">
                {new Date(l.createdAt).toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="font-medium">{t(`logAction.${l.action}`)}</span>
              {l.fieldColumn && (
                <span className="text-muted-foreground font-mono text-xs">{l.fieldColumn}</span>
              )}
              {l.targetOrgId && (
                <span className="text-xs text-muted-foreground">→ {l.targetOrgId}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {hasMore && !loading && (
        <div className="text-center pt-2">
          <Button variant="ghost" size="sm" onClick={() => setPage((p) => p + 1)}>
            {t('loadMore')}
          </Button>
        </div>
      )}
    </section>
  );
}
