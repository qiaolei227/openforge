'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, ArrowLeft } from 'lucide-react';
import type { Field, SysView, SysEntity } from '@openforge/shared';
import { apiClient } from '@/lib/api-client';
import { useCanvasStore } from './canvas-store';
import { DesignerLayout } from './designer-layout';

interface AppInfo {
  id: string;
  name: string;
}

interface ModelInfo {
  id: string;
  name: string;
  code: string;
  appId: string;
}

export default function DesignerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const appId = params.appId as string;
  const modelId = params.modelId as string;
  const targetViewId = searchParams.get('viewId');
  const t = useTranslations('designer');
  const tCommon = useTranslations('common');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [entities, setEntities] = useState<SysEntity[]>([]);
  const [views, setViews] = useState<SysView[]>([]);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const setView = useCanvasStore((s) => s.setView);
  const initialized = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const [appRes, modelRes, fieldsRes, entitiesRes, viewsRes] = await Promise.all([
          apiClient.get(`/apps/${appId}`),
          apiClient.get(`/models/${modelId}`),
          apiClient.get(`/models/${modelId}/fields`),
          apiClient.get(`/models/${modelId}/entities`),
          apiClient.get(`/models/${modelId}/views`),
        ]);

        if (cancelled) return;

        setAppInfo(appRes.data);
        setModelInfo(modelRes.data);
        setFields(fieldsRes.data);
        setEntities(entitiesRes.data);
        setViews(viewsRes.data);

        const viewList = viewsRes.data as SysView[];
        if (viewList.length > 0 && !initialized.current) {
          // Prefer the view specified in URL, then first form view, then first view
          const target = (targetViewId ? viewList.find((v) => v.id === targetViewId) : undefined)
            ?? viewList.find((v: SysView) => v.type === 'form' && v.isDefault)
            ?? viewList.find((v: SysView) => v.type === 'form')
            ?? viewList[0];
          setView(target.id, target.type, target.layout);
          initialized.current = true;
        }
      } catch (err) {
        if (!cancelled) {
          setError(t('loadError'));
          console.error('Failed to load designer data:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [appId, modelId, setView, t]);

  /* ---- Render ---- */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{t('loading')}</span>
        </div>
      </div>
    );
  }

  if (error || !appInfo || !modelInfo) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <p className="text-destructive">{error ?? t('loadError')}</p>
        </div>
      </div>
    );
  }

  const toastElement = toast && (
    <div
      className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
        toast.type === 'success'
          ? 'bg-emerald-600 text-white'
          : 'bg-destructive text-destructive-foreground'
      }`}
    >
      {toast.message}
    </div>
  );

  // No views → prompt to go back and create from model detail page
  if (views.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-muted-foreground mb-4">{t('emptyTitle')}</p>
        <button
          onClick={() => router.push(`/apps/${appId}/models/${modelId}?tab=views`)}
          className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          {tCommon('back')}
        </button>
      </div>
    );
  }

  return (
    <>
      <DesignerLayout
        appId={appId}
        modelId={modelId}
        appName={appInfo.name}
        modelName={modelInfo.name}
        fields={fields}
        entities={entities}
        views={views}
      />
      {toastElement}
    </>
  );
}
