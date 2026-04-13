'use client';

import { useEffect } from 'react';
import { AreaProvider, useAreaContext } from './layout/area-context';
import { TopBar } from './layout/top-bar';
import { DynamicSidebarNav } from './layout/dynamic-sidebar-nav';
import { AiSidebar } from './ai-sidebar';
import { GlobalToast } from './global-toast';
import { useAiStore } from '@/stores/ai-store';
import { TabBar } from '@/components/workspace/tab-bar';

const AI_OPEN_KEY = 'openforge_ai_open';

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { area } = useAreaContext();

  /* Restore AI panel open state from localStorage */
  useEffect(() => {
    const aiStored = localStorage.getItem(AI_OPEN_KEY);
    if (aiStored === 'true') {
      useAiStore.getState().open();
    }
  }, []);

  return (
    <>
      <div className="flex flex-col h-screen">
        <TopBar />
        <div className="flex flex-1 min-h-0">
          <DynamicSidebarNav />
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {area === 'workspace' && <TabBar />}
            <div className="flex-1 overflow-auto p-6">{children}</div>
          </main>
        </div>
      </div>
      <AiSidebar />
      <GlobalToast />
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AreaProvider>
      <AppShellInner>{children}</AppShellInner>
    </AreaProvider>
  );
}
