'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface View {
  id: string;
  name: string;
  type: string;
  isDefault: boolean;
}

export interface ViewSelection {
  targetViewType: string;
  targetViewId: string | null;
}

interface Props {
  modelId: string | null;
  value: ViewSelection | null;
  onChange: (value: ViewSelection) => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SUPPORTED_TYPES = [
  { type: 'list', defaultLabel: '默认列表' },
  { type: 'form', defaultLabel: '默认表单' },
];

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ViewPicker({ modelId, value, onChange }: Props) {
  const [views, setViews] = useState<View[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!modelId) {
      setViews([]);
      return;
    }
    setLoading(true);
    apiClient
      .get<View[]>(`/models/${modelId}/views`)
      .then(({ data }) => setViews(Array.isArray(data) ? data : []))
      .catch(() => setViews([]))
      .finally(() => setLoading(false));
  }, [modelId]);

  if (!modelId) {
    return (
      <div className="text-sm text-muted-foreground italic">请先选择模型</div>
    );
  }

  const currentValue = value
    ? value.targetViewId
      ? `view:${value.targetViewId}`
      : `default:${value.targetViewType}`
    : '';

  const handleChange = (encoded: string) => {
    if (encoded.startsWith('default:')) {
      onChange({
        targetViewType: encoded.replace('default:', ''),
        targetViewId: null,
      });
    } else if (encoded.startsWith('view:')) {
      const viewId = encoded.replace('view:', '');
      const view = views.find((v) => v.id === viewId);
      if (view) {
        onChange({ targetViewType: view.type, targetViewId: view.id });
      }
    }
  };

  // Group user-defined views by type
  const userViewsByType = new Map<string, View[]>();
  for (const v of views) {
    if (!userViewsByType.has(v.type)) userViewsByType.set(v.type, []);
    userViewsByType.get(v.type)!.push(v);
  }

  return (
    <div className="relative">
      <select
        className={selectClass}
        value={currentValue}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loading}
        required
      >
        <option value="">请选择视图</option>
        <optgroup label="默认视图">
          {SUPPORTED_TYPES.map(({ type, defaultLabel }) => (
            <option key={`default:${type}`} value={`default:${type}`}>
              {defaultLabel}
            </option>
          ))}
        </optgroup>
        {Array.from(userViewsByType.entries()).map(([type, list]) => (
          <optgroup
            key={type}
            label={`自定义 - ${type === 'list' ? '列表' : type === 'form' ? '表单' : type}`}
          >
            {list.map((v) => (
              <option key={v.id} value={`view:${v.id}`}>
                {v.name}
                {v.isDefault ? ' *' : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
