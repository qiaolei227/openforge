'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { useTranslations } from 'next-intl';
import type { AdminMenuNode } from '../menu-tab';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WysiwygLeftPanelProps {
  appId: string;
  tree: AdminMenuNode[];
  activeL2Id: string | null;
  onSelectL2: (id: string) => void;
  onRefresh: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Count leaf (non-group) descendants of a node */
function countLeaves(node: AdminMenuNode): number {
  if (node.type !== 'group') return 1;
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

/* ------------------------------------------------------------------ */
/*  Inline editable name                                               */
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
      // Focus after next paint so the element is rendered
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
/*  L2 row                                                             */
/* ------------------------------------------------------------------ */

function L2Row({
  node,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  node: AdminMenuNode;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
}) {
  const leafCount = countLeaves(node);

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-3 py-2 cursor-pointer select-none transition-colors',
        active
          ? 'bg-background text-primary font-medium border-l-[3px] border-primary'
          : 'border-l-[3px] border-transparent hover:bg-background/60',
      )}
      onClick={onSelect}
    >
      {/* Drag handle (visual placeholder, not functional yet) */}
      <span className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
        <GripVertical className="w-3.5 h-3.5" />
      </span>

      {/* Name — double-click to rename */}
      <InlineEditName
        value={node.name}
        onSave={onRename}
        className={cn('text-sm', active && 'font-medium text-primary')}
      />

      {/* Leaf count badge */}
      {leafCount > 0 && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {leafCount}
        </span>
      )}

      {/* Delete */}
      <button
        type="button"
        className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="删除"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  L1 section                                                         */
/* ------------------------------------------------------------------ */

function L1Section({
  node,
  expanded,
  activeL2Id,
  onToggleExpand,
  onSelectL2,
  onRenameL1,
  onDeleteL1,
  onRenameL2,
  onDeleteL2,
  onAddL2,
}: {
  node: AdminMenuNode;
  expanded: boolean;
  activeL2Id: string | null;
  onToggleExpand: () => void;
  onSelectL2: (id: string) => void;
  onRenameL1: (name: string) => Promise<void>;
  onDeleteL1: () => void;
  onRenameL2: (id: string, name: string) => Promise<void>;
  onDeleteL2: (l2: AdminMenuNode) => void;
  onAddL2: () => void;
}) {
  // Filter L2 children that are groups
  const l2Groups = node.children.filter((c) => c.type === 'group');

  return (
    <div className="border-b border-border last:border-b-0">
      {/* L1 header */}
      <div
        className="group flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none hover:bg-background/40 transition-colors"
        onClick={onToggleExpand}
      >
        {/* Chevron */}
        <ChevronRight
          className={cn(
            'w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-90',
          )}
        />

        {/* Name — double-click to rename */}
        <InlineEditName
          value={node.name}
          onSave={onRenameL1}
          className="text-sm font-semibold"
        />

        {/* Hover actions */}
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Drag handle (visual placeholder) */}
          <span className="text-muted-foreground cursor-grab">
            <GripVertical className="w-3.5 h-3.5" />
          </span>
          {/* Delete L1 */}
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteL1();
            }}
            title="删除分组"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* L2 children */}
      {expanded && (
        <div className="pb-1">
          {l2Groups.length > 0 ? (
            l2Groups.map((l2) => (
              <L2Row
                key={l2.id}
                node={l2}
                active={activeL2Id === l2.id}
                onSelect={() => onSelectL2(l2.id)}
                onRename={(name) => onRenameL2(l2.id, name)}
                onDelete={() => onDeleteL2(l2)}
              />
            ))
          ) : (
            <div className="px-6 py-2 text-xs text-muted-foreground">
              暂无二级菜单
            </div>
          )}

          {/* Add L2 button */}
          <button
            type="button"
            className="flex items-center gap-1.5 px-6 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
            onClick={(e) => {
              e.stopPropagation();
              onAddL2();
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            新建二级菜单
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  WysiwygLeftPanel (main export)                                     */
/* ------------------------------------------------------------------ */

export function WysiwygLeftPanel({
  appId,
  tree,
  activeL2Id,
  onSelectL2,
  onRefresh,
}: WysiwygLeftPanelProps) {
  const tErrors = useTranslations('errorCodes');

  // Toast state (local, matches project pattern)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Expand state — expand all L1 groups by default
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    return new Set(tree.filter((n) => n.type === 'group').map((n) => n.id));
  });

  // Expand newly-added L1 groups on tree changes
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const n of tree) {
        if (n.type === 'group') next.add(n.id);
      }
      return next;
    });
  }, [tree]);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<AdminMenuNode | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ---------- API helpers ---------- */

  const handleRename = useCallback(
    async (id: string, newName: string) => {
      try {
        await apiClient.put(`/menus/${id}`, { name: newName });
        onRefresh();
      } catch (err: unknown) {
        showToast(getApiErrorMessage(err, tErrors, '重命名失败'), 'error');
        throw err; // propagate so InlineEditName stays in edit mode
      }
    },
    [onRefresh, showToast, tErrors],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/menus/${deleteTarget.id}`);
      showToast('已删除', 'success');
      setDeleteTarget(null);
      onRefresh();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, '删除失败'), 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, onRefresh, showToast, tErrors]);

  const handleAddL1 = useCallback(async () => {
    try {
      await apiClient.post('/menus', {
        appId,
        type: 'group',
        name: '新分组',
      });
      onRefresh();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, '创建失败'), 'error');
    }
  }, [appId, onRefresh, showToast, tErrors]);

  const handleAddL2 = useCallback(
    async (parentId: string) => {
      try {
        await apiClient.post('/menus', {
          appId,
          parentId,
          type: 'group',
          name: '新子分组',
        });
        onRefresh();
      } catch (err: unknown) {
        showToast(getApiErrorMessage(err, tErrors, '创建失败'), 'error');
      }
    },
    [appId, onRefresh, showToast, tErrors],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  /* ---------- Filter L1 groups ---------- */

  const l1Groups = tree.filter((n) => n.type === 'group');

  /* ---------- Render ---------- */

  return (
    <div className="flex flex-col h-full w-[240px] shrink-0 bg-muted border-r border-border">
      {/* Scrollable L1 list */}
      <div className="flex-1 overflow-auto">
        {l1Groups.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            暂无菜单分组
          </div>
        ) : (
          l1Groups.map((l1) => (
            <L1Section
              key={l1.id}
              node={l1}
              expanded={expanded.has(l1.id)}
              activeL2Id={activeL2Id}
              onToggleExpand={() => toggleExpand(l1.id)}
              onSelectL2={onSelectL2}
              onRenameL1={(name) => handleRename(l1.id, name)}
              onDeleteL1={() => setDeleteTarget(l1)}
              onRenameL2={(id, name) => handleRename(id, name)}
              onDeleteL2={(l2) => setDeleteTarget(l2)}
              onAddL2={() => handleAddL2(l1.id)}
            />
          ))
        )}
      </div>

      {/* Bottom: add L1 button */}
      <div className="shrink-0 border-t border-border p-3">
        <button
          type="button"
          className="flex items-center justify-center gap-1.5 w-full py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-background rounded-md transition-colors"
          onClick={handleAddL1}
        >
          <Plus className="w-4 h-4" />
          新建一级分组
        </button>
      </div>

      {/* Delete confirm dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">确认删除</h2>
            <p className="text-sm text-muted-foreground mb-4">
              确定要删除「{deleteTarget.name}」吗？
              {deleteTarget.children?.length > 0 && (
                <span className="block mt-1 text-destructive">
                  该分组下有 {deleteTarget.children.length} 个子项，删除可能失败。
                </span>
              )}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none"
                disabled={deleting}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3 py-2 bg-destructive text-white shadow-sm hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none"
              >
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

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
