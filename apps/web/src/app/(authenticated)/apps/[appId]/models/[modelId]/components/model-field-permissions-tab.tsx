'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type Access = 'editable' | 'readonly' | 'hidden';

interface Field {
  id: string;
  name: string;
  columnName: string;
  fieldType: string;
  isSystem: boolean;
}

interface Role {
  id: string;
  code: string;
  name: string;
}

interface FieldPermission {
  id: string;
  fieldId: string;
  access: Access;
}

interface RoleListResponse {
  items: Role[];
  total: number;
}

const ACCESS_OPTIONS: { value: Access; label: string }[] = [
  { value: 'editable', label: '可编辑' },
  { value: 'readonly', label: '只读' },
  { value: 'hidden', label: '隐藏' },
];

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';

export function ModelFieldPermissionsTab({
  modelId,
  fields,
}: {
  modelId: string;
  fields: Field[];
}) {
  const tErrors = useTranslations('errorCodes');

  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [permMap, setPermMap] = useState<Record<string, Access>>({});
  const [permsLoading, setPermsLoading] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);

  // --- toast ---
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load all roles on mount
  useEffect(() => {
    const load = async () => {
      setRolesLoading(true);
      try {
        const { data } = await apiClient.get<RoleListResponse>('/roles?pageSize=200');
        setRoles(data.items ?? []);
      } catch {
        // silently fail — if roles can't load, show empty dropdown
      } finally {
        setRolesLoading(false);
      }
    };
    load();
  }, []);

  // Load permissions when role changes
  useEffect(() => {
    if (!selectedRoleId) {
      setPermMap({});
      return;
    }

    const load = async () => {
      setPermsLoading(true);
      setPermMap({});
      try {
        const { data } = await apiClient.get<FieldPermission[]>(
          `/field-permissions?roleId=${selectedRoleId}&modelId=${modelId}`,
        );
        const map: Record<string, Access> = {};
        for (const perm of data) {
          map[perm.fieldId] = perm.access;
        }
        setPermMap(map);
      } catch (err: unknown) {
        showToast(getApiErrorMessage(err, tErrors, '加载字段权限失败'), 'error');
      } finally {
        setPermsLoading(false);
      }
    };

    load();
  }, [selectedRoleId, modelId, tErrors, showToast]);

  // Live-save: optimistic update + rollback on error
  const handleChange = async (fieldId: string, newAccess: Access) => {
    const prevAccess = permMap[fieldId] ?? 'editable';
    // Optimistic update
    setPermMap((prev) => ({ ...prev, [fieldId]: newAccess }));
    setSavingField(fieldId);

    try {
      if (newAccess === 'editable') {
        // Delete any existing permission row (restore to default)
        await apiClient.delete('/field-permissions', {
          data: { roleId: selectedRoleId, fieldId },
        });
      } else {
        await apiClient.put('/field-permissions', {
          roleId: selectedRoleId,
          fieldId,
          access: newAccess,
        });
      }
    } catch (err: unknown) {
      // Rollback
      setPermMap((prev) => ({ ...prev, [fieldId]: prevAccess }));
      showToast(getApiErrorMessage(err, tErrors, '保存失败'), 'error');
    } finally {
      setSavingField(null);
    }
  };

  const visibleFields = fields.filter((f) => !f.isSystem);

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

      {/* Role Selector */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 max-w-sm">
          <label className="text-sm font-medium block mb-1.5">选择角色</label>
          {rolesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              加载中…
            </div>
          ) : (
            <select
              className={inputClass}
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
            >
              <option value="">— 请选择角色 —</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}（{role.code}）
                </option>
              ))}
            </select>
          )}
        </div>
        {selectedRoleId && !permsLoading && (
          <p className="text-sm text-muted-foreground mt-5">
            {visibleFields.length} 个用户字段
          </p>
        )}
      </div>

      {/* Fields Table */}
      {!selectedRoleId ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          请先选择一个角色以配置字段权限
        </div>
      ) : permsLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : visibleFields.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          该模型暂无用户字段
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-medium">字段名称</th>
                <th className="p-3 text-left font-medium">列名</th>
                <th className="p-3 text-left font-medium w-24">类型</th>
                <th className="p-3 text-center font-medium w-28">可编辑</th>
                <th className="p-3 text-center font-medium w-28">只读</th>
                <th className="p-3 text-center font-medium w-28">隐藏</th>
              </tr>
            </thead>
            <tbody>
              {visibleFields.map((field) => {
                const currentAccess: Access = permMap[field.id] ?? 'editable';
                const isSaving = savingField === field.id;
                return (
                  <tr key={field.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">
                      <div className="flex items-center gap-2">
                        {field.name}
                        {isSaving && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                        {field.columnName}
                      </code>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-xs">
                        {field.fieldType}
                      </span>
                    </td>
                    {ACCESS_OPTIONS.map(({ value }) => (
                      <td key={value} className="p-3 text-center">
                        <input
                          type="radio"
                          name={`fp-${field.id}`}
                          value={value}
                          checked={currentAccess === value}
                          onChange={() => handleChange(field.id, value)}
                          disabled={isSaving}
                          className="h-4 w-4 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {selectedRoleId && visibleFields.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3">
          点击单选按钮立即保存。<strong>可编辑</strong>为默认状态（无限制），<strong>只读</strong>使字段不可修改，<strong>隐藏</strong>完全隐藏该字段。
        </p>
      )}
    </div>
  );
}
