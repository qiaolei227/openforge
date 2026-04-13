'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { Loader2, Plus, MoreVertical, Database } from 'lucide-react';
import { AppIcon } from '@/lib/app-icon';
import { IconPicker } from '@/components/icon-picker';
import { useAiStore } from '@/stores/ai-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AppItem {
  id: string;
  name: string;
  code: string;
  icon: string | null;
  description: string | null;
  version: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { models: number };
}

interface AppListResponse {
  data: AppItem[];
  total: number;
  page: number;
  pageSize: number;
}

type DialogMode = 'create' | 'edit' | null;

const CODE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{1,49}$/;

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';
const btnPrimary =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none';
const btnOutline =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none';
const btnDestructive =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3 py-2 bg-destructive text-white shadow-sm hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none';

export default function AppsPage() {
  const router = useRouter();
  const tApps = useTranslations('apps');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errorCodes');

  // --- list state ---
  const [apps, setApps] = useState<AppItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // --- dialog state ---
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingApp, setEditingApp] = useState<AppItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formIcon, setFormIcon] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // --- confirm dialog state ---
  const [deleteTarget, setDeleteTarget] = useState<AppItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // --- toast ---
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- AI context ---
  const setAiContext = useAiStore((s) => s.setContext);
  useEffect(() => {
    setAiContext({ page: 'apps' });
  }, [setAiContext]);

  // --- debounce keyword ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  // --- fetch ---
  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedKeyword) params.set('keyword', debouncedKeyword);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const { data } = await apiClient.get<AppListResponse>(`/apps?${params.toString()}`);
      setApps(data.data);
      setTotal(data.total);
    } catch {
      showToast(tApps('fetchFailed'), 'error');
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [debouncedKeyword, page, pageSize, showToast, tApps]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // --- create / edit dialog ---
  const openCreate = () => {
    setDialogMode('create');
    setEditingApp(null);
    setFormName('');
    setFormCode('');
    setFormIcon('');
    setFormDescription('');
    setFormError('');
    setCodeError('');
  };

  const openEdit = (app: AppItem) => {
    setDialogMode('edit');
    setEditingApp(app);
    setFormName(app.name);
    setFormCode(app.code);
    setFormIcon(app.icon || '');
    setFormDescription(app.description || '');
    setFormError('');
    setCodeError('');
  };

  const closeDialog = () => {
    setDialogMode(null);
    setEditingApp(null);
    setFormError('');
    setCodeError('');
  };

  const validateCode = (code: string): boolean => {
    if (!CODE_PATTERN.test(code)) {
      setCodeError(tApps('codeInvalid'));
      return false;
    }
    setCodeError('');
    return true;
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (dialogMode === 'create' && !validateCode(formCode)) {
      return;
    }

    setFormSubmitting(true);
    try {
      if (dialogMode === 'create') {
        await apiClient.post('/apps', {
          name: formName,
          code: formCode,
          icon: formIcon || undefined,
          description: formDescription || undefined,
        });
        showToast(tApps('createSuccess'), 'success');
      } else if (dialogMode === 'edit' && editingApp) {
        await apiClient.put(`/apps/${editingApp.id}`, {
          name: formName,
          icon: formIcon || undefined,
          description: formDescription || undefined,
        });
        showToast(tApps('updateSuccess'), 'success');
      }
      closeDialog();
      fetchApps();
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, tErrors, tCommon('operationFailed')));
    } finally {
      setFormSubmitting(false);
    }
  };

  // --- delete action ---
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      await apiClient.delete(`/apps/${deleteTarget.id}`);
      showToast(tApps('deleteSuccess'), 'success');
      setDeleteTarget(null);
      fetchApps();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
      setDeleteTarget(null);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // --- loading skeleton ---
  const renderSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="border rounded-lg p-5 animate-pulse">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-3 bg-muted rounded w-1/3" />
            </div>
          </div>
          <div className="h-3 bg-muted rounded w-full mb-2" />
          <div className="h-3 bg-muted rounded w-2/3" />
        </div>
      ))}
    </div>
  );

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

      {/* Search Bar + Create */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-sm">
          <input
            className={inputClass}
            placeholder={tApps('search')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex-1" />
        <button onClick={openCreate} className={btnPrimary}>
          <Plus className="w-4 h-4 mr-1" />
          {tApps('create')}
        </button>
      </div>

      {/* Card Grid */}
      {initialLoading ? (
        renderSkeleton()
      ) : apps.length === 0 && !debouncedKeyword ? (
        /* Empty state — no apps at all */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <button
            onClick={openCreate}
            className="flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg p-8 text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer min-h-[180px]"
          >
            <Plus className="w-8 h-8" />
            <span className="text-sm font-medium">{tApps('create')}</span>
          </button>
        </div>
      ) : apps.length === 0 ? (
        /* No results after search/filter */
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Database className="w-12 h-12 mb-3 opacity-40" />
          <p className="text-sm">{tCommon('noData')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {apps.map((app) => (
            <div
              key={app.id}
              onClick={() => router.push(`/apps/${app.id}`)}
              className="group relative border rounded-lg p-5 cursor-pointer transition-shadow hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20"
            >
              {/* Card header: icon + name + code */}
              <div className="flex items-start gap-3 mb-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0">
                  <AppIcon iconName={app.icon} className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold truncate">{app.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <code className="rounded bg-muted px-1 py-0.5">{app.code}</code>
                  </p>
                </div>

                {/* Card menu — visible on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center justify-center rounded-md w-8 h-8 hover:bg-accent transition-colors"
                    >
                      <MoreVertical className="w-4 h-4 text-muted-foreground" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(app); }}>
                        {tCommon('edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(app); }}
                        className="text-destructive focus:text-destructive"
                      >
                        {tCommon('delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-muted-foreground line-clamp-2 mb-3 min-h-[2.5rem]">
                {app.description || '\u00A0'}
              </p>

              {/* Footer: model count + updated date */}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t">
                <span className="flex items-center gap-1">
                  <Database className="w-3.5 h-3.5" />
                  {tApps('modelCount', { count: app._count?.models ?? 0 })}
                </span>
                <span>
                  {tCommon('updatedAt')} {new Date(app.updatedAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination — only show when there are results */}
      {total > 0 && (
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
      )}

      {/* Create / Edit Dialog */}
      {dialogMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-4">
              {dialogMode === 'create' ? tApps('createTitle') : tApps('editTitle')}
            </h2>
            <form onSubmit={handleSubmitForm} className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{tApps('name')}</label>
                <input
                  className={inputClass}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={tApps('namePlaceholder')}
                  required
                  autoFocus
                />
              </div>

              {/* Code */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{tApps('code')}</label>
                <input
                  className={`${inputClass} ${dialogMode === 'edit' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  value={formCode}
                  onChange={(e) => {
                    setFormCode(e.target.value);
                    if (codeError) validateCode(e.target.value);
                  }}
                  placeholder={tApps('codePlaceholder')}
                  required
                  disabled={dialogMode === 'edit'}
                />
                {dialogMode === 'edit' && (
                  <p className="text-xs text-muted-foreground">{tApps('codeReadonly')}</p>
                )}
                {codeError && (
                  <p className="text-xs text-destructive">{codeError}</p>
                )}
              </div>

              {/* Icon */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {tApps('icon')}
                  <span className="text-muted-foreground font-normal ml-1">({tCommon('optional')})</span>
                </label>
                <IconPicker value={formIcon} onChange={setFormIcon} />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {tApps('description')}
                  <span className="text-muted-foreground font-normal ml-1">({tCommon('optional')})</span>
                </label>
                <textarea
                  className={`${inputClass} h-20 resize-none`}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={tApps('descriptionPlaceholder')}
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
                  {formSubmitting
                    ? tCommon('submitting')
                    : dialogMode === 'create'
                      ? tCommon('create')
                      : tCommon('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">{tCommon('actionConfirm')}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {tApps('confirmDelete', { name: deleteTarget.name })}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className={btnOutline}
                disabled={deleteSubmitting}
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteSubmitting}
                className={btnDestructive}
              >
                {deleteSubmitting ? tCommon('processing') : tCommon('confirmDeleteBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
