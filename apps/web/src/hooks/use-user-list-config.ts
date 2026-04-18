import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';

export interface UserListConfig {
  pageSize?: number;
  /** Ordered unified array. Entries are either `columnName`,
   * `__oneToOne__{entityCode}__{columnName}`, or
   * `__detail__{entityCode}__{columnName}` — see docs/superpowers/specs/2026-04-19-unified-column-config-design.md */
  columns?: string[];
  filterPresets?: Array<{
    id: string;
    name: string;
    filter: any;
  }>;
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
        if (!cancelled) setConfig(sanitizeIncoming(data ?? {}));
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

/**
 * Strip legacy fields (`oneToOneFields`, `detailEntity`) that may exist in stored
 * configs from pre-2026-04-19 deployments. Those are now encoded into `columns`
 * via prefixes. No auto-migration — users re-configure via the column settings panel.
 */
function sanitizeIncoming(raw: any): UserListConfig {
  if (!raw || typeof raw !== 'object') return {};
  const { oneToOneFields: _o, detailEntity: _d, ...rest } = raw;
  return rest;
}
