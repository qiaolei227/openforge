'use client';

import { useEffect } from 'react';
import { AreaProvider } from './layout/area-context';
import { TopBar } from './layout/top-bar';
import { DynamicSidebarNav } from './layout/dynamic-sidebar-nav';
import { UserMenu } from './user-menu';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeSwitcher } from './theme-switcher';
import { AiSidebar } from './ai-sidebar';
import { useAiStore } from '@/stores/ai-store';
import { Layers } from 'lucide-react';

const AI_OPEN_KEY = 'openforge_ai_open';

function AppShellInner({ children }: { children: React.ReactNode }) {
  const aiStore = useAiStore();

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
        {/* Top bar with area-aware context + right-side controls */}
        <div className="flex items-center shrink-0">
          <div className="flex-1 min-w-0">
            <TopBar />
          </div>
          <div className="flex items-center gap-1 px-4 h-12 border-b border-border shrink-0">
            <button
              onClick={() => aiStore.toggle()}
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground hover:opacity-90 transition-opacity"
              title="AI 助手"
            >
              <Layers className="w-4 h-4" />
            </button>
            <ThemeSwitcher />
            <LocaleSwitcher />
            <UserMenu />
          </div>
        </div>

        {/* Sidebar + main content */}
        <div className="flex flex-1 min-h-0">
          <DynamicSidebarNav />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
      <AiSidebar />
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
