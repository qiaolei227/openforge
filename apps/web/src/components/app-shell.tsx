'use client';

import { useState, useEffect } from 'react';
import { Layers } from 'lucide-react';
import { Sidebar } from './sidebar';
import { UserMenu } from './user-menu';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeSwitcher } from './theme-switcher';
import { AiSidebar } from './ai-sidebar';
import { useAiStore } from '@/stores/ai-store';

const STORAGE_KEY = 'openforge_sidebar_collapsed';
const AI_OPEN_KEY = 'openforge_ai_open';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const aiStore = useAiStore();

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

  return (
    <>
      <div className="flex h-screen">
        <Sidebar collapsed={collapsed} onToggle={handleToggle} />
        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b flex items-center justify-end px-6 gap-3">
            <button
              onClick={() => aiStore.toggle()}
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground hover:opacity-90 transition-opacity"
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
