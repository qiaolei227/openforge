'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Settings, Paintbrush, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useArea } from '@/hooks/use-area';
import { SystemSwitcher } from './system-switcher';
import { useCanAccessDesigner } from '@/hooks/use-can-access-designer';
import { useAuthStore } from '@/stores/auth-store';
import { useAiStore } from '@/stores/ai-store';
import { UserMenu } from '../user-menu';
import { MenuDrawerTrigger } from '@/components/workspace/menu-drawer-trigger';
import { MenuDrawer } from '@/components/workspace/menu-drawer';
import { cn } from '@/lib/utils';
import { useDesignerBreadcrumbStore } from '@/stores/designer-breadcrumb-store';
import { ChevronRight } from 'lucide-react';

export function TopBar() {
  const area = useArea();
  const t = useTranslations('topBar');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const canAccessDesigner = useCanAccessDesigner();
  const canAccessSettings = useAuthStore((s) => s.user?.identity === 'admin');
  const aiStore = useAiStore();

  const isDesigner = area === 'designer';
  const isSettings = area === 'settings';
  const breadcrumbItems = useDesignerBreadcrumbStore((s) => s.items);

  return (<>
    <header className="h-12 border-b border-border flex items-center px-4 shrink-0">
      {/* ─── Left: Brand ─── */}
      <Link
        href="/launcher"
        className="font-semibold text-sm flex items-center gap-2 shrink-0 mr-4"
        title={t('home')}
      >
        <img src="/logo.svg" alt="" width={20} height={20} className="shrink-0" />
        <span className="hidden sm:inline text-primary">OpenForge</span>
      </Link>

      {/* ─── Center: System switcher or area label ─── */}
      <div className="flex-1 min-w-0">
        {isSettings && (
          <span className="text-sm font-semibold">{t('settings')}</span>
        )}
        {isDesigner && (
          <nav className="flex items-center gap-1.5 text-sm">
            <Link
              href="/apps"
              className={cn(
                'font-semibold transition-colors',
                breadcrumbItems.length > 0
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'text-foreground',
              )}
            >
              {t('designer')}
            </Link>
            {breadcrumbItems.map((item, idx) => {
              const isLast = idx === breadcrumbItems.length - 1;
              return (
                <span key={idx} className="flex items-center gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
                  {item.href ? (
                    <Link href={item.href} className="text-muted-foreground hover:text-foreground transition-colors">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="font-semibold text-primary">{item.label}</span>
                  )}
                </span>
              );
            })}
          </nav>
        )}
        {area === 'workspace' && (
          <div className="flex items-center gap-2">
            <SystemSwitcher />
            <MenuDrawerTrigger onClick={() => setDrawerOpen(true)} />
          </div>
        )}
      </div>

      {/* ─── Right: clean layout ─── */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Navigation icons */}
        {canAccessDesigner && (
          <Link
            href="/apps"
            className={cn(
              'inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors',
              isDesigner && 'bg-accent text-accent-foreground',
            )}
            title={t('designer')}
          >
            <Paintbrush className="w-4 h-4" />
          </Link>
        )}
        {canAccessSettings && (
          <Link
            href="/settings"
            className={cn(
              'inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors',
              isSettings && 'bg-accent text-accent-foreground',
            )}
            title={t('settings')}
          >
            <Settings className="w-4 h-4" />
          </Link>
        )}

        {/* AI assistant */}
        <button
          onClick={() => aiStore.toggle()}
          className={cn(
            'inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors',
            aiStore.isOpen && 'bg-accent text-accent-foreground',
          )}
          title="AI 助手"
        >
          <Sparkles className="w-4 h-4" />
        </button>

        {/* User avatar + name dropdown */}
        <UserMenu />
      </div>
    </header>
      {area === 'workspace' && (
        <MenuDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
      )}
    </>
  );
}
