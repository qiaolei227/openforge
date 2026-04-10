'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { FileText, List, ArrowLeft } from 'lucide-react';
import { Breadcrumb } from '@/components/breadcrumb';

interface DesignerEmptyStateProps {
  appId: string;
  modelId: string;
  appName: string;
  modelName: string;
  onCreateView: (type: 'form' | 'list') => void;
}

const btnOutline =
  'inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent';

export function DesignerEmptyState({ appId, modelId, appName, modelName, onCreateView }: DesignerEmptyStateProps) {
  const t = useTranslations('designer');
  const tModels = useTranslations('models');
  const tCommon = useTranslations('common');
  const tApps = useTranslations('apps');
  const router = useRouter();

  return (
    <div>
      {/* Breadcrumb — same as designer toolbar and model detail page */}
      <Breadcrumb
        items={[
          { label: tApps('title'), href: '/apps' },
          { label: appName, href: `/apps/${appId}` },
          { label: modelName, href: `/apps/${appId}/models/${modelId}` },
          { label: tModels('designViews') },
        ]}
      />

      {/* Header card */}
      <div className="border rounded-lg p-5 mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{modelName} — {tModels('designViews')}</h2>
          <div className="shrink-0 ml-4">
            <button onClick={() => router.push(`/apps/${appId}/models/${modelId}`)} className={btnOutline}>
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              {tCommon('back')}
            </button>
          </div>
        </div>
      </div>

      {/* Empty state content */}
      <div className="flex flex-col items-center justify-center py-24">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">{t('emptyTitle')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('emptySubtitle')}</p>
        </div>

        <div className="mt-8 flex gap-6">
          <button
            onClick={() => onCreateView('form')}
            className="group flex w-48 flex-col items-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-background p-8 transition-all hover:border-primary/50 hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium text-foreground">{t('createFormView')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('formViewDesc')}</p>
            </div>
          </button>

          <button
            onClick={() => onCreateView('list')}
            className="group flex w-48 flex-col items-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-background p-8 transition-all hover:border-primary/50 hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
              <List className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium text-foreground">{t('createListView')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('listViewDesc')}</p>
            </div>
          </button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground/60">{t('emptyHint')}</p>
      </div>
    </div>
  );
}
