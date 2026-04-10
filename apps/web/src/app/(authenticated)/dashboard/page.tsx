'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAiStore } from '@/stores/ai-store';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const setContext = useAiStore((s) => s.setContext);

  useEffect(() => {
    setContext({ page: 'dashboard' });
  }, [setContext]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t('title')}</h1>
      <p className="text-muted-foreground">
        {t('welcome')}
      </p>
    </div>
  );
}
