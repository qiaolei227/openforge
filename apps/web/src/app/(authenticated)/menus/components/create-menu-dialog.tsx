'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { useTranslations } from 'next-intl';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AppItem {
  id: string;
  name: string;
  code: string;
}

interface ModelItem {
  id: string;
  name: string;
  code: string;
}

interface AppListResponse {
  data: AppItem[];
  total: number;
}

interface ModelListResponse {
  data: ModelItem[];
  total: number;
}

type CreateType = 'group' | 'model' | 'link' | 'divider';

interface Props {
  type: CreateType | null;
  open: boolean;
  onClose: () => void;
  prefillAppCode?: string;
  prefillModelCode?: string;
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
  prefillAppCode,
  prefillModelCode,
  onCreated,
  showToast,
}: Props) {
  const tErrors = useTranslations('errorCodes');
  const tCommon = useTranslations('common');

  // Form fields
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [icon, setIcon] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  // For model type: we track app.id to load models, but submit app.code + model.code
  const [selectedAppId, setSelectedAppId] = useState('');
  const [selectedAppCode, setSelectedAppCode] = useState('');
  const [selectedModelCode, setSelectedModelCode] = useState('');

  // Data
  const [apps, setApps] = useState<AppItem[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Submit state
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;
    setName('');
    setNameEn('');
    setIcon('');
    setTargetUrl('');
    setSelectedAppId('');
    setSelectedAppCode('');
    setSelectedModelCode('');
    setError('');
  }, [open]);

  // Load apps when type = 'model' and dialog is open
  useEffect(() => {
    if (!open || type !== 'model') return;
    setAppsLoading(true);
    apiClient
      .get<AppListResponse>('/apps?pageSize=200')
      .then(({ data }) => {
        setApps(data.data ?? []);
        // Prefill app from query param
        if (prefillAppCode) {
          const match = (data.data ?? []).find((a) => a.code === prefillAppCode);
          if (match) {
            setSelectedAppId(match.id);
            setSelectedAppCode(match.code);
          }
        }
      })
      .catch(() => {})
      .finally(() => setAppsLoading(false));
  }, [open, type, prefillAppCode]);

  // Load models when selectedAppId changes
  const loadModels = useCallback(
    async (appId: string) => {
      if (!appId) {
        setModels([]);
        return;
      }
      setModelsLoading(true);
      try {
        const { data } = await apiClient.get<ModelListResponse>(
          `/models?appId=${appId}&pageSize=200`,
        );
        const list = data.data ?? [];
        setModels(list);
        // Prefill model from query param
        if (prefillModelCode) {
          const match = list.find((m) => m.code === prefillModelCode);
          if (match) setSelectedModelCode(match.code);
        }
      } catch {
        setModels([]);
      } finally {
        setModelsLoading(false);
      }
    },
    [prefillModelCode],
  );

  useEffect(() => {
    if (selectedAppId) {
      loadModels(selectedAppId);
    } else {
      setModels([]);
      setSelectedModelCode('');
    }
  }, [selectedAppId, loadModels]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) return;
    setError('');
    setSubmitting(true);

    try {
      // Build payload based on type
      const payload: Record<string, unknown> = { type };

      if (type === 'divider') {
        // Divider has no visible name but backend requires it
        payload.name = '---';
      } else {
        payload.name = name;
        if (nameEn) payload.nameEn = nameEn;
        if (icon) payload.icon = icon;
      }

      if (type === 'model') {
        if (!selectedModelCode) {
          setError('请选择模型');
          setSubmitting(false);
          return;
        }
        payload.targetAppCode = selectedAppCode;
        payload.targetModelCode = selectedModelCode;
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
          /* Divider: no form inputs, just confirm */
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              将在菜单列表末尾添加一条分割线，可在属性面板中调整位置。
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

            {/* English name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                英文名称 <span className="text-xs text-muted-foreground">(可选)</span>
              </label>
              <input
                className={inputClass}
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="如：Sales Center"
              />
            </div>

            {/* Icon */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                图标 <span className="text-xs text-muted-foreground">(Lucide 图标名，可选)</span>
              </label>
              <input
                className={inputClass}
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="如：ShoppingCart、Users、Settings"
              />
            </div>

            {/* Model type: app + model selectors */}
            {type === 'model' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    所属应用 <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <select
                      className={selectClass}
                      value={selectedAppId}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        const selectedApp = apps.find((a) => a.id === selectedId);
                        setSelectedAppId(selectedId);
                        setSelectedAppCode(selectedApp?.code ?? '');
                        setSelectedModelCode('');
                      }}
                      required
                      disabled={appsLoading}
                    >
                      <option value="">
                        {appsLoading ? '加载中...' : '请选择应用'}
                      </option>
                      {apps.map((app) => (
                        <option key={app.id} value={app.id}>
                          {app.name} ({app.code})
                        </option>
                      ))}
                    </select>
                    {appsLoading && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    目标模型 <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <select
                      className={selectClass}
                      value={selectedModelCode}
                      onChange={(e) => setSelectedModelCode(e.target.value)}
                      required
                      disabled={!selectedAppId || modelsLoading}
                    >
                      <option value="">
                        {modelsLoading
                          ? '加载中...'
                          : !selectedAppId
                          ? '请先选择应用'
                          : '请选择模型'}
                      </option>
                      {models.map((m) => (
                        <option key={m.id} value={m.code}>
                          {m.name} ({m.code})
                        </option>
                      ))}
                    </select>
                    {modelsLoading && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
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
