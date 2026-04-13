'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  GripVertical,
  LayoutGrid,
  Loader2,

  Plus,
  Trash2,
} from 'lucide-react';
import { cn, getApiErrorMessage } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { useTranslations } from 'next-intl';
import { ViewPicker, type ViewSelection } from './view-picker';
import type { AdminMenuNode } from '../menu-tab';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WysiwygRightPanelProps {
  appId: string;
  l2Node: AdminMenuNode | null;
  onSelectItem: (item: AdminMenuNode) => void;
  onRefresh: () => void;
}

interface L3Group {
  node: AdminMenuNode | null; // null = auto "默认" group for orphan items
  items: AdminMenuNode[];
}

interface ModelItem {
  id: string;
  name: string;
  code: string;
}

interface ModelListResponse {
  data: ModelItem[];
  total: number;
}

/* ------------------------------------------------------------------ */
/*  Style constants                                                    */
/* ------------------------------------------------------------------ */

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed';
const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none';
const btnOutline =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseL2Children(l2: AdminMenuNode): L3Group[] {
  const l3Groups: L3Group[] = [];
  const orphanItems: AdminMenuNode[] = [];

  for (const child of l2.children) {
    if (child.type === 'group') {
      l3Groups.push({
        node: child,
        items: child.children.filter((c) => c.type !== 'divider'),
      });
    } else if (child.type !== 'divider') {
      orphanItems.push(child);
    }
  }

  // Put orphan items in an auto "默认" group at the top
  if (orphanItems.length > 0) {
    l3Groups.unshift({ node: null, items: orphanItems });
  }

  return l3Groups;
}

/* ------------------------------------------------------------------ */
/*  Inline editable name for L3 group headers                          */
/* ------------------------------------------------------------------ */

function InlineEditName({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (newName: string) => Promise<void>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, value]);

  const commit = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch {
      // error handled upstream
    } finally {
      setSaving(false);
    }
  }, [draft, value, onSave]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={cn(
          'flex-1 text-sm border-b border-dashed border-primary bg-transparent outline-none min-w-0',
          className,
        )}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            setEditing(false);
          }
        }}
        disabled={saving}
      />
    );
  }

  return (
    <span
      className={cn('flex-1 truncate cursor-default select-none', className)}
      onDoubleClick={() => setEditing(true)}
      title="双击重命名"
    >
      {value}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Add Item Dialog                                                    */
/* ------------------------------------------------------------------ */

function AddItemDialog({
  open,
  onClose,
  appId,
  parentId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  appId: string;
  parentId: string;
  onSuccess: () => void;
}) {
  const tErrors = useTranslations('errorCodes');

  const [name, setName] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [viewSelection, setViewSelection] = useState<ViewSelection | null>(null);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset form on open
  useEffect(() => {
    if (!open) return;
    setName('');
    setSelectedModelId('');
    setViewSelection(null);
    setError('');
  }, [open]);

  // Load models
  useEffect(() => {
    if (!open) return;
    setModelsLoading(true);
    apiClient
      .get<ModelListResponse>(`/models?appId=${appId}&pageSize=200`)
      .then(({ data }) => {
        setModels(data.data ?? []);
      })
      .catch(() => {
        setModels([]);
      })
      .finally(() => setModelsLoading(false));
  }, [open, appId]);

  // Reset view selection when model changes
  useEffect(() => {
    setViewSelection(null);
  }, [selectedModelId]);

  // Auto-fill name from selected model
  useEffect(() => {
    if (selectedModelId && !name) {
      const model = models.find((m) => m.id === selectedModelId);
      if (model) {
        setName(model.name);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModelId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('请输入菜单名称');
      return;
    }
    if (!selectedModelId) {
      setError('请选择目标模型');
      return;
    }
    if (!viewSelection) {
      setError('请选择发布视图');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        appId,
        parentId,
        type: 'model',
        name: name.trim(),
        targetModelId: selectedModelId,
        targetViewType: viewSelection.targetViewType,
      };
      if (viewSelection.targetViewId) {
        payload.targetViewId = viewSelection.targetViewId;
      }
      await apiClient.post('/menus', payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, tErrors, '创建菜单项失败'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-card border rounded-lg p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">添加菜单项</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target model */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              目标模型 <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <select
                className={selectClass}
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                required
                disabled={modelsLoading}
              >
                <option value="">
                  {modelsLoading ? '加载中...' : '请选择模型'}
                </option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.code})
                  </option>
                ))}
              </select>
              {modelsLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Menu name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              菜单名称 <span className="text-destructive">*</span>
            </label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：采购订单"
              required
              autoFocus
            />
          </div>

          {/* View picker */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              发布视图 <span className="text-destructive">*</span>
            </label>
            <ViewPicker
              modelId={selectedModelId || null}
              value={viewSelection}
              onChange={setViewSelection}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className={btnOutline}
              disabled={submitting}
            >
              取消
            </button>
            <button type="submit" disabled={submitting} className={btnPrimary}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  创建中...
                </>
              ) : (
                '确认添加'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  L3 Group Section                                                   */
/* ------------------------------------------------------------------ */

function L3GroupSection({
  group,
  appId,
  onSelectItem,
  onRefresh,
  onRenameL3,
  onDeleteL3,
  showToast,
}: {
  group: L3Group;
  appId: string;
  onSelectItem: (item: AdminMenuNode) => void;
  onRefresh: () => void;
  onRenameL3: (id: string, name: string) => Promise<void>;
  onDeleteL3: (node: AdminMenuNode) => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}) {
  const tErrors = useTranslations('errorCodes');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const isAutoGroup = group.node === null;
  const parentId = group.node?.id ?? '';

  const handleDeleteItem = useCallback(
    async (item: AdminMenuNode) => {
      setDeletingItemId(item.id);
      try {
        await apiClient.delete(`/menus/${item.id}`);
        showToast('已删除', 'success');
        onRefresh();
      } catch (err: unknown) {
        showToast(getApiErrorMessage(err, tErrors, '删除失败'), 'error');
      } finally {
        setDeletingItemId(null);
      }
    },
    [onRefresh, showToast, tErrors],
  );

  return (
    <div className="mb-5">
      {/* L3 group header */}
      <div className="group/l3 flex items-center gap-2 mb-2.5">
        {/* Orange accent bar */}
        <div className="w-[3px] h-3.5 rounded bg-primary shrink-0" />

        {isAutoGroup ? (
          <span className="flex-1 text-sm font-semibold truncate select-none">
            默认
          </span>
        ) : (
          <>
            <InlineEditName
              value={group.node!.name}
              onSave={(newName) => onRenameL3(group.node!.id, newName)}
              className="text-sm font-semibold"
            />
            {/* Hover actions for real L3 group */}
            <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover/l3:opacity-100 transition-opacity">
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                onClick={() => onDeleteL3(group.node!)}
                title="删除分组"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Item cards grid */}
      <div className="flex flex-wrap gap-2">
        {group.items.map((item) => (
          <div
            key={item.id}
            className="group/card w-[170px] p-2.5 rounded-lg border border-border/60 bg-background hover:border-primary hover:shadow-sm cursor-pointer transition-all relative"
            onClick={() => onSelectItem(item)}
          >
            <div className="flex items-center gap-1.5">
              {/* Drag handle */}
              <span className="shrink-0 text-muted-foreground opacity-0 group-hover/card:opacity-100 transition-opacity cursor-grab">
                <GripVertical className="w-3.5 h-3.5" />
              </span>

              {/* Name */}
              <span className="text-sm truncate flex-1">{item.name}</span>

              {/* Delete */}
              <button
                type="button"
                className="shrink-0 opacity-0 group-hover/card:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteItem(item);
                }}
                title="删除菜单项"
                disabled={deletingItemId === item.id}
              >
                {deletingItemId === item.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        ))}

        {/* Dashed add card */}
        {!isAutoGroup && (
          <div
            className="w-[170px] p-2.5 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 cursor-pointer transition-all"
            onClick={() => setAddDialogOpen(true)}
          >
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
              <Plus className="w-3.5 h-3.5" />
              <span className="text-sm">添加菜单项</span>
            </div>
          </div>
        )}
      </div>

      {/* Add item dialog */}
      {!isAutoGroup && (
        <AddItemDialog
          open={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          appId={appId}
          parentId={parentId}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Delete L3 confirm dialog                                           */
/* ------------------------------------------------------------------ */

function DeleteL3Dialog({
  target,
  onClose,
  onConfirm,
  deleting,
}: {
  target: AdminMenuNode | null;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}) {
  if (!target) return null;

  const hasItems = target.children.filter((c) => c.type !== 'divider').length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm bg-card border rounded-lg p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-2">确认删除</h2>
        <p className="text-sm text-muted-foreground mb-4">
          确定要删除分组「{target.name}」吗？
          {hasItems && (
            <span className="block mt-1 text-destructive">
              该分组下有 {target.children.length} 个菜单项，请先移除子项后再删除。
            </span>
          )}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className={btnOutline}
            disabled={deleting}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting || hasItems}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3 py-2 bg-destructive text-white shadow-sm hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            {deleting ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  WysiwygRightPanel (main export)                                    */
/* ------------------------------------------------------------------ */

export function WysiwygRightPanel({
  appId,
  l2Node,
  onSelectItem,
  onRefresh,
}: WysiwygRightPanelProps) {
  const tErrors = useTranslations('errorCodes');

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Delete L3 confirm
  const [deleteL3Target, setDeleteL3Target] = useState<AdminMenuNode | null>(null);
  const [deletingL3, setDeletingL3] = useState(false);

  /* ---------- API helpers ---------- */

  const handleRenameL3 = useCallback(
    async (id: string, newName: string) => {
      try {
        await apiClient.put(`/menus/${id}`, { name: newName });
        onRefresh();
      } catch (err: unknown) {
        showToast(getApiErrorMessage(err, tErrors, '重命名失败'), 'error');
        throw err;
      }
    },
    [onRefresh, showToast, tErrors],
  );

  const handleDeleteL3 = useCallback(async () => {
    if (!deleteL3Target) return;
    setDeletingL3(true);
    try {
      await apiClient.delete(`/menus/${deleteL3Target.id}`);
      showToast('分组已删除', 'success');
      setDeleteL3Target(null);
      onRefresh();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, '删除失败'), 'error');
    } finally {
      setDeletingL3(false);
    }
  }, [deleteL3Target, onRefresh, showToast, tErrors]);

  const handleAddL3Group = useCallback(async () => {
    if (!l2Node) return;
    try {
      await apiClient.post('/menus', {
        appId,
        parentId: l2Node.id,
        type: 'group',
        name: '新分组',
      });
      showToast('分组已创建', 'success');
      onRefresh();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, '创建分组失败'), 'error');
    }
  }, [appId, l2Node, onRefresh, showToast, tErrors]);

  /* ---------- Empty state ---------- */

  if (!l2Node) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
        <LayoutGrid className="w-10 h-10 opacity-40" />
        <div className="text-center space-y-1">
          <p className="text-sm">点击左侧二级菜单查看内容</p>
          <p className="text-xs">右侧三级分组和菜单项与运行时抽屉一致</p>
        </div>
      </div>
    );
  }

  /* ---------- Parse children ---------- */

  const l3Groups = parseL2Children(l2Node);

  /* ---------- Render ---------- */

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{l2Node.name}</h3>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-4">
        {l3Groups.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            暂无菜单项，点击下方按钮新建三级分组
          </div>
        ) : (
          l3Groups.map((group, idx) => (
            <L3GroupSection
              key={group.node?.id ?? `orphan-${idx}`}
              group={group}
              appId={appId}
              onSelectItem={onSelectItem}
              onRefresh={onRefresh}
              onRenameL3={handleRenameL3}
              onDeleteL3={(node) => setDeleteL3Target(node)}
              showToast={showToast}
            />
          ))
        )}
      </div>

      {/* Bottom: add L3 group button */}
      <div className="shrink-0 border-t border-border p-3">
        <button
          type="button"
          className="flex items-center justify-center gap-1.5 w-full py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-background rounded-md transition-colors"
          onClick={handleAddL3Group}
        >
          <Plus className="w-4 h-4" />
          新建三级分组
        </button>
      </div>

      {/* Delete L3 confirm dialog */}
      <DeleteL3Dialog
        target={deleteL3Target}
        onClose={() => setDeleteL3Target(null)}
        onConfirm={handleDeleteL3}
        deleting={deletingL3}
      />

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-md shadow-lg text-sm font-medium',
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-destructive text-white',
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
