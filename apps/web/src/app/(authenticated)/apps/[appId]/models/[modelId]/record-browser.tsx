'use client';

import { useState, useCallback, useEffect, useRef, useMemo, type ComponentType } from 'react';
import { Filter } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import {
  DataTable,
  getFieldComponent,
  TreeView,
  type ColumnDef,
  type FieldComponentProps,
  type LayoutColumnConfig,
  type TreeNode,
  type TreeColumn,
} from '@openforge/ui';
import type { Field, FieldType, LayoutConfig, LayoutNode, QueryResponse, BatchResponse, SysView, FilterGroup, SortItem } from '@openforge/shared';
import { useTabStore } from '@/stores/tab-store';
import { useAuthStore } from '@/stores/auth-store';
import { useActions } from '@/hooks/use-actions';
import { ActionToolbar } from '@/components/workspace/action-toolbar';
import { FilterPanel } from '@/components/workspace/filter-panel';
import { FilterChips } from '@/components/workspace/filter-chips';
import { sanitizeFilter, type AvailableFields } from '@/lib/filter-sanitize';
import { DataStatusBadge } from '@/components/workspace/data-status-badge';
import { useUserListConfig } from '@/hooks/use-user-list-config';
import { ColumnSettings } from '@/components/workspace/column-settings';
import type { FilterPreset } from '@/components/workspace/filter-presets';
import { deriveOneToOneFields, deriveDetailEntity, hasDetailExpansion } from '@/lib/column-config';
import { parseEntityField } from '@/lib/filter-entity-field';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/* ------------------------------------------------------------------ */
/*  Button Style Constants                                             */
/* ------------------------------------------------------------------ */

const btnPrimary =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none';
const btnOutline =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none';
const btnDestructive =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3 py-2 bg-destructive text-white shadow-sm hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none';

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
    enableDataStatus?: boolean;
    defaultSort?: SortItem[] | null;
    app: { code: string };
  };
  fields: Field[];
  entities?: Array<{ id: string; code: string; name: string; entityType: string; fields?: Field[] }>;
  tabId?: string;
}

/* ------------------------------------------------------------------ */
/*  Component cache for renderCell                                     */
/* ------------------------------------------------------------------ */

const cellComponentCache = new Map<string, ComponentType<FieldComponentProps>>();

/* ------------------------------------------------------------------ */
/*  Helper: check if filter has any real conditions                     */
/* ------------------------------------------------------------------ */

function hasFilterConditions(group: FilterGroup): boolean {
  for (const node of group.conditions) {
    if ('conditions' in node) {
      if (hasFilterConditions(node)) return true;
    } else {
      if (node.field) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  RecordBrowser Component                                            */
/* ------------------------------------------------------------------ */

export default function RecordBrowser({ model, fields: allFields, entities, tabId }: RecordBrowserProps) {
  const t = useTranslations();
  const tErrors = useTranslations('errorCodes');
  const tCommon = useTranslations('common');
  const tFilter = useTranslations('filter');

  // Main record fields only — exclude entity/sub-table fields (those belong to entities[])
  const fields = useMemo(
    () => allFields.filter((f) => !f.entityId),
    [allFields],
  );

  const user = useAuthStore((s) => s.user);
  const { openDetailTab, openCreateTab } = useTabStore();
  const { actions } = useActions(model.id);
  const { config: userConfig, save: saveUserConfig } = useUserListConfig(model.app.code, model.code);

  /* ---------- Data state ---------- */
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(userConfig.pageSize ?? 20);
  const [sort, setSort] = useState<{ field: string; order: 'asc' | 'desc' } | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync pageSize from user config when it loads
  useEffect(() => {
    if (userConfig.pageSize) setPageSize(userConfig.pageSize);
  }, [userConfig.pageSize]);

  /* ---------- Filter state ---------- */
  const [filter, setFilter] = useState<FilterGroup>({ op: 'and', conditions: [] });
  const [pendingFilter, setPendingFilter] = useState<FilterGroup>({ op: 'and', conditions: [] });
  const [filterOpen, setFilterOpen] = useState(false);

  // Sync pendingFilter from committed filter when popover opens
  useEffect(() => {
    if (filterOpen) setPendingFilter(filter);
  }, [filterOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- (Data Status Tab removed — use filter panel instead) ---------- */

  /* ---------- Active preset tracking ---------- */
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const activePreset = useMemo(
    () => (userConfig.filterPresets ?? []).find((p) => p.id === activePresetId) ?? null,
    [userConfig.filterPresets, activePresetId],
  );

  /* ---------- Entity groups derived from userConfig (for FilterPanel/Chips and sanitize) ---------- */

  // Visible 1:1 entity groups
  const oneToOneGroups = useMemo(() => {
    const cols = userConfig.columns ?? [];
    if (!entities || cols.length === 0) return [];
    const derived = deriveOneToOneFields(cols);
    const result: { entityCode: string; entityName: string; fields: Field[] }[] = [];
    for (const [entityCode, fieldCols] of Object.entries(derived)) {
      const ent = entities.find((e) => e.code === entityCode && e.entityType === 'one_to_one');
      if (!ent || !ent.fields) continue;
      result.push({
        entityCode,
        entityName: ent.name,
        fields: ent.fields.filter((f) => fieldCols.includes(f.columnName) && !f.isSystem && !f.deletedAt),
      });
    }
    return result;
  }, [userConfig.columns, entities]);

  // Visible 1:N detail entity
  const detailGroup = useMemo(() => {
    const cols = userConfig.columns ?? [];
    const d = deriveDetailEntity(cols);
    if (!entities || !d) return null;
    const ent = entities.find((e) => e.code === d.entityCode && e.entityType === 'one_to_many');
    if (!ent || !ent.fields || d.fields.length === 0) return null;
    return {
      entityCode: d.entityCode,
      entityName: ent.name,
      fields: ent.fields.filter((f) => d.fields.includes(f.columnName) && !f.isSystem && !f.deletedAt),
    };
  }, [userConfig.columns, entities]);

  // AvailableFields registry for sanitize
  const availableFields: AvailableFields = useMemo(() => {
    const main = new Set<string>(fields.map((f) => f.columnName));
    // All backend-recognized system columns — must match SYSTEM_COLUMNS in query-builder.service.ts
    main.add('id');
    main.add('org_id');
    main.add('is_archived');
    main.add('data_status');
    main.add('submitted_by');
    main.add('submitted_at');
    main.add('approved_by');
    main.add('approved_at');
    main.add('version');
    main.add('created_by');
    main.add('updated_by');
    main.add('created_at');
    main.add('updated_at');
    const oneToOne = new Map<string, Set<string>>();
    for (const g of oneToOneGroups) {
      oneToOne.set(g.entityCode, new Set(g.fields.map((f) => f.columnName)));
    }
    return {
      main,
      oneToOne,
      detail: detailGroup
        ? { code: detailGroup.entityCode, fields: new Set(detailGroup.fields.map((f) => f.columnName)) }
        : undefined,
    };
  }, [fields, oneToOneGroups, detailGroup]);

  // Sanitize filter + pendingFilter whenever available columns change
  useEffect(() => {
    const { filter: cleaned, droppedCount: d1 } = sanitizeFilter(filter, availableFields);
    if (d1 > 0) setFilter(cleaned);
    const { filter: cleanedPending, droppedCount: d2 } = sanitizeFilter(pendingFilter, availableFields);
    if (d2 > 0) setPendingFilter(cleanedPending);
    const total = d1 + d2;
    if (total > 0) {
      showToast(tFilter('droppedConditions', { count: total }), 'success');
    }
    // Intentionally only react to availableFields changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableFields]);

  /* ---------- Selection state ---------- */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRecords, setSelectedRecords] = useState<Record<string, any>[]>([]);

  /* ---------- Tree state ---------- */
  const isTreeModel = !!model.isTree;
  const [viewMode, setViewMode] = useState<'table' | 'tree'>(isTreeModel ? 'tree' : 'table');
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [treeLoading, setTreeLoading] = useState(false);

  /* ---------- Confirm dialog ---------- */
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'delete' | 'batchDelete' | 'batchArchive' | 'batchUnarchive' | 'archiveInstead' | 'submit' | 'approve' | 'withdraw' | 'unapprove';
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

  /** Derive layout column config: user config > designer view > auto-generated */
  const designerColumns = useMemo<LayoutColumnConfig[] | undefined>(() => {
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

  const layoutColumns = useMemo<LayoutColumnConfig[] | undefined>(() => {
    const unified = userConfig.columns ?? [];
    if (unified.length === 0) return designerColumns;

    // Only main-field entries (bare columnName) contribute to LayoutColumnConfig.
    // 1:1 / detail entries render via separate synthetic columns.
    const designerByFieldId = new Map((designerColumns ?? []).map((c) => [c.fieldId, c]));
    const mainColumns: LayoutColumnConfig[] = [];
    for (const key of unified) {
      const parsed = parseEntityField(key);
      if (parsed.kind !== 'main') continue;
      const field = fields.find((f) => f.columnName === parsed.columnName);
      if (!field) continue;
      const designerEntry = designerByFieldId.get(field.id);
      mainColumns.push({
        fieldId: field.id,
        label: designerEntry?.label,
        width: designerEntry?.width,
        align: designerEntry?.align,
        fixed: designerEntry?.fixed,
      });
    }
    return mainColumns;
  }, [userConfig.columns, designerColumns, fields]);

  /* ------------------------------------------------------------------ */
  /*  API calls                                                          */
  /* ------------------------------------------------------------------ */

  const isFirstLoad = useRef(true);

  const effectiveFilter = filter;

  const fetchData = useCallback(async () => {
    if (isFirstLoad.current) {
      setLoading(true);
    }
    try {
      const sortArr = sort ? [{ field: sort.field, order: sort.order }] : undefined;
      const hasConditions = hasFilterConditions(effectiveFilter);
      const cols = userConfig.columns ?? [];
      const derivedOneToOne = deriveOneToOneFields(cols);
      const derivedDetail = deriveDetailEntity(cols);

      const oneToOnePayload = Object.keys(derivedOneToOne).length > 0 ? derivedOneToOne : undefined;
      const detailPayload = derivedDetail ?? undefined;

      const { data: resp } = await apiClient.post<QueryResponse>(
        `/apps/${model.app.code}/models/${model.code}/data/query`,
        {
          filter: hasConditions ? effectiveFilter : undefined,
          page,
          pageSize,
          sort: sortArr,
          detailEntity: detailPayload,
          oneToOneFields: oneToOnePayload,
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
  }, [model.app.code, model.code, effectiveFilter, page, pageSize, sort, userConfig.columns, showToast, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* Status counts removed — use filter panel for data_status filtering */

  /* ------------------------------------------------------------------ */
  /*  Tree data loading                                                  */
  /* ------------------------------------------------------------------ */

  const loadTreeChildren = useCallback(async (parentId: string | null) => {
    setTreeLoading(true);
    try {
      const hasConditions = hasFilterConditions(effectiveFilter);
      const res = await apiClient.post(
        `/apps/${model.app.code}/models/${model.code}/data/query`,
        {
          treeMode: true,
          parentId,
          filter: hasConditions ? effectiveFilter : undefined,
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
  }, [model.app.code, model.code, filter]);

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

  /** Determine the first user-visible field's column name (for tab title + link column).
   *  Matches DataTable's visibleFields ordering: layoutColumns order → AUTO_NUMBER first → sortOrder. */
  const firstFieldColumnName = useMemo(() => {
    if (layoutColumns && layoutColumns.length > 0) {
      const fieldMap = new Map(fields.map((f) => [f.id, f]));
      const first = layoutColumns
        .map((lc) => fieldMap.get(lc.fieldId))
        .find((f): f is Field => f != null && !f.isSystem && !f.deletedAt);
      return first?.columnName ?? 'id';
    }
    const sorted = [...fields]
      .filter((f) => !f.isSystem && !f.deletedAt)
      .sort((a, b) => {
        if (a.fieldType === 'AUTO_NUMBER' && b.fieldType !== 'AUTO_NUMBER') return -1;
        if (a.fieldType !== 'AUTO_NUMBER' && b.fieldType === 'AUTO_NUMBER') return 1;
        return a.sortOrder - b.sortOrder;
      });
    return sorted[0]?.columnName ?? 'id';
  }, [fields, layoutColumns]);

  const handleCreate = useCallback(() => {
    if (tabId) {
      openCreateTab({
        appCode: model.app.code,
        modelCode: model.code,
        modelName: model.name,
      });
    }
    // Designer mode without tabs — no-op for now (designer has its own data tab)
  }, [tabId, openCreateTab, model.app.code, model.code, model.name]);

  const handleOpenRecord = useCallback(
    (record: Record<string, any>) => {
      if (!tabId) return;
      // In detail-expand mode, record.id may be a child or sentinel; use master id.
      const recordId = record.__masterId ?? record.id;
      openDetailTab({
        appCode: model.app.code,
        modelCode: model.code,
        modelName: model.name,
        recordId,
        title: record[firstFieldColumnName] || recordId,
      });
    },
    [tabId, openDetailTab, model.app.code, model.code, model.name, firstFieldColumnName],
  );

  const handleRowClick = useCallback(
    (_record: Record<string, any>) => {
      // Single click does nothing in the new tab-based model — selection is via checkbox
    },
    [],
  );

  const handleArchive = useCallback(
    async (ids: string[], archived: boolean) => {
      try {
        for (const id of ids) {
          await apiClient.put(
            `/apps/${model.app.code}/models/${model.code}/data/${id}/archive`,
            { archived },
          );
        }
        showToast(
          archived ? t('dataTab.archiveSuccess') : t('dataTab.unarchiveSuccess'),
          'success',
        );
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

  const handleStatusChange = useCallback(
    async (ids: string[], action: string) => {
      try {
        for (const id of ids) {
          await apiClient.put(
            `/apps/${model.app.code}/models/${model.code}/data/${id}/status`,
            { action },
          );
        }
        showToast(t('common.operationSuccess'), 'success');
        fetchData();
      } catch (err: any) {
        showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
      }
    },
    [model.app.code, model.code, showToast, t, tErrors, tCommon, fetchData],
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
      } else if (confirmDialog.type === 'batchUnarchive') {
        for (const id of confirmDialog.ids) {
          await apiClient.put(
            `/apps/${model.app.code}/models/${model.code}/data/${id}/archive`,
            { archived: false },
          );
        }
        showToast(t('dataTab.unarchiveSuccess'), 'success');
        fetchData();
      } else if (['submit', 'approve', 'withdraw', 'unapprove'].includes(confirmDialog.type)) {
        await handleStatusChange(confirmDialog.ids, confirmDialog.type);
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
  /*  ActionToolbar onAction handler                                     */
  /* ------------------------------------------------------------------ */

  const handleAction = useCallback(
    (actionCode: string, records: Record<string, any>[]) => {
      // In detail-expand mode, multiple flat rows share the same master.
      // Dedupe master-level actions by __masterId so we operate on unique master records.
      const dedupedMasters = new Map<string, Record<string, any>>();
      for (const r of records) {
        const mid = r.__masterId ?? r.id;
        if (!dedupedMasters.has(mid)) {
          dedupedMasters.set(mid, {
            ...(r.__masterRecord ?? r),
            id: mid,
            __masterId: mid,
          });
        }
      }
      records = [...dedupedMasters.values()];
      const ids = records.map((r) => r.id);

      switch (actionCode) {
        case 'create':
          handleCreate();
          break;
        case 'edit':
          if (records.length > 0) handleOpenRecord(records[0]);
          break;
        case 'delete': {
          // Filter to only draft/reaudit records (submitted/approved cannot be deleted)
          const deletable = records.filter((r) => {
            const s = r['data_status'];
            return !s || s === 'draft' || s === 'reaudit';
          });
          const delIds = deletable.map((r) => r.id);
          if (delIds.length === 0) { showToast(t('dataTab.noEligibleRecords'), 'error'); break; }
          const skippedDel = ids.length - delIds.length;
          const delMsg = delIds.length === 1
            ? t('common.confirmDelete')
            : t('dataTab.confirmBatchDelete', { count: delIds.length });
          setConfirmDialog({
            type: delIds.length === 1 ? 'delete' : 'batchDelete',
            message: skippedDel > 0
              ? `${delMsg}\n${t('dataTab.statusSkipped', { count: skippedDel })}`
              : delMsg,
            ids: delIds,
          });
          break;
        }
        case 'archive': {
          const archivable = records.filter((r) => {
            const s = r['data_status'];
            return !s || s === 'draft' || s === 'reaudit';
          });
          const archIds = archivable.map((r) => r.id);
          if (archIds.length === 0) { showToast(t('dataTab.noEligibleRecords'), 'error'); break; }
          const skippedArch = ids.length - archIds.length;
          const archMsg = t('dataTab.confirmBatchArchive', { count: archIds.length });
          setConfirmDialog({
            type: 'batchArchive',
            message: skippedArch > 0
              ? `${archMsg}\n${t('dataTab.statusSkipped', { count: skippedArch })}`
              : archMsg,
            ids: archIds,
          });
          break;
        }
        case 'unarchive':
          if (ids.length > 0) {
            setConfirmDialog({
              type: 'batchUnarchive',
              message: t('dataTab.confirmBatchUnarchive', { count: ids.length }),
              ids,
            });
          }
          break;
        case 'submit':
        case 'approve':
        case 'withdraw':
        case 'unapprove': {
          // Filter to only records whose status allows this action
          const statusMap: Record<string, string[]> = {
            draft: ['submit'], reaudit: ['submit'],
            submitted: ['withdraw', 'approve'], approved: ['unapprove'],
          };
          let eligible = records.filter((r) => {
            const s = r['data_status'] as string;
            return s && statusMap[s]?.includes(actionCode);
          });
          // withdraw: only submitter's own (admin can withdraw anyone's)
          if (actionCode === 'withdraw' && !user?.isAdmin) {
            const userId = user?.id;
            eligible = eligible.filter((r) => r['submitted_by'] === userId);
          }
          const eligibleIds = eligible.map((r) => r.id);
          if (eligibleIds.length === 0) {
            showToast(t('dataTab.noEligibleRecords'), 'error');
            break;
          }
          const skipped = ids.length - eligibleIds.length;
          const confirmKey = `dataTab.confirmBatch${actionCode.charAt(0).toUpperCase()}${actionCode.slice(1)}`;
          const actionMsg = t(confirmKey, { count: eligibleIds.length });
          setConfirmDialog({
            type: actionCode as any,
            message: skipped > 0
              ? `${actionMsg}\n${t('dataTab.statusSkipped', { count: skipped })}`
              : actionMsg,
            ids: eligibleIds,
          });
          break;
        }
        default:
          // Custom actions — future extension
          break;
      }
    },
    [handleCreate, handleOpenRecord, handleStatusChange, t],
  );

  /* ------------------------------------------------------------------ */
  /*  Filter handlers                                                    */
  /* ------------------------------------------------------------------ */

  const handleFilterChange = useCallback((newFilter: FilterGroup) => {
    setPendingFilter(newFilter);
  }, []);

  const handleFilterApply = useCallback(() => {
    setFilter(pendingFilter);
    setActivePresetId(null); // manual filter edit clears preset selection
    setFilterOpen(false);
    setPage(1);
  }, [pendingFilter]);

  const handleFilterReset = useCallback(() => {
    const empty: FilterGroup = { op: 'and', conditions: [] };
    setPendingFilter(empty);
    setFilter(empty);
    setActivePresetId(null);
    setFilterOpen(false);
    setPage(1);
  }, []);

  const handlePresetLoad = useCallback((presetId: string, presetFilter: FilterGroup) => {
    const { filter: cleaned, droppedCount } = sanitizeFilter(presetFilter, availableFields);
    setFilter(cleaned);
    setActivePresetId(presetId);
    setPage(1);
    if (droppedCount > 0) {
      showToast(tFilter('droppedConditions', { count: droppedCount }), 'success');
    }
  }, [availableFields, showToast, tFilter]);

  const handlePresetSave = useCallback((preset: FilterPreset) => {
    const existing = userConfig.filterPresets ?? [];
    saveUserConfig({ filterPresets: [...existing, preset] });
  }, [userConfig.filterPresets, saveUserConfig]);

  const handlePresetDelete = useCallback((presetId: string) => {
    const existing = userConfig.filterPresets ?? [];
    saveUserConfig({ filterPresets: existing.filter((p) => p.id !== presetId) });
    if (activePresetId === presetId) setActivePresetId(null);
  }, [userConfig.filterPresets, saveUserConfig, activePresetId]);

  const handlePresetUpdate = useCallback((updated: FilterPreset) => {
    const existing = userConfig.filterPresets ?? [];
    saveUserConfig({
      filterPresets: existing.map((p) => (p.id === updated.id ? updated : p)),
    });
    // Also apply the updated filter and keep preset active (don't clear activePresetId)
    setFilter(updated.filter);
    setFilterOpen(false);
    setPage(1);
  }, [userConfig.filterPresets, saveUserConfig]);

  const handleSavePresetFromPanel = useCallback((preset: FilterPreset) => {
    handlePresetSave(preset);
  }, [handlePresetSave]);

  const handleColumnsApply = useCallback(
    (columns: string[]) => {
      saveUserConfig({ columns: columns.length > 0 ? columns : undefined });
    },
    [saveUserConfig],
  );

  const handleColumnReorder = useCallback(
    (fromKey: string, toKey: string) => {
      let current = userConfig.columns;
      if (!current || current.length === 0) {
        // Initialize from the currently-rendered designer columns (as columnName strings)
        current = (designerColumns ?? [])
          .map((c) => fields.find((f) => f.id === c.fieldId)?.columnName)
          .filter((x): x is string => !!x);
      }
      const fromIdx = current.indexOf(fromKey);
      const toIdx = current.indexOf(toKey);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
      const next = [...current];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      saveUserConfig({ columns: next });
    },
    [userConfig.columns, designerColumns, fields, saveUserConfig],
  );

  const handleColumnsReset = useCallback(() => {
    saveUserConfig({ columns: undefined });
  }, [saveUserConfig]);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
    saveUserConfig({ pageSize: size });
  }, [saveUserConfig]);

  const handleSortChange = useCallback((field: string, order: 'asc' | 'desc') => {
    setSort({ field, order });
    setPage(1);
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Selection handler                                                  */
  /* ------------------------------------------------------------------ */

  const handleSelectionChange = useCallback((ids: string[], records: Record<string, any>[]) => {
    setSelectedIds(ids);
    setSelectedRecords(records);
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

      // For reference fields, show resolved display value
      if (field.fieldType === 'REFERENCE' || field.fieldType === 'USER' || field.fieldType === 'ORGANIZATION') {
        const display = record?.[`${field.columnName}__display`];
        return <span className="text-sm truncate">{display ?? String(value)}</span>;
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
    [cellComponents, t],
  );

  /* ------------------------------------------------------------------ */
  /*  Master-detail expansion — flatten rows when detailEntity is active */
  /* ------------------------------------------------------------------ */

  const isDetailMode = hasDetailExpansion(userConfig.columns ?? []);

  const displayData = useMemo(() => {
    if (!isDetailMode || !detailGroup) return data;
    const out: Record<string, any>[] = [];
    data.forEach((master, mIdx) => {
      const detail = master.__detail;
      const childRows: any[] = detail && detail.entityCode === detailGroup.entityCode ? (detail.rows ?? []) : [];
      if (childRows.length === 0) {
        out.push({
          ...master,
          id: `${master.id}:__empty`,
          __masterId: master.id,
          __masterRecord: master,
          __masterIndex: mIdx,
          __detailRow: null,
          __groupId: master.id,
        });
      } else {
        for (const child of childRows) {
          out.push({
            ...master,
            id: child.id,
            __masterId: master.id,
            __masterRecord: master,
            __masterIndex: mIdx,
            __detailRow: child,
            __groupId: master.id,
          });
        }
      }
    });
    return out;
  }, [data, isDetailMode, detailGroup]);

  /* ------------------------------------------------------------------ */
  /*  Extra / trailing columns (data_status, 1:1 fields, detail fields)  */
  /* ------------------------------------------------------------------ */

  const extraColumns = useMemo<ColumnDef<Record<string, any>>[] | undefined>(() => {
    const cols: ColumnDef<Record<string, any>>[] = [];

    if (model.enableDataStatus) {
      cols.push({
        id: '_data_status',
        size: 100,
        header: () => <span className="text-xs font-medium">{t('filter.dataStatus')}</span>,
        cell: ({ row }: any) => {
          const status = row.original.data_status;
          if (!status) return <span className="text-muted-foreground">&mdash;</span>;
          return <DataStatusBadge status={status} />;
        },
      });
    }

    // 1:1 entity field columns — walk unified columns array in order
    const unified = userConfig.columns ?? [];
    for (const key of unified) {
      const parsed = parseEntityField(key);
      if (parsed.kind === 'oneToOne' && parsed.entityCode) {
        const entity = entities?.find((e) => e.code === parsed.entityCode && e.entityType === 'one_to_one');
        const field = entity?.fields?.find((f) => f.columnName === parsed.columnName);
        if (!entity || !field) continue;
        cols.push({
          id: key,
          size: 150,
          header: () => (
            <span className="text-xs font-medium truncate" title={`${entity.name}.${field.name}`}>
              {`${entity.name}.${field.name}`}
            </span>
          ),
          cell: ({ row }: any) => {
            const subRecord = row.original.__oneToOne?.[parsed.entityCode!];
            if (!subRecord) return <span className="text-muted-foreground">&mdash;</span>;
            const val = subRecord[parsed.columnName];
            if (val === null || val === undefined) return <span className="text-muted-foreground">&mdash;</span>;
            return renderCell(field, val, subRecord);
          },
        });
      }
    }

    return cols.length > 0 ? cols : undefined;
  }, [model.enableDataStatus, userConfig.columns, entities, t, renderCell]);

  const trailingColumns = useMemo<ColumnDef<Record<string, any>>[] | undefined>(() => {
    if (!isDetailMode || !detailGroup) return undefined;
    const cols: ColumnDef<Record<string, any>>[] = [];
    const unified = userConfig.columns ?? [];
    for (const key of unified) {
      const parsed = parseEntityField(key);
      if (parsed.kind !== 'detail') continue;
      const field = detailGroup.fields.find((f) => f.columnName === parsed.columnName);
      if (!field) continue;
      cols.push({
        id: key,
        size: 150,
        header: () => (
          <span className="text-xs font-medium truncate" title={`${detailGroup.entityName}.${field.name}`}>
            {`${detailGroup.entityName}.${field.name}`}
          </span>
        ),
        cell: ({ row }: any) => {
          const child = row.original.__detailRow;
          if (!child) return <span className="text-muted-foreground">&mdash;</span>;
          const val = child[parsed.columnName];
          if (val === null || val === undefined) return <span className="text-muted-foreground">&mdash;</span>;
          return renderCell(field, val, child);
        },
      });
    }
    return cols.length > 0 ? cols : undefined;
  }, [isDetailMode, detailGroup, userConfig.columns, renderCell]);

  // IDs of columns that should merge (rowSpan) within a master group.
  const groupedColumnIds = useMemo<string[] | undefined>(() => {
    if (!isDetailMode) return undefined;
    const ids: string[] = ['_row_number'];
    if (model.enableDataStatus) ids.push('_data_status');
    // Master field columns (identified by field.columnName — matches DataTable col ids)
    for (const f of fields) {
      if (!f.isSystem && !f.deletedAt) ids.push(f.columnName);
    }
    // 1:1 synthetic columns use the encoded key as column id
    for (const key of userConfig.columns ?? []) {
      const parsed = parseEntityField(key);
      if (parsed.kind === 'oneToOne') ids.push(key);
    }
    return ids;
  }, [isDetailMode, model.enableDataStatus, fields, userConfig.columns]);

  const getRowGroupKey = useMemo(
    () => (isDetailMode ? (row: Record<string, any>) => row.__groupId ?? null : undefined),
    [isDetailMode],
  );

  const fixedColumnKeys = useMemo(() => {
    const keys = ['_select', '_row_number'];
    if (model.enableDataStatus) keys.push('_data_status');
    return keys;
  }, [model.enableDataStatus]);

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  const hasActiveFilters = hasFilterConditions(filter);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
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

      {/* Row 1: Filter button + ActionToolbar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {/* Filter trigger — always first */}
          <Popover
            open={filterOpen}
            onOpenChange={(newOpen, details) => {
              if (!newOpen && details && 'reason' in details) {
                const reason = (details as any).reason;
                // Ignore focus-out: when a reference is picked the input is
                // swapped for a display span, removing the focused element from
                // the DOM and triggering a spurious focus-out on the popover.
                // Dismissal is fully covered by Escape, outside-press, and the
                // explicit Apply/Cancel buttons.
                if (reason === 'focus-out') {
                  (details as any).cancel?.();
                  return;
                }
                // Prevent close when user interacts with RelationPicker
                // dropdown/dialog which renders to document.body (Base UI sees
                // those clicks as "outside").
                if (reason === 'outside-press') {
                  const event = (details as any).event;
                  const target = event?.target as Element | undefined;
                  if (target && typeof target.closest === 'function' && target.closest('[data-rp-portal]')) {
                    (details as any).cancel?.();
                    return;
                  }
                }
              }
              setFilterOpen(newOpen);
            }}
          >
            <PopoverTrigger
              className={`inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md border transition-colors ${
                hasActiveFilters
                  ? 'border-primary/50 bg-primary/5 text-primary hover:bg-primary/10'
                  : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              {tFilter('title')}
              {hasActiveFilters && (
                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] px-1">
                  {filter.conditions.length}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <FilterPanel
                fields={fields}
                enableDataStatus={!!model.enableDataStatus}
                oneToOneGroups={oneToOneGroups}
                detailGroup={detailGroup}
                value={pendingFilter}
                onChange={handleFilterChange}
                onApply={handleFilterApply}
                onReset={handleFilterReset}
                onSavePreset={handleSavePresetFromPanel}
                activePreset={activePreset}
                onUpdatePreset={handlePresetUpdate}
              />
            </PopoverContent>
          </Popover>

          <ActionToolbar
            actions={actions}
            selectedRecords={selectedRecords}
            enableDataStatus={!!model.enableDataStatus}
            position="list"
            currentUserId={user?.id}
            onAction={handleAction}
            onRefresh={fetchData}
          />

          {/* Tree / Table view mode toggle */}
          {isTreeModel && (
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
          )}

          {/* Selection info */}
          {selectedIds.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {t('workspace.selectedCount', { count: selectedIds.length })}
            </span>
          )}
        </div>

        {/* Row 2: Saved filter presets (inline) */}
        <div className="flex items-center gap-1 flex-wrap">
          {/* Saved filter presets as inline tabs */}
          {(userConfig.filterPresets ?? []).map((preset) => {
            const isActive = activePresetId === preset.id;
            return (
              <div key={preset.id} className="relative group">
                <button
                  type="button"
                  onClick={() => handlePresetLoad(preset.id, preset.filter)}
                  className={`inline-flex items-center h-7 px-3 text-xs rounded-md border transition-colors ${
                    isActive
                      ? 'border-primary bg-primary/5 text-primary font-medium'
                      : 'border-dashed border-input text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetDelete(preset.id)}
                  title={t('workspace.filterPresets.deleteTooltip')}
                  aria-label={t('workspace.filterPresets.deleteTooltip')}
                  className="hidden group-hover:flex absolute -top-1.5 -right-1.5 items-center justify-center w-4 h-4 rounded-full bg-background border border-input shadow-sm text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
              </div>
            );
          })}
        </div>

        {/* Filter chips */}
        <FilterChips
          fields={fields}
          oneToOneGroups={oneToOneGroups}
          detailGroup={detailGroup}
          value={filter}
          onChange={(newFilter) => {
            setFilter(newFilter);
            setActivePresetId(null); // chip removal clears preset selection
            setPage(1);
          }}
        />
      </div>

      {/* Table / Tree */}
      <div className="flex-1 min-h-0">
        {isTreeModel && viewMode === 'tree' ? (
          <TreeView
            nodes={treeNodes}
            columns={treeColumns}
            loading={treeLoading}
            expandedIds={expandedIds}
            onExpand={handleTreeExpand}
            onCollapse={handleTreeCollapse}
            onRowClick={(node) => handleOpenRecord(node as any)}
            t={t}
          />
        ) : (
          <DataTable
            fields={fields}
            data={displayData}
            total={total}
            page={page}
            pageSize={pageSize}
            loading={loading}
            keyword=""
            includeArchived={false}
            onKeywordChange={() => {}}
            onPageChange={setPage}
            onArchiveToggle={() => {}}
            onSortChange={handleSortChange}
            onRowClick={handleRowClick}
            onRowDoubleClick={handleOpenRecord}
            onLinkClick={handleOpenRecord}
            onNew={handleCreate}
            onBatchArchive={() => {}}
            onBatchDelete={() => {}}
            renderCell={renderCell}
            t={t}
            layoutColumns={layoutColumns}
            hideToolbar
            onSelectionChange={handleSelectionChange}
            extraColumns={extraColumns}
            trailingColumns={trailingColumns}
            getRowGroupKey={getRowGroupKey}
            groupedColumnIds={groupedColumnIds}
            onPageSizeChange={handlePageSizeChange}
            onColumnReorder={handleColumnReorder}
            fixedColumnKeys={fixedColumnKeys}
            headerEndSlot={
              <ColumnSettings
                fields={fields}
                columns={userConfig.columns}
                entities={entities}
                onApply={handleColumnsApply}
                onReset={handleColumnsReset}
              />
            }
          />
        )}
      </div>

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
                      : confirmDialog.type === 'batchArchive'
                        ? t('archive.archive')
                        : confirmDialog.type === 'batchUnarchive'
                          ? t('archive.unarchive')
                          : tCommon('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
