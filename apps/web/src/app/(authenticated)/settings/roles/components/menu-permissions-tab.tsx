'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Save } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
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

function flatten(nodes: MenuNode[], depth = 0, out: Array<{ node: MenuNode; depth: number }> = []): Array<{ node: MenuNode; depth: number }> {
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (n.children?.length) flatten(n.children, depth + 1, out);
  }
  return out;
}

export function MenuPermissionsTab({ roleId }: { roleId: string }) {
  const tErrors = useTranslations('errorCodes');
  const tMP = useTranslations('menuPermissions');

  const [tree, setTree] = useState<MenuNode[]>([]);
  const [visible, setVisible] = useState<Set<string>>(new Set()); // menuIds with view permission
  const [savedVisible, setSavedVisible] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const menuTypeLabel = (type: MenuType) => {
    const key = `type${type.charAt(0).toUpperCase()}${type.slice(1)}` as Parameters<typeof tMP>[0];
    return tMP.has(key) ? tMP(key) : type;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [treeRes, permsRes] = await Promise.all([
        apiClient.get<MenuNode[]>('/menus/admin/tree'),
        apiClient.get<MenuPermissionRow[]>(`/roles/${roleId}/menu-permissions`),
      ]);
      setTree(treeRes.data);
      const ids = new Set<string>();
      for (const row of permsRes.data) {
        if (row.permissions.includes('view')) ids.add(row.menuId);
      }
      setVisible(ids);
      setSavedVisible(new Set(ids));
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tMP('fetchFailed')), 'error');
    } finally {
      setLoading(false);
    }
  }, [roleId, tErrors, tMP, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (menuId: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(menuId)) {
        next.delete(menuId);
      } else {
        next.add(menuId);
      }
      setDirty(setsEqual(next, savedVisible) === false);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const items = Array.from(visible).map((menuId) => ({
        menuId,
        permissions: ['view'],
      }));
      await apiClient.put(`/roles/${roleId}/menu-permissions`, { items });
      setSavedVisible(new Set(visible));
      setDirty(false);
      showToast(tMP('saved'), 'success');
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tMP('saveFailed')), 'error');
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

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {tMP('description')}
        </p>
        <button
          disabled={!dirty || saving}
          onClick={save}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              {tMP('saving')}
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-1.5" />
              {tMP('save')}
            </>
          )}
        </button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left font-medium">{tMP('menuItem')}</th>
              <th className="p-3 text-left font-medium w-16">{tMP('type')}</th>
              <th className="p-3 text-center font-medium w-20">{tMP('visible')}</th>
            </tr>
          </thead>
          <tbody>
            {flatNodes.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-8 text-center text-muted-foreground">
                  {tMP('empty')}
                </td>
              </tr>
            ) : (
              flatNodes.map(({ node, depth }) => {
                const isDivider = node.type === 'divider';
                const checked = visible.has(node.id);
                return (
                  <tr
                    key={node.id}
                    className={`border-b transition-colors ${
                      isDivider ? 'bg-muted/20' : 'hover:bg-muted/30'
                    }`}
                  >
                    <td className="p-3">
                      <span
                        style={{ paddingLeft: `${depth * 20}px` }}
                        className={isDivider ? 'text-muted-foreground italic text-xs' : ''}
                      >
                        {isDivider ? tMP('divider') : node.name}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-xs">
                        {menuTypeLabel(node.type)}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {isDivider ? (
                        <span className="text-muted-foreground/40">—</span>
                      ) : (
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggle(node.id)}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {dirty && (
        <p className="text-xs text-amber-600 mt-2">{tMP('unsaved')}</p>
      )}
    </div>
  );
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
