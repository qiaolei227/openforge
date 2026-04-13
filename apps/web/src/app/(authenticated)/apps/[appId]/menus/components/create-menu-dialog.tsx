'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { IconPicker } from '@/components/icon-picker';
import { TreeSelect } from '@openforge/ui';
import { ViewPicker, type ViewSelection } from './view-picker';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ModelItem {
  id: string;
  name: string;
  code: string;
}

interface ModelListResponse {
  data: ModelItem[];
  total: number;
}

type CreateType = 'group' | 'model' | 'link' | 'divider';

interface GroupOption {
  id: string;
  parentId: string | null;
  label: string;
}

interface Props {
  type: CreateType | null;
  open: boolean;
  onClose: () => void;
  appId: string;
  groups: GroupOption[];
  onCreated: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
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
/*  Label map                                                          */
/* ------------------------------------------------------------------ */

const TYPE_LABELS: Record<CreateType, string> = {
  group: '新建分组',
  model: '新建业务菜单',
  link: '新建外链',
  divider: '新建分割线',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CreateMenuDialog({
  type,
  open,
  onClose,
  appId,
  groups,
  onCreated,
  showToast,
}: Props) {
  const tErrors = useTranslations('errorCodes');
  const tCommon = useTranslations('common');

  // Form fields
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [parentId, setParentId] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  // For model type: track model selection + view selection
  const [selectedModelId, setSelectedModelId] = useState('');
  const [viewSelection, setViewSelection] = useState<ViewSelection | null>(null);

  // Data
  const [models, setModels] = useState<ModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Submit state
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;
    setName('');
    setIcon('');
    setParentId('');
    setTargetUrl('');
    setSelectedModelId('');
    setViewSelection(null);
    setError('');
  }, [open]);

  // Load models for the current app when type = 'model' and dialog is open
  useEffect(() => {
    if (!open || type !== 'model') return;
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
  }, [open, type, appId]);

  // Reset view selection when model changes
  useEffect(() => {
    setViewSelection(null);
  }, [selectedModelId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) return;
    setError('');
    setSubmitting(true);

    try {
      // Build payload based on type
      const payload: Record<string, unknown> = { type, appId };
      if (parentId) payload.parentId = parentId;

      if (type === 'divider') {
        // Divider has no visible name but backend requires it
        payload.name = '---';
      } else {
        payload.name = name;
        if (icon) payload.icon = icon;
      }

      if (type === 'model') {
        if (!selectedModelId) {
          setError('请选择模型');
          setSubmitting(false);
          return;
        }
        if (!viewSelection) {
          setError('请选择视图');
          setSubmitting(false);
          return;
        }
        payload.targetModelId = selectedModelId;
        payload.targetViewType = viewSelection.targetViewType;
        if (viewSelection.targetViewId) {
          payload.targetViewId = viewSelection.targetViewId;
        }
      }

      if (type === 'link') {
        if (!targetUrl) {
          setError('请输入目标 URL');
          setSubmitting(false);
          return;
        }
        payload.targetUrl = targetUrl;
      }

      await apiClient.post('/menus', payload);
      showToast('菜单已创建', 'success');
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, tErrors, '创建失败'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !type) return null;

  const title = TYPE_LABELS[type];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-card border rounded-lg p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">{title}</h2>

        {type === 'divider' ? (
          /* Divider: parent group + confirm */
          <div className="space-y-4">
            {groups.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">所属分组</label>
                <TreeSelect
                  value={parentId || null}
                  onChange={(val) => setParentId(val ?? '')}
                  nodes={groups}
                  placeholder="根级别"
                />
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              将添加一条分割线。
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={onClose} className={btnOutline} disabled={submitting}>
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
                disabled={submitting}
                className={btnPrimary}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    {tCommon('submitting')}
                  </>
                ) : (
                  tCommon('create')
                )}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                菜单名称 <span className="text-destructive">*</span>
              </label>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：销售中心"
                required
                autoFocus
              />
            </div>

            {/* Icon — only for top-level group (no parent) */}
            {type === 'group' && !parentId && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">图标</label>
                <IconPicker value={icon} onChange={setIcon} />
              </div>
            )}

            {/* Parent Group */}
            {groups.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">所属分组</label>
                <TreeSelect
                  value={parentId || null}
                  onChange={(val) => setParentId(val ?? '')}
                  nodes={groups}
                  placeholder="根级别"
                />
              </div>
            )}

            {/* Model type: model selector + view picker */}
            {type === 'model' && (
              <>
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
              </>
            )}

            {/* Link type: targetUrl */}
            {type === 'link' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  目标 URL <span className="text-destructive">*</span>
                </label>
                <input
                  className={inputClass}
                  type="url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://example.com"
                  required
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={onClose} className={btnOutline} disabled={submitting}>
                {tCommon('cancel')}
              </button>
              <button type="submit" disabled={submitting} className={btnPrimary}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    {tCommon('submitting')}
                  </>
                ) : (
                  tCommon('create')
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
