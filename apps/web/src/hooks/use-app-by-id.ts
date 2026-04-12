'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface AppInfo {
  id: string;
  code: string;
  name: string;
}

export function useAppById(appId: string | null) {
  const [app, setApp] = useState<AppInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!appId) {
      setApp(null);
      return;
    }
    setLoading(true);
    apiClient
      .get<AppInfo>(`/apps/${appId}`)
      .then(({ data }) => setApp(data))
      .catch(() => setApp(null))
      .finally(() => setLoading(false));
  }, [appId]);

  return { app, loading };
}
