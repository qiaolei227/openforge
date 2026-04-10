'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Undo2, Redo2, Eye, EyeOff, Save, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Breadcrumb } from '@/components/breadcrumb';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCanvasStore } from './canvas-store';

interface DesignerToolbarProps {
  appId: string;
  modelId: string;
  appName: string;
  modelName: string;
  previewMode: boolean;
  onTogglePreview: () => void;
}

const btnOutline =
  'inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent';

export function DesignerToolbar({ appId, modelId, appName, modelName, previewMode, onTogglePreview }: DesignerToolbarProps) {
  const router = useRouter();
  const t = useTranslations('designer');
  const tModels = useTranslations('models');
  const tCommon = useTranslations('common');
  const tApps = useTranslations('apps');

  const tDesigner = useTranslations('designer');

  const viewId = useCanvasStore((s) => s.viewId);
  const viewType = useCanvasStore((s) => s.viewType);
  const isDirty = useCanvasStore((s) => s.isDirty);
  const historyIndex = useCanvasStore((s) => s.historyIndex);
  const historyLength = useCanvasStore((s) => s.history.length);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const markClean = useCanvasStore((s) => s.markClean);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyLength - 1;

  const [saving, setSaving] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useCanvasStore.getState().isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const handleBack = useCallback(() => {
    if (useCanvasStore.getState().isDirty) {
      setLeaveDialogOpen(true);
      return;
    }
    router.push(`/apps/${appId}/models/${modelId}?tab=views`);
  }, [router, appId, modelId]);

  const confirmLeave = useCallback(() => {
    setLeaveDialogOpen(false);
    router.push(`/apps/${appId}/models/${modelId}?tab=views`);
  }, [router, appId, modelId]);

  const handleSave = useCallback(async () => {
    if (!viewId || saving) return;
    setSaving(true);
    try {
      const layout = useCanvasStore.getState().layout;
      await apiClient.put(`/views/${viewId}`, { layout });
      markClean();
    } catch (err) {
      console.error('Failed to save view:', err);
    } finally {
      setSaving(false);
    }
  }, [viewId, saving, markClean]);

  return (
    <>
      {/* Breadcrumb — same style as model detail page */}
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
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{modelName} — {tModels('designViews')}</h2>
            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {viewType === 'form' ? tDesigner('formView') : tDesigner('listView')}
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {previewMode ? (
              <button onClick={onTogglePreview} className={btnOutline}>
                <EyeOff className="w-4 h-4 mr-1.5" />
                {t('exitPreview')}
              </button>
            ) : (
              <>
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                  title={t('undo')}
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                  title={t('redo')}
                >
                  <Redo2 className="h-4 w-4" />
                </button>

                <button
                  onClick={handleBack}
                  className={btnOutline}
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  {tCommon('back')}
                </button>

                <button onClick={onTogglePreview} className={btnOutline}>
                  <Eye className="w-4 h-4 mr-1.5" />
                  {t('preview')}
                </button>

                <button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className="relative inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1.5" />
                  )}
                  {saving ? t('saving') : t('save')}
                  {isDirty && !saving && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-orange-400 border-2 border-background" />
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Unsaved changes dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('unsavedTitle')}</DialogTitle>
            <DialogDescription>{t('unsavedMessage')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>
              {tCommon('cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmLeave}>
              {t('unsavedLeave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
