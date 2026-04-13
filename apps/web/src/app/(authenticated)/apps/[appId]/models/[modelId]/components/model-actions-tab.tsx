'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as LucideIcons from 'lucide-react';
import { Lock, Pencil, Trash2, Plus, Loader2, ChevronRight, ChevronDown, CornerDownRight, GripVertical } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn, getApiErrorMessage } from '@/lib/utils';
import { IconPicker } from '@/components/icon-picker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ActionItem {
  id: string;
  modelId: string;
  code: string;
  name: string;
  icon: string | null;
  category: 'system' | 'custom';
  actionType: 'openUrl' | 'callApi' | 'script';
  displayType: 'button' | 'split' | 'menu';
  position: 'list' | 'detail' | 'both';
  visibility: Record<string, unknown> | null;
  config: Record<string, unknown> | null;
  sortOrder: number;
  parentId: string | null;
  children?: ActionItem[];
}

interface FormState {
  code: string;
  name: string;
  icon: string;
  displayType: 'button' | 'split' | 'menu';
  position: 'list' | 'detail' | 'both';
}

/* ------------------------------------------------------------------ */
/*  Icon helpers: DB stores kebab-case, IconPicker uses PascalCase     */
/* ------------------------------------------------------------------ */

/** kebab-case → PascalCase: "trash-2" → "Trash2" */
function kebabToPascal(name: string): string {
  return name.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

/** PascalCase → kebab-case: "Trash2" → "trash-2" */
function pascalToKebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
}

/** Render a lucide icon from kebab-case name */
function ActionIcon({ name, className }: { name: string | null; className?: string }) {
  if (!name) return null;
  const pascal = kebabToPascal(name);
  const Comp = (LucideIcons as Record<string, any>)[pascal];
  if (!Comp) return null;
  return <Comp className={cn('w-4 h-4', className)} />;
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  icon: '',
  displayType: 'button',
  position: 'both',
};

/* ------------------------------------------------------------------ */
/*  SortableRow — div-based for CSS transform support                  */
/* ------------------------------------------------------------------ */

function SortableRow({ id, isChild, children }: { id: string; isChild?: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={cn(
        'grid grid-cols-[40px_15%_12%_5%_8%_8%_6%_1fr] items-center border-b text-sm hover:bg-muted/30 transition-colors',
        isChild && 'bg-muted/5 border-l-2 border-l-primary/20',
      )}
    >
      {/* Drag handle */}
      <div className="text-muted-foreground flex justify-center" {...attributes} {...listeners}>
        <div style={{ paddingLeft: isChild ? 8 : 0 }}>
          <GripVertical className="w-4 h-4 cursor-grab" />
        </div>
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ModelActionsTab({ modelId, onCountChange }: { modelId: string; onCountChange?: (count: number) => void }) {
  const tActions = useTranslations('actions');
  const tErrors = useTranslations('errorCodes');
  const tCommon = useTranslations('common');

  /* ---------- Data ---------- */
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---------- Dialog ---------- */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<ActionItem | null>(null);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);

  /* ---------- Tree expand ---------- */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  /* ---------- Delete confirm ---------- */
  const [deleteTarget, setDeleteTarget] = useState<ActionItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ---------- Toast ---------- */
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ---------- Fetch ---------- */
  const fetchActions = useCallback(async () => {
    try {
      const { data } = await apiClient.get<ActionItem[]>(`/models/${modelId}/actions`);
      setActions(data);
      onCountChange?.(data.length);
      // Auto-expand parents that have children
      setExpanded(new Set(data.filter((a) => a.children?.length).map((a) => a.id)));
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
    } finally {
      setLoading(false);
    }
  }, [modelId, tErrors, tCommon, showToast, onCountChange]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* ---------- DnD reorder ---------- */
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Build flat visible list
  const flatList = useMemo(() => {
    const list: { action: ActionItem; depth: number; hasChildren: boolean }[] = [];
    for (const a of actions) {
      const hasKids = (a.children?.length ?? 0) > 0;
      list.push({ action: a, depth: 0, hasChildren: hasKids });
      if (hasKids && expanded.has(a.id)) {
        const sorted = [...a.children!].sort((x, y) => x.sortOrder - y.sortOrder);
        for (const c of sorted) list.push({ action: c, depth: 1, hasChildren: false });
      }
    }
    return list;
  }, [actions, expanded]);

  const allVisibleIds = useMemo(() => flatList.map((f) => f.action.id), [flatList]);

  // parentId lookup: top-level → null, child → parentId
  const parentOfItem = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const a of actions) {
      map.set(a.id, null);
      for (const c of a.children ?? []) map.set(c.id, a.id);
    }
    return map;
  }, [actions]);
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeParent = parentOfItem.get(String(active.id));
      const overParent = parentOfItem.get(String(over.id));
      // Only allow reorder within same level
      if (activeParent !== overParent) return;

      if (activeParent === null) {
        // Top-level reorder
        const oldIdx = actions.findIndex((a) => a.id === active.id);
        const newIdx = actions.findIndex((a) => a.id === over.id);
        if (oldIdx === -1 || newIdx === -1) return;
        const reordered = [...actions];
        const [moved] = reordered.splice(oldIdx, 1);
        reordered.splice(newIdx, 0, moved);
        setActions(reordered);
        try {
          await apiClient.put(`/models/${modelId}/actions/sort`, reordered.map((a, i) => ({ id: a.id, sortOrder: i })));
        } catch { fetchActions(); }
      } else {
        // Child reorder
        const newActions = actions.map((a) => {
          if (a.id !== activeParent) return a;
          // Must sort first to match display order before splicing
          const kids = [...(a.children ?? [])].sort((x, y) => x.sortOrder - y.sortOrder);
          const oldIdx = kids.findIndex((c) => c.id === active.id);
          const newIdx = kids.findIndex((c) => c.id === over.id);
          if (oldIdx === -1 || newIdx === -1) return a;
          const [moved] = kids.splice(oldIdx, 1);
          kids.splice(newIdx, 0, moved);
          // Update sortOrder so flatList re-sort keeps the new order
          const updatedKids = kids.map((c, i) => ({ ...c, sortOrder: i }));
          return { ...a, children: updatedKids };
        });
        setActions(newActions);
        const parent = newActions.find((a) => a.id === activeParent);
        if (parent?.children) {
          try {
            await apiClient.put(`/models/${modelId}/actions/sort`, parent.children.map((c, i) => ({ id: c.id, sortOrder: i })));
          } catch { fetchActions(); }
        }
      }
    },
    [actions, modelId, fetchActions, parentOfItem],
  );

  /* ---------- Form helpers ---------- */
  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCreateDialog = (parentId?: string) => {
    setEditingAction(null);
    setCreateParentId(parentId ?? null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEditDialog = (action: ActionItem) => {
    setEditingAction(action);
    setForm({
      code: action.code,
      name: action.name,
      icon: action.icon ? kebabToPascal(action.icon) : '',
      displayType: action.displayType,
      position: action.position,
    });
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingAction(null);
    setCreateParentId(null);
    setForm({ ...EMPTY_FORM });
  };

  /* ---------- Submit ---------- */
  const handleSubmit = async () => {
    if (!form.name.trim() || submitting) return;
    if (!editingAction && !form.code.trim()) return;

    setSubmitting(true);

    const isSystem = editingAction?.category === 'system';
    const iconValue = form.icon.trim() ? pascalToKebab(form.icon.trim()) : null;

    try {
      if (editingAction) {
        const payload: Record<string, unknown> = isSystem
          ? { name: form.name.trim(), icon: iconValue }
          : {
              name: form.name.trim(),
              icon: iconValue,
              displayType: form.displayType,
              position: form.position,
            };
        await apiClient.put(`/actions/${editingAction.id}`, payload);
      } else {
        await apiClient.post(`/models/${modelId}/actions`, {
          code: form.code.trim(),
          name: form.name.trim(),
          icon: iconValue,
          displayType: form.displayType,
          position: form.position,
          ...(createParentId ? { parentId: createParentId } : {}),
        });
      }
      handleDialogClose();
      await fetchActions();
      showToast(tCommon('operationSuccess'), 'success');
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Delete ---------- */
  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/actions/${deleteTarget.id}`);
      setDeleteTarget(null);
      await fetchActions();
      showToast(tCommon('operationSuccess'), 'success');
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
    } finally {
      setDeleting(false);
    }
  };

  /* ---------- Rendering ---------- */
  const isSystemAction = editingAction?.category === 'system';
  const canSubmitForm = form.name.trim() &&
    (editingAction || form.code.trim());

  const renderCells = (action: ActionItem, depth: number, hasChildren: boolean, isSplitOrMenu: boolean, isExpanded: boolean) => (
    <>
      {/* Code */}
      <div className="p-3 min-w-0">
        <div className="flex items-center gap-1" style={{ paddingLeft: depth * 20 }}>
          {hasChildren ? (
            <button type="button" onClick={() => toggleExpand(action.id)} className="shrink-0 w-5 h-5 inline-flex items-center justify-center text-muted-foreground hover:text-foreground">
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : isSplitOrMenu && depth === 0 ? (
            <button type="button" onClick={() => toggleExpand(action.id)} className="shrink-0 w-5 h-5 inline-flex items-center justify-center text-muted-foreground hover:text-foreground">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : depth > 0 ? (
            <CornerDownRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{action.code}</code>
        </div>
      </div>
      {/* Name */}
      <div className="p-3 font-medium truncate">{action.name}</div>
      {/* Icon */}
      <div className="p-3"><ActionIcon name={action.icon} className="text-muted-foreground" /></div>
      {/* Category */}
      <div className="p-3">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${action.category === 'system' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
          {tActions(action.category)}
        </span>
      </div>
      {/* Display type */}
      <div className="p-3 text-muted-foreground">{tActions(action.displayType)}</div>
      {/* Position */}
      <div className="p-3 text-muted-foreground">{tActions(action.position)}</div>
      {/* Actions */}
      <div className="p-3 flex items-center gap-1">
        {isSplitOrMenu && depth === 0 && (
          <button onClick={() => openCreateDialog(action.id)} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors" title={tActions('addChild')}>
            <Plus className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        <button onClick={() => openEditDialog(action)} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors" title={tActions('edit')}>
          <Pencil className="w-4 h-4 text-muted-foreground" />
        </button>
        {action.category === 'system' ? (
          <span className="inline-flex items-center justify-center w-8 h-8" title={tActions('systemNotDeletable')}>
            <Lock className="w-4 h-4 text-muted-foreground/50" />
          </span>
        ) : (
          <button onClick={() => setDeleteTarget(action)} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors" title={tCommon('delete')}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </button>
        )}
      </div>
    </>
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

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div />
        <button
          onClick={() => openCreateDialog()}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          {tActions('addCustom')}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : actions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {tCommon('noData')}
        </div>
      ) : (
        <div className="border rounded-lg overflow-y-auto max-h-[calc(100vh-26rem)]">
          {/* Header */}
          <div className="grid grid-cols-[40px_15%_12%_5%_8%_8%_6%_1fr] items-center border-b bg-muted text-sm font-medium sticky top-0 z-10">
            <div className="p-3" />
            <div className="p-3">{tActions('code')}</div>
            <div className="p-3">{tActions('name')}</div>
            <div className="p-3">{tActions('icon')}</div>
            <div className="p-3">{tActions('category')}</div>
            <div className="p-3">{tActions('displayType')}</div>
            <div className="p-3">{tActions('position')}</div>
            <div className="p-3">{tCommon('actions')}</div>
          </div>

          {/* Rows — single DndContext, all divs */}
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={allVisibleIds} strategy={verticalListSortingStrategy}>
              {flatList.map(({ action, depth, hasChildren }) => {
                const isChild = depth > 0;
                const isSplitOrMenu = action.displayType === 'split' || action.displayType === 'menu';
                const isExpanded = expanded.has(action.id);

                return (
                  <SortableRow key={action.id} id={action.id} isChild={isChild}>
                    {renderCells(action, depth, hasChildren, isSplitOrMenu, isExpanded)}
                  </SortableRow>
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleDialogClose(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingAction ? tActions('edit') : createParentId ? tActions('addChild') : tActions('addCustom')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editingAction ? tActions('edit') : createParentId ? tActions('addChild') : tActions('addCustom')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto py-1 px-0.5">
            {/* Code */}
            <div className="space-y-1.5">
              <Label htmlFor="action-code">{tActions('code')}</Label>
              <Input
                id="action-code"
                value={form.code}
                onChange={(e) => updateField('code', e.target.value)}
                placeholder="gen_contract"
                disabled={!!editingAction}
                className="font-mono text-xs"
                autoFocus={!editingAction}
              />
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="action-name">{tActions('name')}</Label>
              <Input
                id="action-name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                autoFocus={!!editingAction}
              />
            </div>

            {/* Icon */}
            <div className="space-y-1.5">
              <Label>{tActions('icon')}</Label>
              <IconPicker
                value={form.icon}
                onChange={(val) => updateField('icon', val)}
              />
            </div>

            {/* The remaining fields are hidden for system actions */}
            {!isSystemAction && (
              <>
                {/* Display Type */}
                <div className="space-y-1.5">
                  <Label>{tActions('displayType')}</Label>
                  <Select
                    value={form.displayType}
                    onValueChange={(val) => updateField('displayType', val as FormState['displayType'])}
                  >
                    <SelectTrigger className="w-full">
                      {tActions(form.displayType)}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="button">{tActions('button')}</SelectItem>
                      <SelectItem value="split">{tActions('split')}</SelectItem>
                      <SelectItem value="menu">{tActions('menu')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Position */}
                <div className="space-y-1.5">
                  <Label>{tActions('position')}</Label>
                  <Select
                    value={form.position}
                    onValueChange={(val) => updateField('position', val as FormState['position'])}
                  >
                    <SelectTrigger className="w-full">
                      {tActions(form.position)}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="list">{tActions('list')}</SelectItem>
                      <SelectItem value="detail">{tActions('detail')}</SelectItem>
                      <SelectItem value="both">{tActions('both')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleDialogClose} disabled={submitting}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmitForm || submitting}>
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : null}
              {tCommon('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{tCommon('confirmDelete')}</DialogTitle>
            <DialogDescription>
              {deleteTarget ? tActions('confirmDelete', { name: deleteTarget.name }) : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {tCommon('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : null}
              {tCommon('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
