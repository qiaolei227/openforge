'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

export interface AccessibleApp {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  themeColor: string | null;
  description: string | null;
  sortOrder: number;
}

export function useAccessibleApps() {
  const [apps, setApps] = useState<AccessibleApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<AccessibleApp[]>('/apps/accessible');
      setApps(data ?? []);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { apps, loading, error, refresh: load };
}
