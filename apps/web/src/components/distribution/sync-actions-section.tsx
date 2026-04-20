'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ForcePushDialog } from './force-push-dialog';
import { BackfillDialog } from './backfill-dialog';

interface Props {
  appCode: string;
  modelCode: string;
  recordId: string;
  modelId: string;
}

export function SyncActionsSection({ appCode, modelCode, recordId, modelId }: Props) {
  const t = useTranslations('distribute');
  const [fpOpen, setFpOpen] = useState(false);
  const [bfOpen, setBfOpen] = useState(false);

  return (
    <section>
      <h3 className="text-sm font-semibold mb-3">{t('syncActions')}</h3>
      <div className="flex gap-3">
        <Button onClick={() => setFpOpen(true)} variant="default">
          {t('forcePushBtn')}
        </Button>
        <Button onClick={() => setBfOpen(true)} variant="outline">
          {t('backfillBtn')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-2 max-w-2xl">{t('syncActionsHint')}</p>
      {fpOpen && (
        <ForcePushDialog
          open={fpOpen}
          onClose={() => setFpOpen(false)}
          appCode={appCode}
          modelCode={modelCode}
          recordId={recordId}
          modelId={modelId}
        />
      )}
      {bfOpen && (
        <BackfillDialog
          open={bfOpen}
          onClose={() => setBfOpen(false)}
          appCode={appCode}
          modelCode={modelCode}
          recordId={recordId}
          modelId={modelId}
        />
      )}
    </section>
  );
}
