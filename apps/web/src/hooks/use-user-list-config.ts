import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';

export interface UserListConfig {
  pageSize?: number;
  columns?: string[]; // ordered fieldIds (visible only)
  filterPresets?: Array<{
    id: string;
    name: string;
    filter: any;
  }>;
  /** Selected fields per 1:1 entity (entityCode → ordered fieldColumnNames) */
  oneToOneFields?: Record<string, string[]>;
  /** Single 1:N entity to expand as master-detail rows; null/undefined = don't show detail */
  detailEntity?: { entityCode: string; fields: string[] } | null;
}

export function useUserListConfig(appCode: string, modelCode: string) {
  const [config, setConfig] = useState<UserListConfig>({});
  const [loading, setLoading] = useState(true);
  const latestConfig = useRef(config);
  latestConfig.current = config;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get(`/apps/${appCode}/models/${modelCode}/user-config`)
      .then(({ data }) => {
        if (!cancelled) setConfig(data ?? {});
      })
      .catch(() => {
        // No config yet — use defaults
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [appCode, modelCode]);

  const save = useCallback(
    async (patch: Partial<UserListConfig>) => {
      const merged = { ...latestConfig.current, ...patch };
      setConfig(merged);
      await apiClient.put(`/apps/${appCode}/models/${modelCode}/user-config`, merged);
    },
    [appCode, modelCode],
  );

  const reset = useCallback(async () => {
    setConfig({});
    await apiClient.delete(`/apps/${appCode}/models/${modelCode}/user-config`);
  }, [appCode, modelCode]);

  return { config, loading, save, reset };
}
