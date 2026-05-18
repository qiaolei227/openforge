'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, Plus, Settings2, Trash2 } from 'lucide-react';
import { workflowApi, type Workflow } from '@/lib/api/workflow';
import { getApiErrorMessage, cn } from '@/lib/utils';
import { useToastStore } from '@/stores/toast-store';
import { CreateWorkflowDialog } from './create-workflow-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface WorkflowListTabProps {
  appId: string;
  appCode: string;
  modelId: string;
  modelCode: string;
  enableDataStatus: boolean;
}

export function WorkflowListTab({
  appId,
  appCode,
  modelId,
  modelCode,
  enableDataStatus,
}: WorkflowListTabProps) {
  const t = useTranslations('workflow');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errorCodes');
  const router = useRouter();
  const showToast = useToastStore((s) => s.show);

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await workflowApi.list(appCode, modelCode);
      setWorkflows(list);
    } catch (err) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('fetchFailed')), 'error');
    } finally {
      setLoading(false);
    }
  }, [appCode, modelCode, showToast, tCommon]);

  useEffect(() => {
    if (enableDataStatus) load();
  }, [enableDataStatus, load]);

  if (!enableDataStatus) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        {t('list.requiresDataStatus')}
      </div>
    );
  }

  const toggleEnabled = async (w: Workflow) => {
    setTogglingId(w.id);
    try {
      await workflowApi.update(w.id, { enabled: !w.enabled });
      await load();
    } catch (err) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await workflowApi.delete(deleteTarget.id);
      showToast(tCommon('operationSuccess'), 'success');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const goEditor = (workflowId: string) => {
    router.push(
      `/apps/${appId}/models/${modelId}/workflows/${workflowId}/editor`,
    );
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium">{t('list.title')}</h3>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium h-8 px-3 bg-primary text-primary-foreground shadow hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          {t('list.new')}
        </button>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : workflows.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground border rounded-md">
          {t('list.empty')}
        </div>
      ) : (
        <div className="rounded-md border divide-y bg-card">
          {workflows.map((w) => {
            const instanceCount = w._count?.instances ?? 0;
            const versionLabel = w.currentVersion
              ? `v${w.currentVersion.versionNo}`
              : t('list.unpublished');
            return (
              <div
                key={w.id}
                className="flex items-center gap-4 px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{w.name}</div>
                  {w.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {w.description}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {versionLabel}
                    {instanceCount > 0 && (
                      <span className="ml-2">
                        · {t('list.instanceCount', { count: instanceCount })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Enable toggle (same pattern as distribution-policy autoDistribute) */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={w.enabled}
                  onClick={() => toggleEnabled(w)}
                  disabled={togglingId === w.id}
                  title={
                    w.enabled ? t('list.disabled') : t('list.enabled')
                  }
                  className={cn(
                    'relative inline-flex items-center justify-start h-5 w-10 rounded-full transition-colors shrink-0',
                    w.enabled ? 'bg-primary' : 'bg-muted-foreground/30',
                    togglingId === w.id && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform',
                      w.enabled ? 'translate-x-[22px]' : 'translate-x-[3px]',
                    )}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => goEditor(w.id)}
                  title={t('list.edit')}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(w)}
                  disabled={instanceCount > 0}
                  title={
                    instanceCount > 0
                      ? t('list.cannotDeleteWithInstances')
                      : t('list.delete')
                  }
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <CreateWorkflowDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        appCode={appCode}
        modelCode={modelCode}
        onCreated={(workflowId) => {
          setCreateOpen(false);
          load();
          // Newly-created workflows always need configuration (assignees /
          // condition thresholds), so jump straight into the editor.
          goEditor(workflowId);
        }}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('list.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {deleteTarget &&
                t('list.deleteConfirm', { name: deleteTarget.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 border border-input bg-background hover:bg-accent disabled:opacity-50"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium h-9 px-4 bg-destructive text-white shadow-sm hover:bg-destructive/90 disabled:opacity-50"
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
              {tCommon('confirmDeleteBtn')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
