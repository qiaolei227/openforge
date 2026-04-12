'use client';

import { createContext, useContext, useMemo } from 'react';
import { usePathname } from 'next/navigation';

export type Area = 'workspace' | 'designer' | 'settings' | 'launcher' | 'other';

export interface AreaContextValue {
  area: Area;
  appCode: string | null;  // workspace mode — extracted from /workspace/{appCode}
  appId: string | null;    // designer mode — extracted from /apps/{appId}
}

const AreaContext = createContext<AreaContextValue>({
  area: 'other',
  appCode: null,
  appId: null,
});

export function AreaProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';

  const value = useMemo<AreaContextValue>(() => {
    if (pathname.startsWith('/launcher')) {
      return { area: 'launcher', appCode: null, appId: null };
    }

    const wsMatch = pathname.match(/^\/workspace\/([^/]+)/);
    if (wsMatch) {
      return { area: 'workspace', appCode: wsMatch[1], appId: null };
    }

    const designerMatch = pathname.match(/^\/apps\/([^/]+)/);
    if (designerMatch) {
      return { area: 'designer', appCode: null, appId: designerMatch[1] };
    }

    if (pathname.startsWith('/settings')) {
      return { area: 'settings', appCode: null, appId: null };
    }

    return { area: 'other', appCode: null, appId: null };
  }, [pathname]);

  return <AreaContext.Provider value={value}>{children}</AreaContext.Provider>;
}

export function useAreaContext(): AreaContextValue {
  return useContext(AreaContext);
}
