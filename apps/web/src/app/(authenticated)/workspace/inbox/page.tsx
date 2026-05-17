'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import { inboxApi, type InboxCounts } from '@/lib/api/inbox';
import { InboxList } from './inbox-list';

const POLL_INTERVAL_MS = 30000;

export default function InboxPage() {
  const t = useTranslations('inbox');
  const [counts, setCounts] = useState<InboxCounts>({
    pending: 0,
    done: 0,
    cc: 0,
    myInstances: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      inboxApi
        .counts()
        .then((c) => {
          if (!cancelled) setCounts(c);
        })
        .catch(() => {
          /* silent — bell + list will surface their own errors */
        });
    };
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">{t('title')}</h1>
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            <span>{t('tabs.pending')}</span>
            {counts.pending > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({counts.pending})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="done">
            <span>{t('tabs.done')}</span>
          </TabsTrigger>
          <TabsTrigger value="cc">
            <span>{t('tabs.cc')}</span>
            {counts.cc > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({counts.cc})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="myInstances">
            <span>{t('tabs.myInstances')}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4">
          <InboxList type="pending" />
        </TabsContent>
        <TabsContent value="done" className="mt-4">
          <InboxList type="done" />
        </TabsContent>
        <TabsContent value="cc" className="mt-4">
          <InboxList type="cc" />
        </TabsContent>
        <TabsContent value="myInstances" className="mt-4">
          <InboxList type="myInstances" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
