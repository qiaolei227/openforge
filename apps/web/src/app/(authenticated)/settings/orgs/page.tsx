'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, Ban, CheckCircle, Trash2 } from 'lucide-react';
import { TreeSelect } from '@openforge/ui';

interface Org {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'disabled';
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StatusCounts {
  all: number;
  active: number;
  disabled: number;
}

interface OrgListResponse {
  data: Org[];
  total: number;
  page: number;
  pageSize: number;
  counts: StatusCounts;
}

interface OrgTreeNode extends Org {
  children: OrgTreeNode[];
}

type DialogMode = 'create' | 'edit' | null;

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';
const btnPrimary =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none';
const btnOutline =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none';
const btnDestructive =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3 py-2 bg-destructive text-white shadow-sm hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none';
const btnGhost =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 py-1 hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none';

export default function OrgsPage() {
  const tOrg = useTranslations('org');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errorCodes');

  // --- view mode ---
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');

  // --- list state ---
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<StatusCounts>({ all: 0, active: 0, disabled: 0 });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);

  // --- tree state ---
  const [treeData, setTreeData] = useState<OrgTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);

  // --- dialog state ---
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingOrg, setEditingOrg] = useState<Org | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // --- confirm dialog state ---
  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete' | 'toggle-status';
    org: Org;
  } | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  // --- toast ---
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- debounce keyword ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  // --- fetch list ---
  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedKeyword) params.set('keyword', debouncedKeyword);
      if (statusFilter) params.set('status', statusFilter);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const { data } = await apiClient.get<OrgListResponse>(`/orgs?${params.toString()}`);
      setOrgs(data.data);
      setTotal(data.total);
      setCounts(data.counts);
    } catch {
      showToast(tOrg('fetchFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedKeyword, statusFilter, page, pageSize, showToast, tOrg]);

  useEffect(() => {
    if (viewMode === 'list') {
      fetchOrgs();
    }
  }, [viewMode, fetchOrgs]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // --- tree loading (full tree, always expanded) ---
  const fetchTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const { data } = await apiClient.get<OrgTreeNode[]>('/orgs/tree');
      setTreeData(data ?? []);
    } catch {
      // silently fail
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'tree') fetchTree();
  }, [viewMode, fetchTree]);

  // Flatten tree → rows with depth for rendering
  const flatTreeRows = useMemo(() => {
    const rows: Array<{ org: Org; depth: number; isLast: boolean[] }> = [];
    function walk(nodes: OrgTreeNode[], depth: number, isLast: boolean[]) {
      nodes.forEach((node, idx) => {
        const last = idx === nodes.length - 1;
        const trail = [...isLast, last];
        rows.push({ org: node, depth, isLast: trail });
        if (node.children?.length) walk(node.children, depth + 1, trail);
      });
    }
    walk(treeData, 0, []);
    return rows;
  }, [treeData]);

  // Flat list for TreeSelect in the form dialog
  const treeSelectNodes = useMemo(() => {
    const nodes: Array<{ id: string; parentId: string | null; label: string }> = [];
    function walk(list: OrgTreeNode[]) {
      for (const n of list) {
        nodes.push({ id: n.id, parentId: n.parentId, label: n.name });
        if (n.children?.length) walk(n.children);
      }
    }
    walk(treeData);
    return nodes;
  }, [treeData]);

  // --- refresh after CRUD ---
  const refreshData = useCallback(() => {
    if (viewMode === 'tree') {
      fetchTree();
    } else {
      fetchOrgs();
    }
  }, [viewMode, fetchTree, fetchOrgs]);

  // --- create / edit dialog ---
  const openCreate = () => {
    setDialogMode('create');
    setEditingOrg(null);
    setFormName('');
    setFormCode('');
    setFormParentId(null);
    setFormError('');
  };

  const openEdit = (org: Org) => {
    setDialogMode('edit');
    setEditingOrg(org);
    setFormName(org.name);
    setFormCode(org.code);
    setFormParentId(org.parentId);
    setFormError('');
  };

  const closeDialog = () => {
    setDialogMode(null);
    setEditingOrg(null);
    setFormError('');
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSubmitting(true);
    try {
      if (dialogMode === 'create') {
        const { data: created } = await apiClient.post<{
          org: Org;
          autoDistributeModels: Array<{ appCode: string; modelCode: string; modelName: string; pendingCount: number }>;
        }>('/orgs', { name: formName, code: formCode, parentId: formParentId || null });
        showToast(tOrg('createSuccess'), 'success');
        if (created.autoDistributeModels?.length > 0) {
          const totalPending = created.autoDistributeModels.reduce((s, m) => s + m.pendingCount, 0);
          const modelNames = created.autoDistributeModels.map((m) => m.modelName).join('、');
          showToast(tOrg('autoDistributePending', { count: totalPending, models: modelNames }), 'success');
        }
      } else if (dialogMode === 'edit' && editingOrg) {
        await apiClient.put(`/orgs/${editingOrg.id}`, { name: formName, parentId: formParentId || null });
        showToast(tOrg('updateSuccess'), 'success');
      }
      closeDialog();
      refreshData();
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, tErrors, tCommon('operationFailed')));
    } finally {
      setFormSubmitting(false);
    }
  };

  // --- confirm action ---
  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setConfirmSubmitting(true);
    try {
      if (confirmAction.type === 'delete') {
        await apiClient.delete(`/orgs/${confirmAction.org.id}`);
        showToast(tOrg('deleteSuccess'), 'success');
      } else if (confirmAction.type === 'toggle-status') {
        const newStatus = confirmAction.org.status === 'active' ? 'disabled' : 'active';
        await apiClient.put(`/orgs/${confirmAction.org.id}`, { status: newStatus });
        showToast(newStatus === 'active' ? tOrg('enableSuccess') : tOrg('disableSuccess'), 'success');
      }
      setConfirmAction(null);
      refreshData();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
      setConfirmAction(null);
    } finally {
      setConfirmSubmitting(false);
    }
  };

  return (
    <div>
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

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{tOrg('title')}</h1>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center justify-between border-b mb-4">
        <div className="flex items-center gap-6">
          {([
            { key: '', label: tCommon('statusAll'), count: viewMode === 'tree' ? flatTreeRows.length : counts.all },
            { key: 'active', label: tCommon('statusActive'), count: viewMode === 'tree' ? flatTreeRows.filter(r => r.org.status === 'active').length : counts.active },
            { key: 'disabled', label: tCommon('statusDisabled'), count: viewMode === 'tree' ? flatTreeRows.filter(r => r.org.status === 'disabled').length : counts.disabled },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setPage(1); }}
              className={`pb-2 text-sm transition-colors relative ${
                statusFilter === tab.key
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}({tab.count})
              {statusFilter === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
        <button onClick={openCreate} className={`${btnPrimary} mb-2`}>
          + {tOrg('create')}
        </button>
      </div>

      {/* Search Bar + View Toggle */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <input
            className={inputClass}
            placeholder={tOrg('searchPlaceholder')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {(loading || treeLoading) && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
        {/* View mode toggle */}
        <div className="inline-flex rounded-md border">
          <button
            type="button"
            className={`px-3 py-1.5 text-xs rounded-l-md border-r ${viewMode === 'list' ? 'bg-accent font-medium' : 'bg-background hover:bg-muted/50'}`}
            onClick={() => setViewMode('list')}
          >
            {tCommon('listView')}
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-xs rounded-r-md ${viewMode === 'tree' ? 'bg-accent font-medium' : 'bg-background hover:bg-muted/50'}`}
            onClick={() => setViewMode('tree')}
          >
            {tCommon('treeView')}
          </button>
        </div>
      </div>

      {/* Tree View */}
      {viewMode === 'tree' && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-medium">{tOrg('name')}</th>
                <th className="p-3 text-left font-medium">{tOrg('code')}</th>
                <th className="p-3 text-left font-medium">{tCommon('status')}</th>
                <th className="p-3 text-left font-medium w-28">{tCommon('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {treeLoading && flatTreeRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    {tCommon('loading')}
                  </td>
                </tr>
              ) : flatTreeRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    {tCommon('noData')}
                  </td>
                </tr>
              ) : (
                flatTreeRows.map(({ org, depth, isLast }) => (
                  <tr key={org.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">
                      <div className="flex items-center" style={{ paddingLeft: `${depth * 24}px` }}>
                        {/* Tree guide lines */}
                        {depth > 0 && (
                          <span className="inline-flex items-center text-border mr-1.5 select-none shrink-0">
                            {isLast[isLast.length - 1] ? '└' : '├'}
                          </span>
                        )}
                        <span className="truncate">{org.name}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{org.code}</code>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          org.status === 'active'
                            ? 'bg-green-50 text-green-700 ring-1 ring-green-600/20'
                            : 'bg-red-50 text-red-700 ring-1 ring-red-600/20'
                        }`}
                      >
                        {org.status === 'active' ? tCommon('statusActive') : tCommon('statusDisabled')}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(org)} className={btnGhost} title={tCommon('edit')}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmAction({ type: 'toggle-status', org })}
                          className={btnGhost}
                          title={org.status === 'active' ? tCommon('disable') : tCommon('enable')}
                        >
                          {org.status === 'active' ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => setConfirmAction({ type: 'delete', org })}
                          className={`${btnGhost} text-destructive hover:text-destructive`}
                          title={tCommon('delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium">{tOrg('name')}</th>
                  <th className="p-3 text-left font-medium">{tOrg('code')}</th>
                  <th className="p-3 text-left font-medium">{tCommon('status')}</th>
                  <th className="p-3 text-left font-medium">{tCommon('createdAt')}</th>
                  <th className="p-3 text-left font-medium">{tCommon('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loading && orgs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      {tCommon('loading')}
                    </td>
                  </tr>
                ) : orgs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      {tCommon('noData')}
                    </td>
                  </tr>
                ) : (
                  orgs.map((org) => (
                    <tr key={org.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">{org.name}</td>
                      <td className="p-3">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{org.code}</code>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            org.status === 'active'
                              ? 'bg-green-50 text-green-700 ring-1 ring-green-600/20'
                              : 'bg-red-50 text-red-700 ring-1 ring-red-600/20'
                          }`}
                        >
                          {org.status === 'active' ? tCommon('statusActive') : tCommon('statusDisabled')}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(org.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(org)} className={btnGhost} title={tCommon('edit')}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmAction({ type: 'toggle-status', org })}
                            className={btnGhost}
                            title={org.status === 'active' ? tCommon('disable') : tCommon('enable')}
                          >
                            {org.status === 'active' ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => setConfirmAction({ type: 'delete', org })}
                            className={`${btnGhost} text-destructive hover:text-destructive`}
                            title={tCommon('delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>{tCommon('total', { count: total })}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className={btnOutline}
              >
                {tCommon('prevPage')}
              </button>
              <span className="px-2">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className={btnOutline}
              >
                {tCommon('nextPage')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Create / Edit Dialog */}
      {dialogMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-4">
              {dialogMode === 'create' ? tOrg('create') : tOrg('edit')}
            </h2>
            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{tOrg('name')}</label>
                <input
                  className={inputClass}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={tOrg('namePlaceholder')}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{tOrg('code')}</label>
                <input
                  className={`${inputClass} ${dialogMode === 'edit' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder={tOrg('codePlaceholder')}
                  required
                  disabled={dialogMode === 'edit'}
                />
                {dialogMode === 'edit' && (
                  <p className="text-xs text-muted-foreground">{tOrg('codeReadonly')}</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{tOrg('parentOrg')}</label>
                <TreeSelect
                  value={formParentId}
                  onChange={(val) => setFormParentId(val)}
                  nodes={treeSelectNodes}
                  excludeId={editingOrg?.id}
                  placeholder={tOrg('noParent')}
                />
              </div>
              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={closeDialog} className={btnOutline}>
                  {tCommon('cancel')}
                </button>
                <button type="submit" disabled={formSubmitting} className={btnPrimary}>
                  {formSubmitting ? tCommon('submitting') : dialogMode === 'create' ? tCommon('create') : tCommon('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">{tCommon('actionConfirm')}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {confirmAction.type === 'delete'
                ? tOrg('confirmDelete', { name: confirmAction.org.name })
                : confirmAction.org.status === 'active'
                  ? tOrg('confirmDisable', { name: confirmAction.org.name })
                  : tOrg('confirmEnable', { name: confirmAction.org.name })}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                className={btnOutline}
                disabled={confirmSubmitting}
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={confirmSubmitting}
                className={confirmAction.type === 'delete' ? btnDestructive : btnPrimary}
              >
                {confirmSubmitting
                  ? tCommon('processing')
                  : confirmAction.type === 'delete'
                    ? tCommon('confirmDeleteBtn')
                    : tCommon('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
