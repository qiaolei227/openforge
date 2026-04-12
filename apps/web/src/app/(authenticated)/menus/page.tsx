'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useMenuStore } from '@/stores/menu-store';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { MenuTreeEditor } from './components/menu-tree-editor';
import { MenuDetailPanel } from './components/menu-detail-panel';
import { CreateMenuDialog } from './components/create-menu-dialog';

export interface AdminMenuNode {
  id: string;
  parentId: string | null;
  code: string;
  source: 'coded' | 'designer';
  type: 'group' | 'model' | 'page' | 'link' | 'divider';
  name: string;
  icon?: string | null;
  sortOrder: number;
  visible: boolean;
  targetRoute?: string | null;
  targetAppCode?: string | null;
  targetModelCode?: string | null;
  targetViewId?: string | null;
  targetFilterPreset?: Record<string, unknown> | null;
  targetUrl?: string | null;
  children: AdminMenuNode[];
}

const btnPrimary =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none';

export default function MenusPage() {
  const searchParams = useSearchParams();
  const tErrors = useTranslations('errorCodes');
  const tCommon = useTranslations('common');

  const [tree, setTree] = useState<AdminMenuNode[]>([]);
  const [selected, setSelected] = useState<AdminMenuNode | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createType, setCreateType] = useState<null | 'group' | 'model' | 'link' | 'divider'>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<AdminMenuNode[]>('/menus/admin/tree');
      setTree(data);
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, '加载菜单失败'), 'error');
    } finally {
      setLoading(false);
    }
  }, [tErrors, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  // ?create=model&appCode=X&modelCode=Y — prefill new-menu dialog
  useEffect(() => {
    const c = searchParams.get('create');
    if (c === 'model' || c === 'group' || c === 'link' || c === 'divider') {
      setCreateType(c);
    }
  }, [searchParams]);

  // Warn on unload when there are unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  async function handleSaveReorder(
    items: Array<{ id: string; parentId: string | null; sortOrder: number }>,
  ) {
    setSaving(true);
    try {
      await apiClient.post('/menus/reorder', { items });
      showToast('已保存', 'success');
      setDirty(false);
      useMenuStore.getState().invalidate();
      await load();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, '保存失败'), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">菜单管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理系统导航菜单结构与权限配置</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className={btnPrimary}>
            <Plus className="w-4 h-4 mr-1" />
            新建菜单
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setCreateType('group')}>
                新建分组
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateType('model')}>
                新建业务菜单
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateType('link')}>
                新建外链
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateType('divider')}>
                新建分割线
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Main content: tree + panel */}
      <div className="flex-1 grid grid-cols-[1fr_360px] gap-4 min-h-0 overflow-hidden">
        <MenuTreeEditor
          tree={tree}
          selected={selected}
          onSelect={setSelected}
          onDirty={setDirty}
          onSaveReorder={handleSaveReorder}
          saving={saving}
          dirty={dirty}
        />
        <MenuDetailPanel
          menu={selected}
          onSaved={(updated) => {
            setSelected(updated);
            useMenuStore.getState().invalidate();
            load();
          }}
          onDeleted={() => {
            setSelected(null);
            useMenuStore.getState().invalidate();
            load();
          }}
          showToast={showToast}
        />
      </div>

      <CreateMenuDialog
        type={createType}
        open={!!createType}
        onClose={() => setCreateType(null)}
        prefillAppCode={searchParams.get('appCode') ?? undefined}
        prefillModelCode={searchParams.get('modelCode') ?? undefined}
        onCreated={() => {
          useMenuStore.getState().invalidate();
          load();
        }}
        showToast={showToast}
      />
    </div>
  );
}
