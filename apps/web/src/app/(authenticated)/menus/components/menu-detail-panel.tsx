'use client';

import { useEffect, useState } from 'react';
import { Lock, Loader2, Trash2, Save, Info } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { AdminMenuNode } from '../page';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  menu: AdminMenuNode | null;
  onSaved: (updated: AdminMenuNode) => void;
  onDeleted: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none';
const btnDestructive =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3 py-2 bg-destructive text-white shadow-sm hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none';
const btnOutline =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none';

/* ------------------------------------------------------------------ */
/*  Type labels                                                        */
/* ------------------------------------------------------------------ */

const TYPE_LABELS: Record<string, string> = {
  group: '分组',
  model: '业务菜单',
  page: '系统页面',
  link: '外链',
  divider: '分割线',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function MenuDetailPanel({ menu, onSaved, onDeleted, showToast }: Props) {
  const tErrors = useTranslations('errorCodes');
  const tCommon = useTranslations('common');

  // Form state
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [icon, setIcon] = useState('');
  const [visible, setVisible] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  // Submit state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sync form when selected menu changes
  useEffect(() => {
    if (!menu) return;
    setName(menu.name ?? '');
    setNameEn(menu.nameEn ?? '');
    setIcon(menu.icon ?? '');
    setVisible(menu.visible ?? true);
    setSortOrder(menu.sortOrder ?? 0);
    setSaveError('');
    setDeleteConfirm(false);
  }, [menu]);

  if (!menu) {
    return (
      <div className="border border-border rounded-lg flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
        <Info className="w-8 h-8 opacity-30" />
        <span>点击左侧菜单项查看属性</span>
      </div>
    );
  }

  const isCoded = menu.source === 'coded';
  const isDivider = menu.type === 'divider';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        visible,
        sortOrder,
      };

      if (!isDivider) {
        payload.name = name;
        if (nameEn !== undefined) payload.nameEn = nameEn || null;
        payload.icon = icon || null;
      }

      const { data } = await apiClient.put<AdminMenuNode>(`/menus/${menu.id}`, payload);
      showToast('已保存', 'success');
      // Merge updated fields into the current node (children are not returned by PUT)
      onSaved({
        ...menu,
        name: data.name ?? menu.name,
        nameEn: data.nameEn ?? menu.nameEn,
        icon: data.icon ?? menu.icon,
        visible: data.visible ?? menu.visible,
        sortOrder: data.sortOrder ?? menu.sortOrder,
      });
    } catch (err: unknown) {
      setSaveError(getApiErrorMessage(err, tErrors, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/menus/${menu.id}`);
      showToast('菜单已删除', 'success');
      onDeleted();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, '删除失败'), 'error');
      setDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="border border-border rounded-lg flex flex-col overflow-hidden">
      {/* Panel header */}
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-3 border-b border-border shrink-0',
          isCoded ? 'bg-muted/30' : 'bg-background',
        )}
      >
        <span className="font-medium text-sm flex-1 truncate">
          {isDivider ? '分割线' : menu.name}
        </span>
        {isCoded && (
          <span
            className="flex items-center gap-1 text-xs text-muted-foreground"
            title="此菜单由系统代码定义，部分属性不可修改"
          >
            <Lock className="w-3.5 h-3.5" />
            系统
          </span>
        )}
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-auto p-4">
        <form onSubmit={handleSave} className="space-y-4">
          {/* code (read-only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              编码
            </label>
            <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/30 px-3 py-1 text-sm">
              <code className="font-mono text-xs">{menu.code}</code>
            </div>
          </div>

          {/* type (read-only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              类型
            </label>
            <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/30 px-3 py-1 text-sm">
              <span>{TYPE_LABELS[menu.type] ?? menu.type}</span>
            </div>
          </div>

          {/* name — editable unless divider */}
          {!isDivider && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  菜单名称 <span className="text-destructive">*</span>
                </label>
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="菜单显示名称"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  英文名称{' '}
                  <span className="text-xs text-muted-foreground">(可选)</span>
                </label>
                <input
                  className={inputClass}
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="English name"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  图标{' '}
                  <span className="text-xs text-muted-foreground">
                    (Lucide 图标名，可选)
                  </span>
                </label>
                <input
                  className={inputClass}
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="如：ShoppingCart、Users"
                />
              </div>
            </>
          )}

          {/* sortOrder */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">排序值</label>
            <input
              className={inputClass}
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              placeholder="数字越小越靠前"
            />
          </div>

          {/* visible toggle */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium flex-1">显示菜单</label>
            <button
              type="button"
              role="switch"
              aria-checked={visible}
              onClick={() => setVisible((v) => !v)}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
                visible ? 'bg-primary' : 'bg-input',
              )}
            >
              <span
                className={cn(
                  'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
                  visible ? 'translate-x-4' : 'translate-x-0',
                )}
              />
            </button>
          </div>

          {/* model type: target info (read-only in P2.1) */}
          {menu.type === 'model' && (
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                关联信息
              </p>
              {menu.targetAppCode && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground w-20 shrink-0">应用编码</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                    {menu.targetAppCode}
                  </code>
                </div>
              )}
              {menu.targetModelCode && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground w-20 shrink-0">模型编码</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                    {menu.targetModelCode}
                  </code>
                </div>
              )}
              {menu.targetRoute && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground w-20 shrink-0">路由</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[180px]">
                    {menu.targetRoute}
                  </code>
                </div>
              )}
            </div>
          )}

          {/* link type: targetUrl */}
          {menu.type === 'link' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">目标 URL</label>
              {isCoded ? (
                <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/30 px-3 py-1 text-sm">
                  <span className="truncate text-xs">{menu.targetUrl ?? '-'}</span>
                </div>
              ) : (
                <input
                  className={inputClass}
                  type="url"
                  value={menu.targetUrl ?? ''}
                  readOnly
                  disabled
                  placeholder="创建后请通过 PUT 接口修改"
                />
              )}
            </div>
          )}

          {saveError && (
            <p className="text-sm text-destructive">{saveError}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1" />
                  保存
                </>
              )}
            </button>

            {/* Delete: only for designer menus */}
            {!isCoded && (
              <>
                {!deleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(true)}
                    className={btnDestructive}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    删除
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className={btnDestructive}
                    >
                      {deleting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        '确认删除'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(false)}
                      disabled={deleting}
                      className={btnOutline}
                    >
                      取消
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </form>

        {/* Coded menu info note */}
        {isCoded && (
          <div className="mt-4 rounded-md bg-muted/30 border border-border p-3">
            <p className="text-xs text-muted-foreground">
              此菜单由系统代码定义（source=coded），可修改显示名称、图标、排序和显示/隐藏；不可删除。跨层级移动请联系开发配置。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
