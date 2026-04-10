'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { Loader2, Blocks, Plus, Database, ArrowLeft, MoreVertical, Columns3, Eye, BookOpen, Trash2, Pencil } from 'lucide-react';
import { Breadcrumb } from '@/components/breadcrumb';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAiStore } from '@/stores/ai-store';

/** Color palette matching enum-field.tsx */
const DICT_ITEM_COLORS = [
  { name: 'gray', bg: 'bg-gray-400', preview: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400' },
  { name: 'red', bg: 'bg-red-500', preview: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
  { name: 'orange', bg: 'bg-orange-500', preview: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' },
  { name: 'yellow', bg: 'bg-yellow-500', preview: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
  { name: 'green', bg: 'bg-green-500', preview: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  { name: 'blue', bg: 'bg-blue-500', preview: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  { name: 'purple', bg: 'bg-purple-500', preview: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
  { name: 'pink', bg: 'bg-pink-500', preview: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400' },
];

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

interface ModelItem {
  id: string;
  appId: string;
  name: string;
  code: string;
  tableName: string;
  description: string | null;
  dataScope: 'private' | 'shared';
  isTree: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { fields: number; views: number };
}

interface ModelListResponse {
  data: ModelItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface DictItemData {
  id?: string;
  value: string;
  label: string;
  color?: string;
}

interface DictData {
  id: string;
  appId: string;
  name: string;
  code: string;
  description: string | null;
  items: DictItemData[];
  createdAt: string;
  updatedAt: string;
  _count?: { items: number };
}

type DialogMode = 'create' | 'edit' | null;
type DictDialogMode = 'create' | 'edit' | null;

const TABLE_NAME_PATTERN = /^[a-z][a-z0-9_]{1,99}$/;
const DICT_CODE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

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

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const appId = params.appId as string;
  const tModels = useTranslations('models');
  const tApps = useTranslations('apps');
  const tDicts = useTranslations('dicts');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errorCodes');

  // --- app info state ---
  const [app, setApp] = useState<AppItem | null>(null);
  const [appLoading, setAppLoading] = useState(true);

  // --- model list state ---
  const [models, setModels] = useState<ModelItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [dataScopeFilter, setDataScopeFilter] = useState<'' | 'private' | 'shared' | 'distributed'>('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // --- dialog state ---
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingModel, setEditingModel] = useState<ModelItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDataScope, setFormDataScope] = useState<'private' | 'shared' | 'distributed'>('private');
  const [formError, setFormError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // --- confirm dialog state ---
  const [deleteTarget, setDeleteTarget] = useState<ModelItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // --- active tab ---
  const [activeTab, setActiveTab] = useState<'models' | 'dicts'>('models');

  // --- dict state ---
  const [dicts, setDicts] = useState<DictData[]>([]);
  const [dictsLoading, setDictsLoading] = useState(false);
  const [dictsInitialLoading, setDictsInitialLoading] = useState(true);

  // --- dict dialog state ---
  const [dictDialogMode, setDictDialogMode] = useState<DictDialogMode>(null);
  const [editingDict, setEditingDict] = useState<DictData | null>(null);
  const [dictFormName, setDictFormName] = useState('');
  const [dictFormCode, setDictFormCode] = useState('');
  const [dictFormDescription, setDictFormDescription] = useState('');
  const [dictFormItems, setDictFormItems] = useState<DictItemData[]>([]);
  const [dictFormError, setDictFormError] = useState('');
  const [dictCodeError, setDictCodeError] = useState('');
  const [dictFormSubmitting, setDictFormSubmitting] = useState(false);

  // --- dict delete state ---
  const [deleteDictTarget, setDeleteDictTarget] = useState<DictData | null>(null);
  const [deleteDictSubmitting, setDeleteDictSubmitting] = useState(false);

  // --- toast ---
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- AI context ---
  const setAiContext = useAiStore((s) => s.setContext);
  useEffect(() => {
    setAiContext({ page: 'app-detail', appId, appName: app?.name });
  }, [setAiContext, appId, app?.name]);

  // --- fetch app info ---
  const fetchApp = useCallback(async () => {
    setAppLoading(true);
    try {
      const { data } = await apiClient.get<AppItem>(`/apps/${appId}`);
      setApp(data);
    } catch {
      showToast(tModels('fetchAppFailed'), 'error');
    } finally {
      setAppLoading(false);
    }
  }, [appId, showToast, tModels]);

  useEffect(() => {
    fetchApp();
  }, [fetchApp]);

  // --- debounce keyword ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  // --- fetch models ---
  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('appId', appId);
      if (debouncedKeyword) params.set('keyword', debouncedKeyword);
      if (dataScopeFilter) params.set('dataScope', dataScopeFilter);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const { data } = await apiClient.get<ModelListResponse>(`/models?${params.toString()}`);
      setModels(data.data);
      setTotal(data.total);
    } catch {
      showToast(tModels('fetchFailed'), 'error');
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [appId, debouncedKeyword, dataScopeFilter, page, pageSize, showToast, tModels]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // --- create / edit dialog ---
  const openCreate = () => {
    setDialogMode('create');
    setEditingModel(null);
    setFormName('');
    setFormCode('');
    setFormDescription('');
    setFormDataScope('private');
    setFormError('');
    setCodeError('');
  };

  const openEdit = (model: ModelItem) => {
    setDialogMode('edit');
    setEditingModel(model);
    setFormName(model.name);
    setFormCode(model.code);
    setFormDescription(model.description || '');
    setFormDataScope(model.dataScope);
    setFormError('');
    setCodeError('');
  };

  const closeDialog = () => {
    setDialogMode(null);
    setEditingModel(null);
    setFormError('');
    setCodeError('');
  };

  const validateCode = (name: string): boolean => {
    if (!TABLE_NAME_PATTERN.test(name)) {
      setCodeError(tModels('codeInvalid'));
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
        await apiClient.post('/models', {
          appId,
          name: formName,
          code: formCode,
          description: formDescription || undefined,
          dataScope: formDataScope,
        });
        showToast(tModels('createSuccess'), 'success');
      } else if (dialogMode === 'edit' && editingModel) {
        await apiClient.put(`/models/${editingModel.id}`, {
          name: formName,
          description: formDescription || undefined,
        });
        showToast(tModels('updateSuccess'), 'success');
      }
      closeDialog();
      fetchModels();
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
      await apiClient.delete(`/models/${deleteTarget.id}`);
      showToast(tModels('deleteSuccess'), 'success');
      setDeleteTarget(null);
      fetchModels();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
      setDeleteTarget(null);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // --- fetch dicts ---
  const fetchDicts = useCallback(async () => {
    setDictsLoading(true);
    try {
      const { data } = await apiClient.get<DictData[]>(`/apps/${appId}/dicts`);
      setDicts(data);
    } catch {
      /* silent */
    } finally {
      setDictsLoading(false);
      setDictsInitialLoading(false);
    }
  }, [appId]);

  // --- dict dialog handlers ---
  const openDictCreate = () => {
    setDictDialogMode('create');
    setEditingDict(null);
    setDictFormName('');
    setDictFormCode('');
    setDictFormDescription('');
    setDictFormItems([{ value: '', label: '' }]);
    setDictFormError('');
    setDictCodeError('');
  };

  const openDictEdit = async (dict: DictData) => {
    setDictDialogMode('edit');
    setEditingDict(dict);
    setDictFormName(dict.name);
    setDictFormCode(dict.code);
    setDictFormDescription(dict.description || '');
    setDictFormItems([{ value: '', label: '' }]);
    setDictFormError('');
    setDictCodeError('');
    // Fetch full dict with items
    try {
      const { data } = await apiClient.get(`/dicts/${dict.id}`);
      setDictFormItems(
        data.items && data.items.length > 0
          ? data.items.map((item: any) => ({ id: item.id, value: item.value, label: item.label, color: item.color || '' }))
          : [{ value: '', label: '', color: 'gray' }]
      );
    } catch {
      // fallback: keep empty item
    }
  };

  const closeDictDialog = () => {
    setDictDialogMode(null);
    setEditingDict(null);
    setDictFormError('');
    setDictCodeError('');
  };

  const validateDictCode = (code: string): boolean => {
    if (!DICT_CODE_PATTERN.test(code)) {
      setDictCodeError(tDicts('codeInvalid'));
      return false;
    }
    setDictCodeError('');
    return true;
  };

  const addDictItem = () => {
    setDictFormItems((prev) => [...prev, { value: '', label: '', color: 'gray' }]);
  };

  const removeDictItem = (index: number) => {
    setDictFormItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateDictItem = (index: number, field: keyof DictItemData, value: string) => {
    setDictFormItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleDictSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setDictFormError('');

    if (dictDialogMode === 'create' && !validateDictCode(dictFormCode)) {
      return;
    }

    // Filter out empty items
    const validItems = dictFormItems.filter((item) => item.value.trim() && item.label.trim());

    setDictFormSubmitting(true);
    try {
      if (dictDialogMode === 'create') {
        await apiClient.post(`/apps/${appId}/dicts`, {
          name: dictFormName,
          code: dictFormCode,
          description: dictFormDescription || undefined,
          items: validItems.map((item) => ({
            value: item.value,
            label: item.label,
            color: item.color || undefined,
          })),
        });
        showToast(tDicts('createSuccess'), 'success');
      } else if (dictDialogMode === 'edit' && editingDict) {
        await apiClient.put(`/dicts/${editingDict.id}`, {
          name: dictFormName,
          description: dictFormDescription || undefined,
          items: validItems.map((item) => ({
            id: item.id,
            value: item.value,
            label: item.label,
            color: item.color || undefined,
          })),
        });
        showToast(tDicts('updateSuccess'), 'success');
      }
      closeDictDialog();
      fetchDicts();
    } catch (err: unknown) {
      setDictFormError(getApiErrorMessage(err, tErrors, tCommon('operationFailed')));
    } finally {
      setDictFormSubmitting(false);
    }
  };

  const handleDictDelete = async () => {
    if (!deleteDictTarget) return;
    setDeleteDictSubmitting(true);
    try {
      await apiClient.delete(`/dicts/${deleteDictTarget.id}`);
      showToast(tDicts('deleteSuccess'), 'success');
      setDeleteDictTarget(null);
      fetchDicts();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
      setDeleteDictTarget(null);
    } finally {
      setDeleteDictSubmitting(false);
    }
  };

  // --- data scope badge ---
  const renderDataScopeBadge = (dataScope: string) => {
    if (dataScope === 'shared') {
      return (
        <Badge variant="outline" className="bg-blue-100 text-blue-700 border-0 dark:bg-blue-900/30 dark:text-blue-400">
          {tModels('dataScopeShared')}
        </Badge>
      );
    }
    if (dataScope === 'distributed') {
      return (
        <Badge variant="outline" className="bg-amber-100 text-amber-700 border-0 dark:bg-amber-900/30 dark:text-amber-400">
          {tModels('dataScopeDistributed')}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-gray-100 text-gray-600 border-0 dark:bg-gray-800/50 dark:text-gray-400">
        {tModels('dataScopePrivate')}
      </Badge>
    );
  };

  // --- loading skeleton for table ---
  const renderTableSkeleton = () => (
    <tbody>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b">
          <td className="p-3"><div className="h-4 bg-muted rounded w-24 animate-pulse" /></td>
          <td className="p-3"><div className="h-4 bg-muted rounded w-20 animate-pulse" /></td>
          <td className="p-3"><div className="h-4 bg-muted rounded w-12 animate-pulse" /></td>
          <td className="p-3"><div className="h-4 bg-muted rounded w-12 animate-pulse" /></td>
          <td className="p-3"><div className="h-4 bg-muted rounded w-20 animate-pulse" /></td>
          <td className="p-3"><div className="h-4 bg-muted rounded w-16 animate-pulse" /></td>
        </tr>
      ))}
    </tbody>
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

      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: tApps('title'), href: '/apps' },
          { label: app?.name || '...' },
        ]}
      />

      {/* App Info Card */}
      {appLoading ? (
        <div className="border rounded-lg p-5 mb-6 animate-pulse">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-muted rounded w-1/4" />
              <div className="h-3 bg-muted rounded w-1/3" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          </div>
        </div>
      ) : app ? (
        <div className="border rounded-lg p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary shrink-0">
              <Blocks className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold mb-1">{app.name}</h2>
              <p className="text-sm text-muted-foreground mb-1">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{app.code}</code>
              </p>
              {app.description && (
                <p className="text-sm text-muted-foreground">{app.description}</p>
              )}
            </div>
            <button
              onClick={() => router.push(`/apps`)}
              className={btnOutline}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              {tCommon('back')}
            </button>
          </div>
        </div>
      ) : null}

      {/* Tab Switcher */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center border-b">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('models')}
              className={`pb-2 text-sm transition-colors relative ${
                activeTab === 'models'
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tModels('title')}
              {activeTab === 'models' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
            <button
              onClick={() => { setActiveTab('dicts'); fetchDicts(); }}
              className={`pb-2 text-sm transition-colors relative ${
                activeTab === 'dicts'
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tDicts('title')}
              {activeTab === 'dicts' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          </div>
        </div>
        {activeTab === 'models' ? (
          <button onClick={openCreate} className={btnPrimary}>
            <Plus className="w-4 h-4 mr-1" />
            {tModels('create')}
          </button>
        ) : (
          <button onClick={openDictCreate} className={btnPrimary}>
            <Plus className="w-4 h-4 mr-1" />
            {tDicts('create')}
          </button>
        )}
      </div>

      {/* Models Tab Content */}
      {activeTab === 'models' && (
        <>
          {/* Search Bar + Data Scope Tabs */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <input
                className={inputClass}
                placeholder={tModels('search')}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              {loading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="inline-flex items-center rounded-md border bg-background p-0.5 text-sm">
              {(['' , 'private', 'shared', 'distributed'] as const).map((scope) => (
                <button
                  key={scope || 'all'}
                  onClick={() => { setDataScopeFilter(scope); setPage(1); }}
                  className={`px-3 py-1 rounded-sm transition-colors ${
                    dataScopeFilter === scope
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {scope === '' ? tModels('dataScopeAll') : scope === 'shared' ? tModels('dataScopeShared') : scope === 'distributed' ? tModels('dataScopeDistributed') : tModels('dataScopePrivate')}
                </button>
              ))}
            </div>
          </div>

          {/* Model cards */}
          {initialLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg p-5 animate-pulse">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-24" />
                      <div className="h-3 bg-muted rounded w-16" />
                    </div>
                  </div>
                  <div className="h-3 bg-muted rounded w-full mb-3" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : models.length === 0 ? (
            debouncedKeyword ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Database className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm">{tCommon('noData')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <button
                  onClick={openCreate}
                  className="flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg p-8 text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer min-h-[180px]"
                >
                  <Plus className="w-8 h-8" />
                  <span className="text-sm font-medium">{tModels('create')}</span>
                </button>
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {models.map((model) => (
                <div
                  key={model.id}
                  onClick={() => router.push(`/apps/${appId}/models/${model.id}`)}
                  className="group relative border rounded-lg p-5 cursor-pointer transition-shadow hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20"
                >
                  {/* Data scope badge */}
                  <div className="absolute top-3 right-12">
                    {renderDataScopeBadge(model.dataScope)}
                  </div>

                  {/* Card menu */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center justify-center rounded-md w-8 h-8 hover:bg-accent transition-colors"
                      >
                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(model); }}>
                          {tCommon('edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(model); setDeleteError(''); }}
                          className="text-destructive focus:text-destructive"
                        >
                          {tCommon('delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Card header: icon + name + code */}
                  <div className="flex items-start gap-3 mb-3 pr-16">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0">
                      <Database className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold truncate">{model.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <code className="rounded bg-muted px-1 py-0.5">{model.code}</code>
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3 min-h-[2.5rem]">
                    {model.description || '\u00A0'}
                  </p>

                  {/* Footer: field count + data scope + updated date */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t">
                    <span className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <Columns3 className="w-3.5 h-3.5" />
                        {tModels('fieldCount', { count: model._count?.fields ?? 0 })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" />
                        {tModels('viewCount', { count: model._count?.views ?? 0 })}
                      </span>
                    </span>
                    <span>
                      {tCommon('updatedAt')} {new Date(model.updatedAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
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
        </>
      )}

      {/* Dicts Tab Content */}
      {activeTab === 'dicts' && (
        <>
          {dictsInitialLoading && dictsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg p-5 animate-pulse">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-24" />
                      <div className="h-3 bg-muted rounded w-16" />
                    </div>
                  </div>
                  <div className="h-3 bg-muted rounded w-full mb-3" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : dicts.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <button
                onClick={openDictCreate}
                className="flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg p-8 text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer min-h-[180px]"
              >
                <Plus className="w-8 h-8" />
                <span className="text-sm font-medium">{tDicts('create')}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {dicts.map((dict) => (
                <div
                  key={dict.id}
                  onClick={() => openDictEdit(dict)}
                  className="group relative border rounded-lg p-5 cursor-pointer transition-shadow hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20"
                >
                  {/* Card menu */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center justify-center rounded-md w-8 h-8 hover:bg-accent transition-colors"
                      >
                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openDictEdit(dict); }}>
                          <Pencil className="w-4 h-4 mr-2" />
                          {tCommon('edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); setDeleteDictTarget(dict); }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {tCommon('delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Card header: icon + name + code */}
                  <div className="flex items-start gap-3 mb-3 pr-10">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold truncate">{dict.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <code className="rounded bg-muted px-1 py-0.5">{dict.code}</code>
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3 min-h-[2.5rem]">
                    {dict.description || '\u00A0'}
                  </p>

                  {/* Footer: item count + updated date */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t">
                    <span className="flex items-center gap-1">
                      <Columns3 className="w-3.5 h-3.5" />
                      {tDicts('itemCount', { count: dict._count?.items ?? dict.items?.length ?? 0 })}
                    </span>
                    <span>
                      {tCommon('updatedAt')} {new Date(dict.updatedAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create / Edit Dialog */}
      {dialogMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-4">
              {dialogMode === 'create' ? tModels('createTitle') : tModels('editTitle')}
            </h2>
            <form onSubmit={handleSubmitForm} className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{tModels('name')}</label>
                <input
                  className={inputClass}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={tModels('namePlaceholder')}
                  required
                  autoFocus
                />
              </div>

              {/* Table Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{tModels('code')}</label>
                <input
                  className={`${inputClass} ${dialogMode === 'edit' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  value={formCode}
                  onChange={(e) => {
                    setFormCode(e.target.value);
                    if (codeError) validateCode(e.target.value);
                  }}
                  placeholder={tModels('codePlaceholder')}
                  required
                  disabled={dialogMode === 'edit'}
                />
                {dialogMode === 'edit' && (
                  <p className="text-xs text-muted-foreground">{tModels('codeReadonly')}</p>
                )}
                {codeError && (
                  <p className="text-xs text-destructive">{codeError}</p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {tModels('description')}
                  <span className="text-muted-foreground font-normal ml-1">({tCommon('optional')})</span>
                </label>
                <textarea
                  className={`${inputClass} h-20 resize-none`}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={tModels('descriptionPlaceholder')}
                />
              </div>

              {/* Data Scope */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{tModels('dataScope')}</label>
                <select
                  className={`${inputClass} disabled:opacity-70 disabled:cursor-not-allowed`}
                  value={formDataScope}
                  disabled={dialogMode === 'edit'}
                  onChange={(e) => setFormDataScope(e.target.value as 'private' | 'shared' | 'distributed')}
                >
                  <option value="private">{tModels('dataScopePrivate')}</option>
                  <option value="shared">{tModels('dataScopeShared')}</option>
                  <option value="distributed">{tModels('dataScopeDistributed')}</option>
                </select>
                {dialogMode === 'edit' && (
                  <p className="text-xs text-muted-foreground">{tModels('dataScopeImmutable')}</p>
                )}
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
            <p className="text-sm text-muted-foreground mb-4">
              {tModels('confirmDelete', { name: deleteTarget.name })}
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

      {/* Dict Create / Edit Dialog */}
      {dictDialogMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg bg-card border rounded-lg p-6 shadow-lg max-h-[85vh] flex flex-col">
            <h2 className="text-lg font-semibold mb-4">
              {dictDialogMode === 'create' ? tDicts('createTitle') : tDicts('editTitle')}
            </h2>
            <form onSubmit={handleDictSubmit} className="flex-1 overflow-y-auto space-y-4 px-1 min-h-0">
              {/* Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{tDicts('name')}</label>
                <input
                  className={inputClass}
                  value={dictFormName}
                  onChange={(e) => setDictFormName(e.target.value)}
                  placeholder={tDicts('namePlaceholder')}
                  required
                  autoFocus
                />
              </div>

              {/* Code */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{tDicts('code')}</label>
                <input
                  className={`${inputClass} ${dictDialogMode === 'edit' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  value={dictFormCode}
                  onChange={(e) => {
                    setDictFormCode(e.target.value);
                    if (dictCodeError) validateDictCode(e.target.value);
                  }}
                  placeholder={tDicts('codePlaceholder')}
                  required
                  disabled={dictDialogMode === 'edit'}
                />
                {dictDialogMode === 'edit' && (
                  <p className="text-xs text-muted-foreground">{tDicts('codeReadonly')}</p>
                )}
                {dictCodeError && (
                  <p className="text-xs text-destructive">{dictCodeError}</p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {tDicts('description')}
                  <span className="text-muted-foreground font-normal ml-1">({tCommon('optional')})</span>
                </label>
                <textarea
                  className={`${inputClass} h-16 resize-none`}
                  value={dictFormDescription}
                  onChange={(e) => setDictFormDescription(e.target.value)}
                  placeholder={tDicts('descriptionPlaceholder')}
                />
              </div>

              {/* Items */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{tDicts('items')}</label>
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-0.5">
                  <span className="w-8 shrink-0">{tDicts('itemColor')}</span>
                  <span className="flex-1 min-w-0">{tDicts('itemValue')}</span>
                  <span className="flex-1 min-w-0">{tDicts('itemLabel')}</span>
                  <span className="w-9 shrink-0" />
                </div>
                <div className="space-y-2">
                  {dictFormItems.map((item, index) => {
                    const currentColor = DICT_ITEM_COLORS.find((c) => c.name === (item.color || 'gray')) ?? DICT_ITEM_COLORS[0];
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger
                            className="inline-flex items-center justify-center w-8 h-9 rounded-md hover:bg-accent transition-colors shrink-0"
                          >
                            <span className={`w-4 h-4 rounded-full ${currentColor.bg}`} />
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2" align="start">
                            <div className="grid grid-cols-4 gap-1.5">
                              {DICT_ITEM_COLORS.map((c) => (
                                <button
                                  key={c.name}
                                  type="button"
                                  onClick={() => updateDictItem(index, 'color', c.name)}
                                  className={`w-7 h-7 rounded-full ${c.bg} transition-all hover:scale-110 ${
                                    (item.color || 'gray') === c.name ? 'ring-2 ring-offset-2 ring-primary' : ''
                                  }`}
                                />
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <div className="flex-1 min-w-0">
                          <input
                            className={inputClass}
                            value={item.value}
                            onChange={(e) => updateDictItem(index, 'value', e.target.value)}
                            placeholder={tDicts('itemValuePlaceholder')}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <input
                            className={inputClass}
                            value={item.label}
                            onChange={(e) => updateDictItem(index, 'label', e.target.value)}
                            placeholder={tDicts('itemLabelPlaceholder')}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDictItem(index)}
                          className="inline-flex items-center justify-center rounded-md w-9 h-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                          disabled={dictFormItems.length <= 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={addDictItem}
                  className={`${btnGhost} text-primary`}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {tDicts('addItem')}
                </button>
              </div>

              {dictFormError && (
                <p className="text-sm text-destructive">{dictFormError}</p>
              )}
            </form>
            <div className="flex gap-2 justify-end pt-4 border-t mt-4">
              <button type="button" onClick={closeDictDialog} className={btnOutline}>
                {tCommon('cancel')}
              </button>
              <button type="button" disabled={dictFormSubmitting} className={btnPrimary}
                onClick={handleDictSubmit}
              >
                {dictFormSubmitting
                  ? tCommon('submitting')
                  : dictDialogMode === 'create'
                    ? tCommon('create')
                    : tCommon('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dict Delete Confirm Dialog */}
      {deleteDictTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">{tCommon('actionConfirm')}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {tDicts('confirmDelete', { name: deleteDictTarget.name })}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteDictTarget(null)}
                className={btnOutline}
                disabled={deleteDictSubmitting}
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleDictDelete}
                disabled={deleteDictSubmitting}
                className={btnDestructive}
              >
                {deleteDictSubmitting ? tCommon('processing') : tCommon('confirmDeleteBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
