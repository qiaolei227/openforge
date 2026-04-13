'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { cn, getApiErrorMessage } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { useTranslations } from 'next-intl';
import type { AdminMenuNode } from '../menu-tab';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WysiwygItemEditorProps {
  item: AdminMenuNode | null;
  onClose: () => void;
  onSave: () => void;
}

interface ModelInfo {
  id: string;
  name: string;
  code: string;
}

/* ------------------------------------------------------------------ */
/*  Style constants                                                     */
/* ------------------------------------------------------------------ */

const inputBase =
  'px-3 py-1.5 border border-border rounded-md text-sm bg-background outline-none focus:border-primary w-full transition-colors';

const inputReadonly =
  'px-3 py-1.5 border border-border rounded-md text-sm bg-muted text-muted-foreground w-full cursor-not-allowed';


/* ------------------------------------------------------------------ */
/*  View-type options                                                   */
/* ------------------------------------------------------------------ */

const VIEW_TYPE_OPTIONS = [
  { value: 'list', label: '默认列表' },
  { value: 'form', label: '默认表单' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function WysiwygItemEditor({
  item,
  onClose,
  onSave,
}: WysiwygItemEditorProps) {
  const tErrors = useTranslations('errorCodes');

  // Editable fields
  const [editedName, setEditedName] = useState('');
  const [targetViewType, setTargetViewType] = useState('list');

  // Model info for display
  const [modelCode, setModelCode] = useState<string>('');
  const [modelLoading, setModelLoading] = useState(false);

  // Action state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /* Sync state when item changes */
  useEffect(() => {
    if (!item) return;
    setEditedName(item.name);
    setTargetViewType(item.targetViewType ?? 'list');
    setError('');
  }, [item]);

  /* Fetch model code when item's targetModelId changes */
  useEffect(() => {
    if (!item?.targetModelId) {
      setModelCode('');
      return;
    }
    setModelLoading(true);
    apiClient
      .get<ModelInfo>(`/models/${item.targetModelId}`)
      .then(({ data }) => setModelCode(data.code ?? ''))
      .catch(() => setModelCode(''))
      .finally(() => setModelLoading(false));
  }, [item?.targetModelId]);

  /* Save handler */
  const handleSave = useCallback(async () => {
    if (!item) return;
    const name = editedName.trim();
    if (!name) {
      setError('菜单名称不能为空');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.put(`/menus/${item.id}`, { name, targetViewType });
      onSave();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, tErrors, '保存失败'));
    } finally {
      setSaving(false);
    }
  }, [item, editedName, targetViewType, onSave, tErrors]);

  /* Keyboard shortcut: Escape to close */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!item) return null;

  const isModelType = item.type === 'model';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-card border rounded-lg p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">编辑菜单项</h2>

        <div className="space-y-4">
          {/* 菜单名称 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              菜单名称 <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              className={inputBase}
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
              disabled={saving}
              autoFocus
            />
          </div>

          {/* 菜单编码 (read-only) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">菜单编码</label>
            <input
              type="text"
              className={inputReadonly}
              value={item.code}
              readOnly
            />
          </div>

          {/* 目标模型 (read-only) */}
          {isModelType && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">目标模型</label>
              <div className="relative">
                <input
                  type="text"
                  className={inputReadonly}
                  value={modelLoading ? '加载中…' : (modelCode || item.targetModelId || '—')}
                  readOnly
                />
                {modelLoading && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
          )}

          {/* 发布视图 */}
          {isModelType && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">发布视图</label>
              <select
                className={cn(inputBase, 'cursor-pointer')}
                value={targetViewType}
                onChange={(e) => setTargetViewType(e.target.value)}
                disabled={saving}
              >
                {VIEW_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2">
            {/* Cancel */}
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none"
            >
              取消
            </button>

            {/* Save */}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  保存中
                </span>
              ) : (
                '保存'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
