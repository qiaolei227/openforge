'use client';

import { useAreaContext } from '@/components/layout/area-context';

export function useCurrentApp(): {
  appCode: string | null;
  appId: string | null;
} {
  const { appCode, appId } = useAreaContext();
  return { appCode, appId };
}
