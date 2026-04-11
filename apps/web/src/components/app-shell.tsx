'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Layers, Paintbrush, LayoutGrid } from 'lucide-react';
import { DynamicSidebarNav } from './layout/dynamic-sidebar-nav';
import { UserMenu } from './user-menu';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeSwitcher } from './theme-switcher';
import { AiSidebar } from './ai-sidebar';
import { useAiStore } from '@/stores/ai-store';
import { useCanAccessDesigner } from '@/hooks/use-can-access-designer';

const STORAGE_KEY = 'openforge_sidebar_collapsed';
const AI_OPEN_KEY = 'openforge_ai_open';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const aiStore = useAiStore();
  const pathname = usePathname();
  const canAccessDesigner = useCanAccessDesigner() ?? false;

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') setCollapsed(true);
  }, []);

  /* Restore AI panel open state from localStorage */
  useEffect(() => {
    const aiStored = localStorage.getItem(AI_OPEN_KEY);
    if (aiStored === 'true') {
      useAiStore.getState().open();
    }
  }, []);

  const handleToggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const inWorkspace = pathname === '/workspace' || pathname?.startsWith('/workspace/');
  const inDesigner = pathname === '/apps' || pathname?.startsWith('/apps/');

  return (
    <>
      <div className="flex h-screen">
        <DynamicSidebarNav collapsed={collapsed} onToggle={handleToggle} />
        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b flex items-center justify-end px-6 gap-3">
            {inWorkspace && canAccessDesigner && (
              <Link
                href="/apps"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="进入应用设计器"
              >
                <Paintbrush className="w-4 h-4" />
                <span>设计器</span>
              </Link>
            )}
            {inDesigner && (
              <Link
                href="/workspace"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="返回业务工作台"
              >
                <LayoutGrid className="w-4 h-4" />
                <span>工作台</span>
              </Link>
            )}
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
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
      <AiSidebar />
    </>
  );
}
