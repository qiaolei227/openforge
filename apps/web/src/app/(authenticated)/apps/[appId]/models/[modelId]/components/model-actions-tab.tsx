'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Lock, Pencil, Trash2, Plus, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  actionType: 'openUrl' | 'callApi' | 'script';
  displayType: 'button' | 'split' | 'menu';
  position: 'list' | 'detail' | 'both';
  config: string;
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  icon: '',
  actionType: 'openUrl',
  displayType: 'button',
  position: 'both',
  config: '',
};
const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ModelActionsTab({ modelId }: { modelId: string }) {
  const tActions = useTranslations('actions');
  const tErrors = useTranslations('errorCodes');
  const tCommon = useTranslations('common');

  /* ---------- Data ---------- */
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---------- Dialog ---------- */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<ActionItem | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);

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
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
    } finally {
      setLoading(false);
    }
  }, [modelId, tErrors, tCommon, showToast]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  /* ---------- Build flat list with indentation ---------- */
  const flatList: { action: ActionItem; depth: number }[] = [];
  const topLevel = actions.filter((a) => !a.parentId);
  for (const action of topLevel) {
    flatList.push({ action, depth: 0 });
    const children = actions.filter((a) => a.parentId === action.id);
    children.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const child of children) {
      flatList.push({ action: child, depth: 1 });
    }
  }

  /* ---------- Form helpers ---------- */
  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCreateDialog = () => {
    setEditingAction(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEditDialog = (action: ActionItem) => {
    setEditingAction(action);
    setForm({
      code: action.code,
      name: action.name,
      icon: action.icon ?? '',
      actionType: action.actionType,
      displayType: action.displayType,
      position: action.position,
      config: action.config ? JSON.stringify(action.config, null, 2) : '',
    });
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingAction(null);
    setForm({ ...EMPTY_FORM });
  };

  /* ---------- Submit ---------- */
  const handleSubmit = async () => {
    if (!form.name.trim() || submitting) return;
    if (!editingAction && !SNAKE_CASE_RE.test(form.code)) return;

    setSubmitting(true);

    // Parse config JSON
    let configObj: Record<string, unknown> | null = null;
    if (form.config.trim()) {
      try {
        configObj = JSON.parse(form.config);
      } catch {
        showToast('Invalid JSON', 'error');
        setSubmitting(false);
        return;
      }
    }

    const isSystem = editingAction?.category === 'system';

    try {
      if (editingAction) {
        const payload: Record<string, unknown> = isSystem
          ? { name: form.name.trim(), icon: form.icon.trim() || null }
          : {
              name: form.name.trim(),
              icon: form.icon.trim() || null,
              actionType: form.actionType,
              displayType: form.displayType,
              position: form.position,
              config: configObj,
            };
        await apiClient.put(`/actions/${editingAction.id}`, payload);
      } else {
        await apiClient.post(`/models/${modelId}/actions`, {
          code: form.code.trim(),
          name: form.name.trim(),
          icon: form.icon.trim() || null,
          actionType: form.actionType,
          displayType: form.displayType,
          position: form.position,
          config: configObj,
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
    (editingAction || SNAKE_CASE_RE.test(form.code)) &&
    form.actionType !== 'script';

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
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-1.5" />
          {tActions('addCustom')}
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : flatList.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {tCommon('noData')}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-medium">{tActions('code')}</th>
                <th className="p-3 text-left font-medium">{tActions('name')}</th>
                <th className="p-3 text-left font-medium">{tActions('icon')}</th>
                <th className="p-3 text-left font-medium">{tActions('category')}</th>
                <th className="p-3 text-left font-medium">{tActions('displayType')}</th>
                <th className="p-3 text-left font-medium">{tActions('position')}</th>
                <th className="p-3 text-right font-medium">{tCommon('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {flatList.map(({ action, depth }) => (
                <tr key={action.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <div style={{ paddingLeft: depth * 24 }}>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                        {action.code}
                      </code>
                    </div>
                  </td>
                  <td className="p-3 font-medium">{action.name}</td>
                  <td className="p-3">
                    {action.icon && (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                        {action.icon}
                      </code>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                      action.category === 'system'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    }`}>
                      {tActions(action.category)}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {tActions(action.displayType)}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {tActions(action.position)}
                  </td>
                  <td className="p-3 text-right">
                    {action.category === 'system' ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditDialog(action)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
                          title={tActions('edit')}
                        >
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <span
                          className="inline-flex items-center justify-center w-8 h-8"
                          title={tActions('systemNotDeletable')}
                        >
                          <Lock className="w-4 h-4 text-muted-foreground/50" />
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditDialog(action)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
                          title={tActions('edit')}
                        >
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(action)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
                          title={tCommon('delete')}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleDialogClose(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingAction ? tActions('edit') : tActions('addCustom')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editingAction ? tActions('edit') : tActions('addCustom')}
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
              {!editingAction && form.code && !SNAKE_CASE_RE.test(form.code) && (
                <p className="text-xs text-destructive">snake_case only (a-z, 0-9, _)</p>
              )}
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
              <Label htmlFor="action-icon">{tActions('icon')}</Label>
              <Input
                id="action-icon"
                value={form.icon}
                onChange={(e) => updateField('icon', e.target.value)}
                placeholder="file-text"
                className="font-mono text-xs"
              />
            </div>

            {/* The remaining fields are hidden for system actions */}
            {!isSystemAction && (
              <>
                {/* Action Type */}
                <div className="space-y-1.5">
                  <Label>{tActions('actionType')}</Label>
                  <Select
                    value={form.actionType}
                    onValueChange={(val) => updateField('actionType', val as FormState['actionType'])}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openUrl">{tActions('openUrl')}</SelectItem>
                      <SelectItem value="callApi">{tActions('callApi')}</SelectItem>
                      <SelectItem value="script" disabled>
                        <span title={tActions('scriptDisabled')}>{tActions('script')}</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Display Type */}
                <div className="space-y-1.5">
                  <Label>{tActions('displayType')}</Label>
                  <Select
                    value={form.displayType}
                    onValueChange={(val) => updateField('displayType', val as FormState['displayType'])}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
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
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="list">{tActions('list')}</SelectItem>
                      <SelectItem value="detail">{tActions('detail')}</SelectItem>
                      <SelectItem value="both">{tActions('both')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Config JSON */}
                <div className="space-y-1.5">
                  <Label htmlFor="action-config">{tActions('config')}</Label>
                  <Textarea
                    id="action-config"
                    value={form.config}
                    onChange={(e) => updateField('config', e.target.value)}
                    rows={4}
                    className="font-mono text-xs"
                    placeholder={'{\n  "url": "https://..."\n}'}
                  />
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
