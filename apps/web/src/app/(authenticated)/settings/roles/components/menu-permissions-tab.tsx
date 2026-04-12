'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Save } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { MENU_ACTIONS } from '@openforge/shared';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';

type MenuType = 'group' | 'model' | 'page' | 'link' | 'divider';

interface MenuNode {
  id: string;
  code: string;
  type: MenuType;
  name: string;
  parentId: string | null;
  sortOrder: number;
  children: MenuNode[];
}

interface MenuPermissionRow {
  menuId: string;
  menuCode: string;
  permissions: string[];
  menu: { id: string; code: string; type: string; name: string };
}

const ACTIONS = Object.values(MENU_ACTIONS); // ['view', 'create', 'edit', 'delete', 'archive']

const ACTION_LABELS: Record<string, string> = {
  view: '查看',
  create: '新建',
  edit: '编辑',
  delete: '删除',
  archive: '归档',
};

function flatten(nodes: MenuNode[], depth = 0, out: Array<{ node: MenuNode; depth: number }> = []): Array<{ node: MenuNode; depth: number }> {
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (n.children?.length) flatten(n.children, depth + 1, out);
  }
  return out;
}

function actionsForType(type: MenuType): string[] {
  if (type === 'model') return ACTIONS;
  if (type === 'group' || type === 'page' || type === 'link') return ['view'];
  return []; // divider
}

const menuTypeLabel: Record<MenuType, string> = {
  group: '分组',
  model: '模型',
  page: '页面',
  link: '链接',
  divider: '分隔线',
};

export function MenuPermissionsTab({ roleId }: { roleId: string }) {
  const tErrors = useTranslations('errorCodes');
  const tCommon = useTranslations('common');

  const [tree, setTree] = useState<MenuNode[]>([]);
  const [perms, setPerms] = useState<Record<string, string[]>>({}); // menuId → actions[]
  const [savedPerms, setSavedPerms] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // --- toast ---
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [treeRes, permsRes] = await Promise.all([
        apiClient.get<MenuNode[]>('/menus/admin/tree'),
        apiClient.get<MenuPermissionRow[]>(`/roles/${roleId}/menu-permissions`),
      ]);
      setTree(treeRes.data);
      const map: Record<string, string[]> = {};
      for (const row of permsRes.data) {
        map[row.menuId] = row.permissions;
      }
      setPerms(map);
      setSavedPerms(map);
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, '加载菜单权限失败'), 'error');
    } finally {
      setLoading(false);
    }
  }, [roleId, tErrors, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (menuId: string, action: string) => {
    setPerms((prev) => {
      const current = prev[menuId] ?? [];
      const next = current.includes(action)
        ? current.filter((a) => a !== action)
        : [...current, action];
      const updated = { ...prev, [menuId]: next };
      setDirty(JSON.stringify(updated) !== JSON.stringify(savedPerms));
      return updated;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      // Build items: only menus with at least one permission
      const items = Object.entries(perms)
        .filter(([, actions]) => actions.length > 0)
        .map(([menuId, permissions]) => ({ menuId, permissions }));

      await apiClient.put(`/roles/${roleId}/menu-permissions`, { items });
      setSavedPerms({ ...perms });
      setDirty(false);
      showToast('菜单权限已保存', 'success');
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, '保存失败'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const flatNodes = flatten(tree);

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
        <p className="text-sm text-muted-foreground">
          配置此角色可访问的菜单项及操作权限
        </p>
        <button
          disabled={!dirty || saving}
          onClick={save}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              保存中…
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-1.5" />
              保存权限
            </>
          )}
        </button>
      </div>

      {/* Permissions Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left font-medium">菜单项</th>
              <th className="p-3 text-left font-medium w-16">类型</th>
              {ACTIONS.map((action) => (
                <th key={action} className="p-3 text-center font-medium w-20">
                  {ACTION_LABELS[action]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flatNodes.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  暂无菜单配置
                </td>
              </tr>
            ) : (
              flatNodes.map(({ node, depth }) => {
                const enabledActions = actionsForType(node.type);
                const nodePerms = perms[node.id] ?? [];
                return (
                  <tr
                    key={node.id}
                    className={`border-b transition-colors ${
                      node.type === 'divider'
                        ? 'bg-muted/20'
                        : 'hover:bg-muted/30'
                    }`}
                  >
                    <td className="p-3">
                      <span
                        style={{ paddingLeft: `${depth * 20}px` }}
                        className={`${node.type === 'divider' ? 'text-muted-foreground italic text-xs' : ''}`}
                      >
                        {node.type === 'divider' ? '— 分隔线 —' : node.name}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-xs">
                        {menuTypeLabel[node.type] ?? node.type}
                      </span>
                    </td>
                    {ACTIONS.map((action) => {
                      const enabled = enabledActions.includes(action);
                      const checked = nodePerms.includes(action);
                      return (
                        <td key={action} className="p-3 text-center">
                          {enabled ? (
                            <div className="flex items-center justify-center">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggle(node.id, action)}
                              />
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {dirty && (
        <p className="text-xs text-amber-600 mt-2">有未保存的修改，请点击「保存权限」提交</p>
      )}
    </div>
  );
}
