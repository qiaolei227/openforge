'use client';

/**
 * NOTE: This tab calls GET /models (gated by sys:designer view permission) to list models.
 * Users with only sys:roles permission will see an error if they don't also have
 * sys:designer view. For P2.1 MVP, we accept this — admins (is_admin=true) bypass all checks.
 * Resolution: Option A — require users managing roles to also have sys:designer view.
 */

import { useEffect, useState, useCallback } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type Access = 'editable' | 'readonly' | 'hidden';

interface Model {
  id: string;
  name: string;
  code: string;
  app?: { id: string; name: string };
}

interface Field {
  id: string;
  name: string;
  columnName: string;
  fieldType: string;
  isSystem: boolean;
}

interface FieldPermission {
  id: string;
  fieldId: string;
  access: Access;
}

interface ModelListResponse {
  data: Model[];
  total: number;
}

const ACCESS_OPTIONS: { value: Access; label: string }[] = [
  { value: 'editable', label: '可编辑' },
  { value: 'readonly', label: '只读' },
  { value: 'hidden', label: '隐藏' },
];

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';

export function FieldPermissionsTab({ roleId }: { roleId: string }) {
  const tErrors = useTranslations('errorCodes');
  const tCommon = useTranslations('common');

  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState('');

  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [fields, setFields] = useState<Field[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);

  // permMap: fieldId → Access (defaults to 'editable' if no row exists)
  const [permMap, setPermMap] = useState<Record<string, Access>>({});
  const [savingField, setSavingField] = useState<string | null>(null);

  // --- toast ---
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load all models on mount
  useEffect(() => {
    const load = async () => {
      setModelsLoading(true);
      setModelsError('');
      try {
        const { data } = await apiClient.get<ModelListResponse>('/models?pageSize=500');
        setModels(data.data);
      } catch (err: unknown) {
        setModelsError(getApiErrorMessage(err, tErrors, '加载模型列表失败'));
      } finally {
        setModelsLoading(false);
      }
    };
    load();
  }, [tErrors]);

  // Load fields + permissions when model changes
  useEffect(() => {
    if (!selectedModelId) {
      setFields([]);
      setPermMap({});
      return;
    }

    const load = async () => {
      setFieldsLoading(true);
      setFields([]);
      setPermMap({});
      try {
        const [fieldsRes, permsRes] = await Promise.all([
          apiClient.get<Field[]>(`/models/${selectedModelId}/fields`),
          apiClient.get<FieldPermission[]>(
            `/field-permissions?roleId=${roleId}&modelId=${selectedModelId}`,
          ),
        ]);

        // Filter out system fields
        const userFields = fieldsRes.data.filter((f) => !f.isSystem);
        setFields(userFields);

        // Build perm map
        const map: Record<string, Access> = {};
        for (const perm of permsRes.data) {
          map[perm.fieldId] = perm.access;
        }
        setPermMap(map);
      } catch (err: unknown) {
        showToast(getApiErrorMessage(err, tErrors, '加载字段权限失败'), 'error');
      } finally {
        setFieldsLoading(false);
      }
    };

    load();
  }, [selectedModelId, roleId, tErrors, showToast]);

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
          data: { roleId, fieldId },
        });
      } else {
        await apiClient.put('/field-permissions', {
          roleId,
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

      {/* Model Selector */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 max-w-sm">
          <label className="text-sm font-medium block mb-1.5">选择模型</label>
          {modelsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              加载中…
            </div>
          ) : modelsError ? (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />
              {modelsError}
            </div>
          ) : (
            <select
              className={inputClass}
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
            >
              <option value="">— 请选择模型 —</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.app ? `${model.app.name} / ` : ''}{model.name}（{model.code}）
                </option>
              ))}
            </select>
          )}
        </div>
        {selectedModelId && !fieldsLoading && (
          <p className="text-sm text-muted-foreground mt-5">
            {fields.length} 个用户字段
          </p>
        )}
      </div>

      {/* Fields Table */}
      {!selectedModelId ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          请先选择一个模型以配置字段权限
        </div>
      ) : fieldsLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : fields.length === 0 ? (
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
              {fields.map((field) => {
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
                          name={`field-${field.id}`}
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
      {selectedModelId && fields.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3">
          点击单选按钮立即保存。<strong>可编辑</strong>为默认状态（无限制），<strong>只读</strong>使字段不可修改，<strong>隐藏</strong>完全隐藏该字段。
        </p>
      )}
    </div>
  );
}
