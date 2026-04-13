'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import type { SysAction } from '@openforge/shared';

export function useActions(modelId: string | undefined, visibleActionIds?: string[]) {
  const [actions, setActions] = useState<SysAction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    setLoading(true);
    apiClient
      .get(`/models/${modelId}/actions`)
      .then((res) => {
        if (!cancelled) {
          const filtered = visibleActionIds?.length
            ? (res.data as SysAction[]).filter(
                (a) => a.category === 'system' || visibleActionIds.includes(a.id),
              )
            : res.data;
          setActions(filtered);
        }
      })
      .catch(() => {
        if (!cancelled) setActions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelId, visibleActionIds]);

  return { actions, loading };
}
