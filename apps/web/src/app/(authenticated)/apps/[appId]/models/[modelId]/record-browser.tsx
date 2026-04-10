'use client';

import { useState, useCallback, useEffect, useRef, useMemo, type ComponentType } from 'react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import {
  DataTable,
  FormDrawer,
  getFieldComponent,
  TreeView,
  TreeSelect,
  type FieldComponentProps,
  type LayoutColumnConfig,
  type ChildrenMeta,
  type TreeNode,
  type TreeColumn,
} from '@openforge/ui';
import { RenderProvider, FormRenderer, generateDefaultFormLayout, type EntityWithFields } from '@openforge/render-engine';
import type { Field, FieldType, LayoutConfig, LayoutNode, QueryResponse, BatchResponse, SysView } from '@openforge/shared';
import { useRenderServices } from '@/hooks/use-render-services';

/* ------------------------------------------------------------------ */
/*  Inline SVG Icons (no emoji, monochrome per CLAUDE.md)              */
/* ------------------------------------------------------------------ */

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function Trash2Icon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function ArchiveRestoreIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="m9.5 17 2.5-2.5L14.5 17" />
      <path d="M12 13.5V17" />
    </svg>
  );
}

function Loader2Icon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Button Style Constants                                             */
/* ------------------------------------------------------------------ */

const btnPrimary =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none';
const btnOutline =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none';
const btnDestructive =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3 py-2 bg-destructive text-white shadow-sm hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none';
const btnGhost =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 py-1 hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RecordBrowserProps {
  model: {
    id: string;
    name: string;
    code: string;
    tableName: string;
    isTree?: boolean;
    app: { code: string };
  };
  fields: Field[];
}

/* ------------------------------------------------------------------ */
/*  Component cache for renderCell                                     */
/* ------------------------------------------------------------------ */

const cellComponentCache = new Map<string, ComponentType<FieldComponentProps>>();

/* ------------------------------------------------------------------ */
/*  System Info Section (displayed after form in view mode)             */
/* ------------------------------------------------------------------ */

function SystemInfoSection({
  systemInfo,
  t,
}: {
  systemInfo: { createdBy?: string; createdAt?: string; updatedBy?: string; updatedAt?: string };
  t: (key: string, values?: Record<string, any>) => string;
}) {
  return (
    <div className="mt-8 pt-4 border-t space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {t('autoForm.systemInfo')}
      </h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        {systemInfo.createdBy && (
          <div>
            <span className="text-muted-foreground">{t('autoForm.createdBy')}: </span>
            <span>{systemInfo.createdBy}</span>
          </div>
        )}
        {systemInfo.createdAt && (
          <div>
            <span className="text-muted-foreground">{t('autoForm.createdAt')}: </span>
            <span>{systemInfo.createdAt}</span>
          </div>
        )}
        {systemInfo.updatedBy && (
          <div>
            <span className="text-muted-foreground">{t('autoForm.updatedBy')}: </span>
            <span>{systemInfo.updatedBy}</span>
          </div>
        )}
        {systemInfo.updatedAt && (
          <div>
            <span className="text-muted-foreground">{t('autoForm.updatedAt')}: </span>
            <span>{systemInfo.updatedAt}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RecordBrowser Component                                            */
/* ------------------------------------------------------------------ */

export default function RecordBrowser({ model, fields }: RecordBrowserProps) {
  const t = useTranslations();
  const tErrors = useTranslations('errorCodes');
  const tCommon = useTranslations('common');

  /* ---------- Data state ---------- */
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sort, setSort] = useState<{ field: string; order: 'asc' | 'desc' } | null>(null);
  const [loading, setLoading] = useState(true);

  /* ---------- Tree state ---------- */
  const isTreeModel = !!model.isTree;
  const [viewMode, setViewMode] = useState<'table' | 'tree'>(isTreeModel ? 'tree' : 'table');
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [treeLoading, setTreeLoading] = useState(false);

  /* Debounced keyword for tree search — avoids API call on every keystroke */
  const [debouncedKeyword, setDebouncedKeyword] = useState(keyword);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  /* ---------- Drawer state ---------- */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit' | 'create'>('view');
  const [selectedRecord, setSelectedRecord] = useState<Record<string, any> | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [displayValues, setDisplayValues] = useState<Record<string, string>>({});
  const [resolvedUserNames, setResolvedUserNames] = useState<{
    createdBy?: string;
    updatedBy?: string;
  }>({});

  // SubTable children state
  const [childrenData, setChildrenData] = useState<Record<string, Record<string, any>[]>>({});
  const [childrenMeta, setChildrenMeta] = useState<Record<string, ChildrenMeta>>({});

  /* ---------- User name cache for system info ---------- */
  const userNameCache = useRef<Map<string, string>>(new Map());

  const resolveUserName = useCallback(
    async (userId: string): Promise<string> => {
      if (!userId) return '';
      const cached = userNameCache.current.get(userId);
      if (cached) return cached;
      try {
        const { data: user } = await apiClient.get(`/users/${userId}`);
        const name = user.displayName || user.username || userId;
        userNameCache.current.set(userId, name);
        return name;
      } catch {
        // Fallback to short UUID
        const short = userId.slice(0, 8) + '...';
        userNameCache.current.set(userId, short);
        return short;
      }
    },
    [],
  );

  /* ---------- Confirm dialog ---------- */
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'delete' | 'batchDelete' | 'batchArchive' | 'archiveInstead';
    message: string;
    ids: string[];
  } | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  /* ---------- Toast ---------- */
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ---------- View layouts from sys_view ---------- */
  const [views, setViews] = useState<SysView[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function fetchViews() {
      try {
        const { data: viewList } = await apiClient.get<SysView[]>(`/models/${model.id}/views`);
        if (!cancelled) setViews(viewList);
      } catch {
        // Views not available — fall back to auto-generated behavior
      }
    }
    fetchViews();
    return () => { cancelled = true; };
  }, [model.id]);

  /** Derive layout column config from the saved list view layout */
  const layoutColumns = useMemo<LayoutColumnConfig[] | undefined>(() => {
    const listView = views.find((v) => v.type === 'list' && v.isDefault) ?? views.find((v) => v.type === 'list');
    if (!listView?.layout?.children?.length) return undefined;
    return listView.layout.children
      .filter((node: LayoutNode) => node.type === 'Column' && node.props?.fieldId)
      .map((node: LayoutNode) => ({
        fieldId: node.props!.fieldId,
        label: node.props!.label,
        width: node.props!.width,
        align: node.props!.align,
        fixed: node.props!.fixed,
      }));
  }, [views]);

  /** Derive form layout from the saved form view, or generate a default */
  const formLayout = useMemo<LayoutConfig>(() => {
    const formView = views.find((v) => v.type === 'form' && v.isDefault) ?? views.find((v) => v.type === 'form');
    if (formView?.layout?.children?.length) return formView.layout;
    return generateDefaultFormLayout(fields);
  }, [views, fields]);

  /* ---------- Shared render services (queryFn, systemQueryFn, uploadFn, relationMeta, referenceFields) ---------- */
  const renderServices = useRenderServices(fields);
  const {
    queryFn: queryForRelationPicker,
    systemQueryFn,
    uploadFn: fileUploadFn,
    relationMeta,
    referenceFields: manyToOneFields,
  } = renderServices;

  // M2M relations state
  const [relationsData, setRelationsData] = useState<Record<string, { add: string[]; remove: string[] }>>({});

  /* ------------------------------------------------------------------ */
  /*  API calls                                                          */
  /* ------------------------------------------------------------------ */

  const isFirstLoad = useRef(true);

  const fetchData = useCallback(async () => {
    if (isFirstLoad.current) {
      setLoading(true);
    }
    try {
      const sortArr = sort ? [{ field: sort.field, order: sort.order }] : undefined;
      const { data: resp } = await apiClient.post<QueryResponse>(
        `/apps/${model.app.code}/models/${model.code}/data/query`,
        {
          keyword: keyword || undefined,
          page,
          pageSize,
          sort: sortArr,
          includeArchived,
        },
      );
      setData(resp.data);
      setTotal(resp.total);
    } catch {
      showToast(t('common.fetchFailed'), 'error');
    } finally {
      setLoading(false);
      isFirstLoad.current = false;
    }
  }, [model.app.code, model.code, keyword, page, pageSize, sort, includeArchived, showToast, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchRecord = useCallback(
    async (id: string) => {
      try {
        const { data: record } = await apiClient.get(
          `/apps/${model.app.code}/models/${model.code}/data/${id}`,
        );
        return record;
      } catch {
        showToast(t('common.fetchFailed'), 'error');
        return null;
      }
    },
    [model.app.code, model.code, showToast, t],
  );

  /* ------------------------------------------------------------------ */
  /*  Tree data loading                                                  */
  /* ------------------------------------------------------------------ */

  const loadTreeChildren = useCallback(async (parentId: string | null) => {
    setTreeLoading(true);
    try {
      const res = await apiClient.post(
        `/apps/${model.app.code}/models/${model.code}/data/query`,
        {
          treeMode: true,
          parentId,
          keyword: debouncedKeyword,
          includeArchived,
          pageSize: 200,
        },
      );
      const newNodes: TreeNode[] = (res.data?.data ?? res.data ?? []).map((r: any) => ({
        ...r,
        parent_id: r.parent_id ?? null,
        __hasChildren: r.__hasChildren ?? false,
      }));
      setTreeNodes((prev) => {
        const filtered = prev.filter((n) => n.parent_id !== parentId);
        return [...filtered, ...newNodes];
      });
    } catch {
      // silently fail
    } finally {
      setTreeLoading(false);
    }
  }, [model.app.code, model.code, debouncedKeyword, includeArchived]);

  useEffect(() => {
    if (isTreeModel && viewMode === 'tree') {
      loadTreeChildren(null);
    }
  }, [isTreeModel, viewMode, loadTreeChildren]);

  const handleTreeExpand = useCallback((id: string) => {
    setExpandedIds((prev) => new Set(prev).add(id));
    loadTreeChildren(id);
  }, [loadTreeChildren]);

  const handleTreeCollapse = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const treeColumns = useMemo<TreeColumn[]>(() => {
    if (!isTreeModel) return [];
    return fields
      .filter((f) => !f.isSystem && !f.deletedAt)
      .slice(0, 6)
      .map((f) => ({ key: f.columnName, label: f.name }));
  }, [fields, isTreeModel]);

  /* ------------------------------------------------------------------ */
  /*  Handlers                                                           */
  /* ------------------------------------------------------------------ */

  const handleNew = useCallback(() => {
    // Initialize with default values
    const defaults: Record<string, any> = {};
    for (const field of fields) {
      if (field.isSystem || field.deletedAt) continue;
      if (field.fieldType === 'AUTO_NUMBER') continue;
      if (field.defaultValue != null) {
        defaults[field.columnName] = field.defaultValue;
      } else if (field.fieldType === 'BOOLEAN') {
        defaults[field.columnName] = false;
      } else {
        defaults[field.columnName] = '';
      }
    }
    setFormData(defaults);
    setFormErrors({});
    setDisplayValues({});
    setResolvedUserNames({});
    setChildrenData({}); setRelationsData({});
    setChildrenMeta({});
    setSelectedRecord(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  }, [fields]);

  const handleRowClick = useCallback(
    async (record: Record<string, any>) => {
      const full = await fetchRecord(record.id);
      if (!full) return;
      setSelectedRecord(full);
      setFormData(full);
      setFormErrors({});

      // Resolve display values for REFERENCE fields
      const dv: Record<string, string> = {};
      for (const field of manyToOneFields) {
        const meta = relationMeta[field.columnName];
        const val = full[field.columnName];
        if (val && meta) {
          const displayField = field.options?.targetDisplayField || 'id';
          try {
            const { data: relRecord } = await apiClient.get(
              `/apps/${meta.appCode}/models/${meta.modelCode}/data/${val}`,
            );
            dv[field.columnName] = relRecord[displayField] ?? String(val);
          } catch {
            dv[field.columnName] = String(val);
          }
        }
      }

      // Resolve display values for USER and ORGANIZATION fields (from __display suffix)
      for (const field of fields) {
        if (field.isSystem || field.deletedAt) continue;
        if (field.fieldType === 'USER' || field.fieldType === 'ORGANIZATION') {
          const displayKey = `${field.columnName}__display`;
          if (full[displayKey]) {
            dv[field.columnName] = full[displayKey];
          }
        }
      }
      setDisplayValues(dv);

      // Resolve user names for system info
      const [createdByName, updatedByName] = await Promise.all([
        full.created_by ? resolveUserName(full.created_by) : Promise.resolve(undefined),
        full.updated_by ? resolveUserName(full.updated_by) : Promise.resolve(undefined),
      ]);
      setResolvedUserNames({ createdBy: createdByName, updatedBy: updatedByName });

      // Extract __childrenMeta and load child records (keyed by entityCode)
      const meta = (full.__childrenMeta || {}) as Record<string, ChildrenMeta>;
      setChildrenMeta(meta);

      if (Object.keys(meta).length > 0) {
        const entries = Object.entries(meta);
        const results = await Promise.all(
          entries.map(([, m]) =>
            apiClient.get(`/entities/${m.entityId}/records`, {
              params: { parentId: full.id },
            }).catch(() => ({ data: { data: [] } }))
          )
        );
        const childData: Record<string, Record<string, any>[]> = {};
        entries.forEach(([entityCode], i) => {
          childData[entityCode] = results[i]?.data?.data ?? results[i]?.data ?? [];
        });
        setChildrenData(childData);
      } else {
        setChildrenData({}); setRelationsData({});
      }

      setDrawerMode('view');
      setDrawerOpen(true);
    },
    [fetchRecord, manyToOneFields, relationMeta, resolveUserName],
  );

  const handleEdit = useCallback(() => {
    setDrawerMode('edit');
    setFormErrors({});
  }, []);

  const validateForm = useCallback(() => {
    const errors: Record<string, string> = {};
    for (const field of fields) {
      if (field.isSystem || field.deletedAt) continue;
      if (field.fieldType === 'AUTO_NUMBER') continue;
      if (field.isRequired) {
        const val = formData[field.columnName];
        if (val === undefined || val === null || val === '') {
          errors[field.columnName] = t('fields.required');
        }
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [fields, formData, t]);

  const handleSave = useCallback(async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      // Build payload — only non-system, non-auto-number fields
      const payload: Record<string, any> = {};
      for (const field of fields) {
        if (field.isSystem || field.deletedAt) continue;
        if (field.fieldType === 'AUTO_NUMBER') continue;
        const val = formData[field.columnName];
        payload[field.columnName] = val === '' ? null : val;
      }

      // Attach children data if any SubTable fields are present
      if (Object.keys(childrenData).length > 0) {
        payload.__children = childrenData;
      }

      // Attach M2M relations
      if (Object.keys(relationsData).length > 0) {
        payload.__relations = relationsData;
      }

      if (drawerMode === 'create') {
        await apiClient.post(
          `/apps/${model.app.code}/models/${model.code}/data`,
          payload,
        );
        showToast(t('dataTab.createSuccess'), 'success');
      } else if (drawerMode === 'edit' && selectedRecord) {
        payload.version = formData.version;
        await apiClient.put(
          `/apps/${model.app.code}/models/${model.code}/data/${selectedRecord.id}`,
          payload,
        );
        showToast(t('dataTab.updateSuccess'), 'success');
      }
      setDrawerOpen(false);
      setChildrenData({}); setRelationsData({});
      setChildrenMeta({});
      if (viewMode !== 'tree') {
        fetchData();
      }
      if (isTreeModel && viewMode === 'tree') {
        setTreeNodes([]);
        setExpandedIds(new Set());
        loadTreeChildren(null);
      }
    } catch (err: any) {
      const errorCode = err?.response?.data?.errorCode;
      if (errorCode === 'VERSION_CONFLICT') {
        showToast(t('dataTab.versionConflict'), 'error');
      } else {
        showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
      }
    } finally {
      setSubmitting(false);
    }
  }, [validateForm, fields, formData, relationsData, childrenData, drawerMode, selectedRecord, model.app.code, model.code, showToast, t, tErrors, tCommon, fetchData, isTreeModel, viewMode, loadTreeChildren]);

  const handleDelete = useCallback(
    (id: string) => {
      setConfirmDialog({
        type: 'delete',
        message: t('common.confirmDelete'),
        ids: [id],
      });
    },
    [t],
  );

  const handleArchive = useCallback(
    async (id: string, archived: boolean) => {
      try {
        await apiClient.put(
          `/apps/${model.app.code}/models/${model.code}/data/${id}/archive`,
          { archived },
        );
        showToast(archived ? t('dataTab.archiveSuccess') : t('dataTab.unarchiveSuccess'), 'success');
        if (viewMode !== 'tree') {
          fetchData();
        }
        if (isTreeModel && viewMode === 'tree') {
          setTreeNodes([]);
          setExpandedIds(new Set());
          loadTreeChildren(null);
        }
      } catch (err: any) {
        showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
      }
    },
    [model.app.code, model.code, showToast, t, tErrors, tCommon, fetchData, viewMode, isTreeModel, loadTreeChildren],
  );

  const handleBatchDelete = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      setConfirmDialog({
        type: 'batchDelete',
        message: t('dataTab.confirmBatchDelete', { count: ids.length }),
        ids,
      });
    },
    [t],
  );

  const handleBatchArchive = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      setConfirmDialog({
        type: 'batchArchive',
        message: t('dataTab.confirmBatchArchive', { count: ids.length }),
        ids,
      });
    },
    [t],
  );

  const handleConfirmAction = useCallback(async () => {
    if (!confirmDialog) return;
    setConfirmSubmitting(true);
    try {
      if (confirmDialog.type === 'delete') {
        try {
          await apiClient.delete(
            `/apps/${model.app.code}/models/${model.code}/data/${confirmDialog.ids[0]}`,
          );
          showToast(t('dataTab.deleteSuccess'), 'success');
          setDrawerOpen(false);
          setChildrenData({}); setRelationsData({});
          setChildrenMeta({});
          if (viewMode !== 'tree') {
            fetchData();
          }
          if (isTreeModel && viewMode === 'tree') {
            setTreeNodes([]);
            setExpandedIds(new Set());
            loadTreeChildren(null);
          }
        } catch (err: any) {
          const errorCode = err?.response?.data?.errorCode;
          if (errorCode === 'DATA_HAS_REFERENCES') {
            const refModel = err?.response?.data?.details?.referencedBy || '';
            setConfirmDialog({
              type: 'archiveInstead',
              message: t('dataTab.deleteHasReferences', { model: refModel }),
              ids: confirmDialog.ids,
            });
            setConfirmSubmitting(false);
            return;
          }
          showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
        }
      } else if (confirmDialog.type === 'archiveInstead') {
        await apiClient.put(
          `/apps/${model.app.code}/models/${model.code}/data/${confirmDialog.ids[0]}/archive`,
          { archived: true },
        );
        showToast(t('dataTab.archiveSuccess'), 'success');
        setDrawerOpen(false);
        setChildrenData({}); setRelationsData({});
        setChildrenMeta({});
        if (viewMode !== 'tree') {
          fetchData();
        }
        if (isTreeModel && viewMode === 'tree') {
          setTreeNodes([]);
          setExpandedIds(new Set());
          loadTreeChildren(null);
        }
      } else if (confirmDialog.type === 'batchDelete') {
        const { data: resp } = await apiClient.post<BatchResponse>(
          `/apps/${model.app.code}/models/${model.code}/data/batch`,
          { action: 'delete', ids: confirmDialog.ids },
        );
        if (resp.failed && resp.failed.length > 0) {
          showToast(`${resp.succeeded.length} ${t('dataTab.deleteSuccess')}, ${resp.failed.length} failed`, 'error');
        } else {
          showToast(t('dataTab.deleteSuccess'), 'success');
        }
        fetchData();
      } else if (confirmDialog.type === 'batchArchive') {
        for (const id of confirmDialog.ids) {
          await apiClient.put(
            `/apps/${model.app.code}/models/${model.code}/data/${id}/archive`,
            { archived: true },
          );
        }
        showToast(t('dataTab.archiveSuccess'), 'success');
        fetchData();
      }
      setConfirmDialog(null);
    } catch (err: any) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
      setConfirmDialog(null);
    } finally {
      setConfirmSubmitting(false);
    }
  }, [confirmDialog, model.app.code, model.code, showToast, t, tErrors, tCommon, fetchData, isTreeModel, viewMode, loadTreeChildren]);

  /* ------------------------------------------------------------------ */
  /*  Search debounce — reset page on keyword change                     */
  /* ------------------------------------------------------------------ */

  const handleKeywordChange = useCallback((kw: string) => {
    setKeyword(kw);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((field: string, order: 'asc' | 'desc') => {
    setSort({ field, order });
    setPage(1);
  }, []);

  /* ------------------------------------------------------------------ */
  /*  renderCell — lazy-loads field component for table cell rendering   */
  /* ------------------------------------------------------------------ */

  const [cellComponents, setCellComponents] = useState<
    Map<string, ComponentType<FieldComponentProps>>
  >(new Map());

  useEffect(() => {
    let cancelled = false;
    async function loadComponents() {
      const loaded = new Map<string, ComponentType<FieldComponentProps>>();
      for (const field of fields) {
        if (field.isSystem || field.deletedAt) continue;
        const cached = cellComponentCache.get(field.fieldType);
        if (cached) {
          loaded.set(field.fieldType, cached);
          continue;
        }
        const loader = getFieldComponent(field.fieldType as FieldType);
        if (!loader) continue;
        try {
          const mod = await loader();
          cellComponentCache.set(field.fieldType, mod.default);
          loaded.set(field.fieldType, mod.default);
        } catch {
          // skip
        }
      }
      if (!cancelled) {
        setCellComponents(loaded);
      }
    }
    loadComponents();
    return () => { cancelled = true; };
  }, [fields]);

  const renderCell = useCallback(
    (field: Field, value: any, record?: Record<string, any>) => {
      if (value === null || value === undefined) {
        return <span className="text-muted-foreground">&mdash;</span>;
      }

      const Comp = cellComponents.get(field.fieldType);
      if (!Comp) {
        return <span className="text-sm truncate">{String(value)}</span>;
      }

      // For reference fields, just show the UUID (display resolution happens in detail view)
      if (field.fieldType === 'REFERENCE' || field.fieldType === 'USER' || field.fieldType === 'ORGANIZATION') {
        return <span className="text-sm truncate">{String(value)}</span>;
      }

      // FILE: show file count
      if (field.fieldType === 'FILE') {
        const count = Array.isArray(value) ? value.length : 0;
        return <span className="text-sm">{count > 0 ? t('file.fileCount', { count }) : '-'}</span>;
      }

      // IMAGE: show thumbnail of first image when files metadata is available
      if (field.fieldType === 'IMAGE') {
        if (Array.isArray(value) && value.length > 0) {
          const files = record?.[`${field.columnName}__files`];
          if (Array.isArray(files) && files.length > 0) {
            return <img src={files[0].url} alt="" className="h-8 w-8 rounded object-cover" />;
          }
          return <span className="text-sm">{t('file.fileCount', { count: value.length })}</span>;
        }
        return <span className="text-muted-foreground">&mdash;</span>;
      }

      // MULTI_REFERENCE: show tags
      if (field.fieldType === 'MULTI_REFERENCE') {
        const m2mItems = record?.[`${field.columnName}__m2m`];
        if (Array.isArray(m2mItems) && m2mItems.length > 0) {
          return (
            <div className="flex flex-wrap gap-1">
              {m2mItems.slice(0, 3).map((item: any) => (
                <span key={item.id} className="inline-flex rounded-md border bg-muted px-1.5 py-0.5 text-xs">{item.displayValue}</span>
              ))}
              {m2mItems.length > 3 && <span className="text-xs text-muted-foreground">+{m2mItems.length - 3}</span>}
            </div>
          );
        }
        return <span className="text-muted-foreground">-</span>;
      }

      return (
        <Comp
          field={field}
          value={value}
          onChange={() => {}}
          disabled
          mode="view"
        />
      );
    },
    [cellComponents],
  );

  /* ------------------------------------------------------------------ */
  /*  System info for view mode                                          */
  /* ------------------------------------------------------------------ */

  const systemInfo = useMemo(() => {
    if (!selectedRecord) return undefined;
    return {
      createdBy: resolvedUserNames.createdBy || selectedRecord.created_by,
      createdAt: selectedRecord.created_at
        ? new Date(selectedRecord.created_at).toLocaleString()
        : undefined,
      updatedBy: resolvedUserNames.updatedBy || selectedRecord.updated_by,
      updatedAt: selectedRecord.updated_at
        ? new Date(selectedRecord.updated_at).toLocaleString()
        : undefined,
    };
  }, [selectedRecord, resolvedUserNames]);

  /* ---------- Merged data for RenderProvider (display values + raw data) ---------- */
  const renderData = useMemo(() => {
    const merged = { ...formData };
    // Inject client-resolved display values under the unified `${col}__display`
    // key (same suffix the backend uses for USER/ORGANIZATION in formData).
    for (const [col, val] of Object.entries(displayValues)) {
      merged[`${col}__display`] = val;
    }
    return merged;
  }, [formData, displayValues]);

  /* ---------- Build entities array from childrenMeta for SubTableSection ---------- */
  const renderEntities = useMemo<EntityWithFields[]>(() => {
    return Object.entries(childrenMeta).map(([code, meta]) => ({
      id: meta.entityId,
      modelId: '',
      name: meta.entityName,
      code,
      tableName: meta.targetTableName,
      entityType: meta.isOneToOne ? ('one_to_one' as const) : ('one_to_many' as const),
      createdAt: '',
      updatedAt: '',
      fields: meta.targetFields,
    }));
  }, [childrenMeta]);

  /* ------------------------------------------------------------------ */
  /*  Drawer footer                                                      */
  /* ------------------------------------------------------------------ */

  const drawerTitle = useMemo(() => {
    if (drawerMode === 'create') return t('dataTab.create', { name: model.name });
    if (drawerMode === 'edit') return t('dataTab.edit', { name: model.name });
    return t('dataTab.detail', { name: model.name });
  }, [drawerMode, model.name, t]);

  const drawerWidth = useMemo(
    () => (fields.some((f) => f.fieldType === 'RICHTEXT' && !f.deletedAt && !f.isSystem) ? 640 : 480),
    [fields],
  );

  const renderFooter = () => {
    if (drawerMode === 'view') {
      return (
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleEdit} className={btnPrimary}>
            <PencilIcon />
            <span className="ml-1.5">{t('common.edit')}</span>
          </button>
          {selectedRecord && !selectedRecord.is_archived && (
            <button
              type="button"
              onClick={() => handleArchive(selectedRecord.id, true)}
              className={btnOutline}
            >
              <ArchiveIcon />
              <span className="ml-1.5">{t('archive.archive')}</span>
            </button>
          )}
          {selectedRecord && selectedRecord.is_archived && (
            <button
              type="button"
              onClick={() => handleArchive(selectedRecord.id, false)}
              className={btnOutline}
            >
              <ArchiveRestoreIcon />
              <span className="ml-1.5">{t('archive.unarchive')}</span>
            </button>
          )}
          {selectedRecord && (
            <button
              type="button"
              onClick={() => handleDelete(selectedRecord.id)}
              className={`${btnGhost} text-destructive hover:text-destructive`}
            >
              <Trash2Icon />
              <span className="ml-1.5">{t('common.delete')}</span>
            </button>
          )}
        </div>
      );
    }

    // create / edit mode
    return (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            if (drawerMode === 'edit' && selectedRecord) {
              setDrawerMode('view');
              setFormData(selectedRecord);
              setFormErrors({});
            } else {
              setDrawerOpen(false);
              setChildrenData({}); setRelationsData({});
              setChildrenMeta({});
            }
          }}
          className={btnOutline}
          disabled={submitting}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          className={btnPrimary}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2Icon />
              <span className="ml-1.5">{t('common.submitting')}</span>
            </>
          ) : (
            t('common.save')
          )}
        </button>
      </div>
    );
  };

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="flex h-full flex-col">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] rounded-md px-4 py-3 text-sm shadow-lg ${
            toast.type === 'success'
              ? 'bg-primary text-primary-foreground'
              : 'bg-destructive text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Tree / Table view mode toggle */}
      {isTreeModel && (
        <div className="flex items-center justify-end px-4 pt-3 pb-1">
          <div className="inline-flex rounded-md border">
            <button
              type="button"
              className={`px-3 py-1.5 text-xs rounded-l-md border-r ${viewMode === 'table' ? 'bg-accent font-medium' : 'bg-background hover:bg-muted/50'}`}
              onClick={() => setViewMode('table')}
            >
              {t('tree.tableView')}
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 text-xs rounded-r-md ${viewMode === 'tree' ? 'bg-accent font-medium' : 'bg-background hover:bg-muted/50'}`}
              onClick={() => setViewMode('tree')}
            >
              {t('tree.treeView')}
            </button>
          </div>
        </div>
      )}

      {isTreeModel && viewMode === 'tree' ? (
        <TreeView
          nodes={treeNodes}
          columns={treeColumns}
          loading={treeLoading}
          expandedIds={expandedIds}
          onExpand={handleTreeExpand}
          onCollapse={handleTreeCollapse}
          onRowClick={(node) => handleRowClick(node as any)}
          t={t}
        />
      ) : (
        <DataTable
          fields={fields}
          data={data}
          total={total}
          page={page}
          pageSize={pageSize}
          loading={loading}
          keyword={keyword}
          includeArchived={includeArchived}
          onKeywordChange={handleKeywordChange}
          onPageChange={setPage}
          onArchiveToggle={() => {
            setIncludeArchived((prev) => !prev);
            setPage(1);
          }}
          onSortChange={handleSortChange}
          onRowClick={handleRowClick}
          onNew={handleNew}
          onBatchArchive={handleBatchArchive}
          onBatchDelete={handleBatchDelete}
          renderCell={renderCell}
          t={t}
          layoutColumns={layoutColumns}
        />
      )}

      <FormDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setChildrenData({}); setRelationsData({});
          setChildrenMeta({});
        }}
        title={drawerTitle}
        width={drawerWidth}
        footer={renderFooter()}
      >
        <div className="space-y-6">
          <RenderProvider
            mode={drawerMode}
            fields={fields}
            entities={renderEntities}
            data={renderData}
            onChange={(col, val) => setFormData((prev) => ({ ...prev, [col]: val }))}
            errors={formErrors}
            t={t}
            services={{
              queryFn: queryForRelationPicker,
              systemQueryFn,
              uploadFn: fileUploadFn,
              fileData: formData,
              relationMeta,
            }}
            childrenData={childrenData}
            onChildrenChange={(entityCode, rows) =>
              setChildrenData((prev) => ({ ...prev, [entityCode]: rows }))
            }
          >
            <FormRenderer layout={formLayout} className="space-y-6" />
          </RenderProvider>
          {drawerMode === 'view' && systemInfo && (
            <SystemInfoSection systemInfo={systemInfo} t={t} />
          )}

          {/* parent_id TreeSelect for tree models */}
          {isTreeModel && (
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium">{t('tree.parentNode')}</label>
              <TreeSelect
                value={formData.parent_id ?? null}
                onChange={(val) => setFormData((prev) => ({ ...prev, parent_id: val }))}
                nodes={treeNodes.map((n) => ({
                  id: n.id,
                  parentId: n.parent_id,
                  label: String(
                    n[fields.find((f) => !f.isSystem && !f.deletedAt)?.columnName ?? 'id'] ?? n.id,
                  ),
                }))}
                excludeId={formData.id}
                placeholder={t('tree.noParent')}
                disabled={drawerMode === 'view'}
              />
            </div>
          )}
        </div>
      </FormDrawer>

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">{t('common.actionConfirm')}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {confirmDialog.message}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDialog(null)}
                className={btnOutline}
                disabled={confirmSubmitting}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={confirmSubmitting}
                className={
                  confirmDialog.type === 'archiveInstead'
                    ? btnPrimary
                    : confirmDialog.type === 'delete' || confirmDialog.type === 'batchDelete'
                      ? btnDestructive
                      : btnPrimary
                }
              >
                {confirmSubmitting
                  ? t('common.processing')
                  : confirmDialog.type === 'archiveInstead'
                    ? t('dataTab.archiveInstead')
                    : confirmDialog.type === 'delete' || confirmDialog.type === 'batchDelete'
                      ? t('common.confirmDeleteBtn')
                      : t('archive.archive')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
