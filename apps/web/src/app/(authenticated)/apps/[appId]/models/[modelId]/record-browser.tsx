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
  type FieldComponentProps,
  type LayoutColumnConfig,
  type TreeNode,
  type TreeColumn,
} from '@openforge/ui';
import type { Field, FieldType, LayoutConfig, LayoutNode, QueryResponse, BatchResponse, SysView, FilterGroup } from '@openforge/shared';
import { useTabStore } from '@/stores/tab-store';
import { useAuthStore } from '@/stores/auth-store';
import { useActions } from '@/hooks/use-actions';
import { ActionToolbar } from '@/components/workspace/action-toolbar';
import { FilterPanel } from '@/components/workspace/filter-panel';
import { FilterChips } from '@/components/workspace/filter-chips';
import { DataStatusBadge } from '@/components/workspace/data-status-badge';
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
    app: { code: string };
  };
  fields: Field[];
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

export default function RecordBrowser({ model, fields, tabId }: RecordBrowserProps) {
  const t = useTranslations();
  const tErrors = useTranslations('errorCodes');
  const tCommon = useTranslations('common');
  const tFilter = useTranslations('filter');

  const user = useAuthStore((s) => s.user);
  const { openDetailTab, openCreateTab } = useTabStore();
  const { actions } = useActions(model.id);

  /* ---------- Data state ---------- */
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [sort, setSort] = useState<{ field: string; order: 'asc' | 'desc' } | null>(null);
  const [loading, setLoading] = useState(true);

  /* ---------- Filter state (replaces keyword + includeArchived) ---------- */
  const [filter, setFilter] = useState<FilterGroup>({ op: 'and', conditions: [] });
  const [filterOpen, setFilterOpen] = useState(false);

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
    type: 'delete' | 'batchDelete' | 'batchArchive' | 'batchUnarchive' | 'archiveInstead';
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
      const hasConditions = hasFilterConditions(filter);
      const { data: resp } = await apiClient.post<QueryResponse>(
        `/apps/${model.app.code}/models/${model.code}/data/query`,
        {
          filter: hasConditions ? filter : undefined,
          page,
          pageSize,
          sort: sortArr,
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
  }, [model.app.code, model.code, filter, page, pageSize, sort, showToast, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ------------------------------------------------------------------ */
  /*  Tree data loading                                                  */
  /* ------------------------------------------------------------------ */

  const loadTreeChildren = useCallback(async (parentId: string | null) => {
    setTreeLoading(true);
    try {
      const hasConditions = hasFilterConditions(filter);
      const res = await apiClient.post(
        `/apps/${model.app.code}/models/${model.code}/data/query`,
        {
          treeMode: true,
          parentId,
          filter: hasConditions ? filter : undefined,
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

  /** Determine the first user-visible field's column name (for tab title) */
  const firstFieldColumnName = useMemo(() => {
    const firstField = fields.find((f) => !f.isSystem && !f.deletedAt);
    return firstField?.columnName ?? 'id';
  }, [fields]);

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
      if (tabId) {
        openDetailTab({
          appCode: model.app.code,
          modelCode: model.code,
          modelName: model.name,
          recordId: record.id,
          title: record[firstFieldColumnName] || record.id,
        });
      }
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
      const ids = records.map((r) => r.id);

      switch (actionCode) {
        case 'create':
          handleCreate();
          break;
        case 'edit':
          if (records.length > 0) handleOpenRecord(records[0]);
          break;
        case 'delete':
          if (ids.length === 1) {
            setConfirmDialog({
              type: 'delete',
              message: t('common.confirmDelete'),
              ids,
            });
          } else if (ids.length > 1) {
            setConfirmDialog({
              type: 'batchDelete',
              message: t('dataTab.confirmBatchDelete', { count: ids.length }),
              ids,
            });
          }
          break;
        case 'archive':
          if (ids.length > 0) {
            setConfirmDialog({
              type: 'batchArchive',
              message: t('dataTab.confirmBatchArchive', { count: ids.length }),
              ids,
            });
          }
          break;
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
        case 'reject':
        case 'withdraw':
        case 'unapprove':
        case 'revise':
          handleStatusChange(ids, actionCode);
          break;
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
    setFilter(newFilter);
  }, []);

  const handleFilterApply = useCallback(() => {
    setFilterOpen(false);
    setPage(1);
  }, []);

  const handleFilterReset = useCallback(() => {
    setFilterOpen(false);
    setPage(1);
  }, []);

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
    [cellComponents, t],
  );

  /* ------------------------------------------------------------------ */
  /*  Extra columns for DataTable (data_status badge)                    */
  /* ------------------------------------------------------------------ */

  const extraColumns = useMemo(() => {
    if (!model.enableDataStatus) return undefined;
    return [
      {
        id: '_data_status',
        size: 100,
        header: () => <span className="text-xs font-medium">{t('filter.dataStatus')}</span>,
        cell: ({ row }: any) => {
          const status = row.original.data_status;
          if (!status) return <span className="text-muted-foreground">&mdash;</span>;
          return <DataStatusBadge status={status} />;
        },
      },
    ];
  }, [model.enableDataStatus, t]);

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

      {/* Action Toolbar + Filter trigger */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <ActionToolbar
            actions={actions}
            selectedRecords={selectedRecords}
            enableDataStatus={!!model.enableDataStatus}
            position="list"
            currentUserId={user?.id}
            onAction={handleAction}
            onRefresh={fetchData}
          />
        </div>

        {/* Filter trigger + chips row */}
        <div className="flex items-center gap-2">
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger
              className={`inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md border transition-colors ${
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
                value={filter}
                onChange={handleFilterChange}
                onApply={handleFilterApply}
                onReset={handleFilterReset}
              />
            </PopoverContent>
          </Popover>

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

        {/* Filter chips */}
        <FilterChips
          fields={fields}
          value={filter}
          onChange={(newFilter) => {
            setFilter(newFilter);
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
            data={data}
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
            onNew={handleCreate}
            onBatchArchive={() => {}}
            onBatchDelete={() => {}}
            renderCell={renderCell}
            t={t}
            layoutColumns={layoutColumns}
            hideToolbar
            onSelectionChange={handleSelectionChange}
            extraColumns={extraColumns}
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
                        : t('archive.unarchive')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
