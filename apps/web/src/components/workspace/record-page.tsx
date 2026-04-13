'use client';

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Save, Clock, User as UserIcon } from 'lucide-react';
import type { Field, LayoutConfig, SysView } from '@openforge/shared';
import {
  RenderProvider,
  FormRenderer,
  generateDefaultFormLayout,
  type EntityWithFields,
} from '@openforge/render-engine';
import { useRenderServices } from '@/hooks/use-render-services';
import { useTabStore } from '@/stores/tab-store';
import { useAuthStore } from '@/stores/auth-store';
import { useActions } from '@/hooks/use-actions';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage, getApiErrorCode, cn } from '@/lib/utils';
import { ActionToolbar } from '@/components/workspace/action-toolbar';
import { DataStatusBadge } from '@/components/workspace/data-status-badge';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RecordPageProps {
  appCode: string;
  modelCode: string;
  modelId: string;
  modelName: string;
  enableDataStatus: boolean;
  fields: Field[];
  entities?: EntityWithFields[];
  views?: SysView[];
  recordId?: string; // undefined = create mode
  tabId: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Resolve the default form view layout. Falls back to auto-generated. */
function resolveFormLayout(
  views: SysView[] | undefined,
  fields: Field[],
  entities: EntityWithFields[],
): LayoutConfig {
  if (views?.length) {
    const defaultForm =
      views.find((v) => v.type === 'form' && v.isDefault) ??
      views.find((v) => v.type === 'form');
    if (defaultForm?.layout) return defaultForm.layout;
  }
  return generateDefaultFormLayout(
    fields,
    entities.map((e) => ({ id: e.id, code: e.code, entityType: e.entityType ?? 'one_to_many' })),
  );
}

/** Format ISO date string for display */
function formatDateTime(val: string | null | undefined): string {
  if (!val) return '-';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(val));
  } catch {
    return String(val);
  }
}

/** Cache for resolved user display names */
const userNameCache = new Map<string, string>();

async function resolveUserName(userId: string | null | undefined): Promise<string> {
  if (!userId) return '-';
  const cached = userNameCache.get(userId);
  if (cached) return cached;
  try {
    const { data } = await apiClient.get(`/users/${userId}`);
    const name = data.displayName || data.username || userId;
    userNameCache.set(userId, name);
    return name;
  } catch {
    return userId.slice(0, 8) + '...';
  }
}

/* ------------------------------------------------------------------ */
/*  RecordPage Component                                               */
/* ------------------------------------------------------------------ */

export function RecordPage({
  appCode,
  modelCode,
  modelId,
  modelName,
  enableDataStatus,
  fields,
  entities = [],
  views,
  recordId,
  tabId,
}: RecordPageProps) {
  const t = useTranslations();
  const tErrors = useTranslations('errorCodes');
  const tDataTab = useTranslations('dataTab');
  const tCommon = useTranslations('common');
  const tRecord = useTranslations('recordPage');

  const user = useAuthStore((s) => s.user);
  const { setDirty, updateTitle, closeTab } = useTabStore();
  const { actions } = useActions(modelId);
  const services = useRenderServices(fields, entities);

  const isCreate = !recordId;

  /* ---------- Data state ---------- */
  const [record, setRecord] = useState<Record<string, any> | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [childrenData, setChildrenData] = useState<Record<string, Record<string, any>[]>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);

  /* ---------- System info state ---------- */
  const [createdByName, setCreatedByName] = useState('-');
  const [updatedByName, setUpdatedByName] = useState('-');

  /* ---------- Toast ---------- */
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ---------- Confirm dialog ---------- */
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'delete' | 'archiveInstead';
    message: string;
  } | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  /* ---------- Refs ---------- */
  const dirtyRef = useRef(false);

  /* ---------- First field column (for tab title) ---------- */
  const firstFieldColumnName = useMemo(() => {
    const first = fields.find((f) => !f.isSystem && !f.deletedAt);
    return first?.columnName ?? 'id';
  }, [fields]);

  /* ---------- Form layout ---------- */
  const formLayout = useMemo(
    () => resolveFormLayout(views, fields, entities),
    [views, fields, entities],
  );

  /* ---------- Determine form mode ---------- */
  const mode = useMemo(() => {
    if (isCreate) return 'create' as const;
    if (!record) return 'view' as const;
    if (enableDataStatus) {
      const status = record.data_status;
      if (status === 'draft') return 'edit' as const;
      return 'view' as const;
    }
    return 'edit' as const;
  }, [isCreate, record, enableDataStatus]);

  /* ---------- Fetch record ---------- */
  const fetchRecord = useCallback(async () => {
    if (isCreate) return;
    setLoading(true);
    try {
      const { data: rec } = await apiClient.get(
        `/apps/${appCode}/models/${modelCode}/data/${recordId}`,
      );
      setRecord(rec);
      // Separate __childrenMeta and regular data
      const { __childrenMeta, ...regularData } = rec;
      setFormData(regularData);

      // Load children rows if entities exist
      if (__childrenMeta && typeof __childrenMeta === 'object') {
        const childrenEntries: Record<string, Record<string, any>[]> = {};
        await Promise.all(
          Object.entries(__childrenMeta).map(async ([entityCode, meta]: [string, any]) => {
            try {
              const { data: rows } = await apiClient.get(
                `/entities/${meta.entityId}/records?parentId=${recordId}`,
              );
              childrenEntries[entityCode] = Array.isArray(rows) ? rows : [];
            } catch {
              // Entity records query failed — possibly permission issue; start with empty
              childrenEntries[entityCode] = [];
            }
          }),
        );
        setChildrenData(childrenEntries);
      }

      // Update tab title
      const titleValue = rec[firstFieldColumnName];
      if (titleValue) {
        updateTitle(tabId, String(titleValue));
      }

      // Resolve user names for system info
      const [createdBy, updatedBy] = await Promise.all([
        resolveUserName(rec.created_by),
        resolveUserName(rec.updated_by),
      ]);
      setCreatedByName(createdBy);
      setUpdatedByName(updatedBy);
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('fetchFailed')), 'error');
    } finally {
      setLoading(false);
    }
  }, [
    isCreate, appCode, modelCode, recordId, firstFieldColumnName,
    updateTitle, tabId, showToast, tErrors, tCommon,
  ]);

  useEffect(() => {
    fetchRecord();
  }, [fetchRecord]);

  /* ---------- Form change handlers ---------- */
  const handleFieldChange = useCallback(
    (columnName: string, value: any) => {
      setFormData((prev) => ({ ...prev, [columnName]: value }));
      setFormErrors((prev) => {
        if (!prev[columnName]) return prev;
        const next = { ...prev };
        delete next[columnName];
        return next;
      });
      if (!dirtyRef.current) {
        dirtyRef.current = true;
        setDirty(tabId, true);
      }
    },
    [setDirty, tabId],
  );

  const handleChildrenChange = useCallback(
    (entityCode: string, rows: Record<string, any>[]) => {
      setChildrenData((prev) => ({ ...prev, [entityCode]: rows }));
      if (!dirtyRef.current) {
        dirtyRef.current = true;
        setDirty(tabId, true);
      }
    },
    [setDirty, tabId],
  );

  /* ---------- Save ---------- */
  const handleSave = useCallback(async () => {
    setSaving(true);
    setFormErrors({});
    try {
      // Build payload
      const payload: Record<string, any> = { ...formData };
      // Add children data if any
      if (Object.keys(childrenData).length > 0) {
        payload.__children = childrenData;
      }

      if (isCreate) {
        // POST create
        const { data: created } = await apiClient.post(
          `/apps/${appCode}/models/${modelCode}/data`,
          payload,
        );
        showToast(tDataTab('createSuccess'), 'success');
        dirtyRef.current = false;
        setDirty(tabId, false);

        // Close create tab and open the detail tab for the newly created record
        const { openDetailTab } = useTabStore.getState();
        closeTab(tabId);
        openDetailTab({
          appCode,
          modelCode,
          modelName,
          recordId: created.id,
          title: created[firstFieldColumnName] || created.id,
        });
      } else {
        // PUT update — include version for optimistic locking
        const { data: updated } = await apiClient.put(
          `/apps/${appCode}/models/${modelCode}/data/${recordId}`,
          payload,
        );
        setRecord(updated);
        const { __childrenMeta, ...regularData } = updated;
        setFormData(regularData);
        showToast(tDataTab('updateSuccess'), 'success');
        dirtyRef.current = false;
        setDirty(tabId, false);

        // Update tab title if first field changed
        const titleValue = updated[firstFieldColumnName];
        if (titleValue) {
          updateTitle(tabId, String(titleValue));
        }

        // Resolve updated_by name
        resolveUserName(updated.updated_by).then(setUpdatedByName);
      }
    } catch (err: unknown) {
      const errorCode = getApiErrorCode(err);
      if (errorCode === 'DATA_VERSION_CONFLICT') {
        showToast(tDataTab('versionConflict'), 'error');
      } else {
        showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
      }
    } finally {
      setSaving(false);
    }
  }, [
    formData, childrenData, isCreate, appCode, modelCode, recordId,
    tabId, modelName, firstFieldColumnName, showToast, tDataTab,
    tErrors, tCommon, setDirty, closeTab, updateTitle,
  ]);

  /* ---------- ActionToolbar onAction handler ---------- */
  const handleAction = useCallback(
    async (actionCode: string, _records: Record<string, any>[]) => {
      switch (actionCode) {
        case 'create': {
          const { openCreateTab } = useTabStore.getState();
          openCreateTab({ appCode, modelCode, modelName });
          break;
        }
        case 'edit':
          // Already in edit mode or mode is managed by data_status
          break;
        case 'delete':
          setConfirmDialog({
            type: 'delete',
            message: tCommon('confirmDelete'),
          });
          break;
        case 'archive':
          try {
            await apiClient.put(
              `/apps/${appCode}/models/${modelCode}/data/${recordId}/archive`,
              { archived: true },
            );
            showToast(tDataTab('archiveSuccess'), 'success');
            fetchRecord();
          } catch (err: unknown) {
            showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
          }
          break;
        case 'unarchive':
          try {
            await apiClient.put(
              `/apps/${appCode}/models/${modelCode}/data/${recordId}/archive`,
              { archived: false },
            );
            showToast(tDataTab('unarchiveSuccess'), 'success');
            fetchRecord();
          } catch (err: unknown) {
            showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
          }
          break;
        case 'submit':
        case 'approve':
        case 'withdraw':
        case 'unapprove':
          try {
            await apiClient.put(
              `/apps/${appCode}/models/${modelCode}/data/${recordId}/status`,
              { action: actionCode },
            );
            showToast(tCommon('operationSuccess'), 'success');
            fetchRecord();
          } catch (err: unknown) {
            showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
          }
          break;
        default:
          break;
      }
    },
    [appCode, modelCode, recordId, showToast, tDataTab, tErrors, tCommon, fetchRecord],
  );

  /* ---------- Delete confirm ---------- */
  const handleConfirmAction = useCallback(async () => {
    if (!confirmDialog) return;
    setConfirmSubmitting(true);
    try {
      if (confirmDialog.type === 'delete') {
        try {
          await apiClient.delete(
            `/apps/${appCode}/models/${modelCode}/data/${recordId}`,
          );
          showToast(tDataTab('deleteSuccess'), 'success');
          closeTab(tabId);
        } catch (err: any) {
          const errorCode = getApiErrorCode(err);
          if (errorCode === 'DATA_HAS_REFERENCES') {
            const refModel = err?.response?.data?.details?.referencedBy || '';
            setConfirmDialog({
              type: 'archiveInstead',
              message: tDataTab('deleteHasReferences', { model: refModel }),
            });
            setConfirmSubmitting(false);
            return;
          }
          showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
        }
      } else if (confirmDialog.type === 'archiveInstead') {
        await apiClient.put(
          `/apps/${appCode}/models/${modelCode}/data/${recordId}/archive`,
          { archived: true },
        );
        showToast(tDataTab('archiveSuccess'), 'success');
        fetchRecord();
      }
      setConfirmDialog(null);
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
      setConfirmDialog(null);
    } finally {
      setConfirmSubmitting(false);
    }
  }, [
    confirmDialog, appCode, modelCode, recordId, tabId,
    showToast, tDataTab, tErrors, tCommon, closeTab, fetchRecord,
  ]);

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed top-6 left-1/2 -translate-x-1/2 z-[100] rounded-md px-4 py-3 text-sm shadow-lg',
            toast.type === 'success'
              ? 'bg-primary text-primary-foreground'
              : 'bg-destructive text-white',
          )}
        >
          {toast.message}
        </div>
      )}

      {/* Toolbar */}
      {!isCreate && (
        <div className="px-6 pt-4 pb-2">
          <ActionToolbar
            actions={actions}
            selectedRecords={record ? [record] : []}
            enableDataStatus={enableDataStatus}
            position="detail"
            currentRecord={record ?? undefined}
            currentUserId={user?.id}
            onAction={handleAction}
            onRefresh={fetchRecord}
          />
        </div>
      )}

      {/* Header: Title + Status + Save button */}
      <div className="flex items-center gap-4 px-6 py-3 border-b">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate">
            {isCreate
              ? tRecord('createTitle', { name: modelName })
              : (formData[firstFieldColumnName] || tRecord('detailTitle', { name: modelName }))}
          </h2>
          {!isCreate && enableDataStatus && record?.data_status && (
            <DataStatusBadge status={record.data_status} />
          )}
          {!isCreate && record?.is_archived && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
              {t('archive.archived')}
            </span>
          )}
        </div>

        {/* Save button — shown only in editable modes */}
        {(mode === 'create' || mode === 'edit') && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium',
              'bg-primary text-primary-foreground shadow hover:bg-primary/90',
              'disabled:opacity-50 disabled:pointer-events-none',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? tCommon('processing') : tRecord('save')}
          </button>
        )}
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-auto">
        <RenderProvider
          mode={mode}
          fields={fields}
          entities={entities}
          data={formData}
          onChange={handleFieldChange}
          errors={formErrors}
          t={t}
          services={services}
          childrenData={childrenData}
          onChildrenChange={handleChildrenChange}
        >
          <FormRenderer layout={formLayout} />
        </RenderProvider>
      </div>

      {/* System info footer */}
      {!isCreate && record && (
        <div className="flex items-center gap-6 px-6 py-3 border-t text-xs text-muted-foreground shrink-0">
          <span className="inline-flex items-center gap-1">
            <UserIcon className="w-3 h-3" />
            {tRecord('createdBy')}: {createdByName}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {tRecord('createdAt')}: {formatDateTime(record.created_at)}
          </span>
          <span className="inline-flex items-center gap-1">
            <UserIcon className="w-3 h-3" />
            {tRecord('updatedBy')}: {updatedByName}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {tRecord('updatedAt')}: {formatDateTime(record.updated_at)}
          </span>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">{tCommon('actionConfirm')}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {confirmDialog.message}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDialog(null)}
                className={cn(
                  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2',
                  'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
                  'disabled:opacity-50 disabled:pointer-events-none',
                )}
                disabled={confirmSubmitting}
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={confirmSubmitting}
                className={cn(
                  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 shadow-sm',
                  'disabled:opacity-50 disabled:pointer-events-none',
                  confirmDialog.type === 'archiveInstead'
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-destructive text-white hover:bg-destructive/90',
                )}
              >
                {confirmSubmitting
                  ? tCommon('processing')
                  : confirmDialog.type === 'archiveInstead'
                    ? tDataTab('archiveInstead')
                    : tCommon('confirmDeleteBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
