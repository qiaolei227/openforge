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
    const ac = new AbortController();
    setLoading(true);
    apiClient
      .get<AppInfo>(`/apps/${appId}`, { signal: ac.signal })
      .then(({ data }) => { if (!ac.signal.aborted) setApp(data); })
      .catch(() => { if (!ac.signal.aborted) setApp(null); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [appId]);

  return { app, loading };
}
