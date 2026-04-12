'use client';

import Link from 'next/link';
import { Settings, Paintbrush, Home } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useArea } from '@/hooks/use-area';
import { useCurrentApp } from '@/hooks/use-current-app';
import { SystemSwitcher } from './system-switcher';
import { useCanAccessDesigner } from '@/hooks/use-can-access-designer';
import { cn } from '@/lib/utils';

export function TopBar() {
  const area = useArea();
  const t = useTranslations('topBar');
  const { appCode } = useCurrentApp();
  const canAccessDesigner = useCanAccessDesigner();

  const isSettings = area === 'settings';
  const isLauncher = area === 'launcher';
  const isWorkspaceOrDesigner = area === 'workspace' || area === 'designer';

  return (
    <header
      className={cn(
        'h-12 border-b border-border flex items-center px-4 gap-4 shrink-0',
        isSettings && 'bg-muted/30',
      )}
    >
      {/* Brand / Home link */}
      <Link
        href="/launcher"
        className="font-semibold text-base flex items-center gap-2 shrink-0"
        title={t('home')}
      >
        <Home className="w-4 h-4" />
        OpenForge
      </Link>

      {/* Center / context-aware section */}
      <div className="flex-1 min-w-0">
        {isSettings && (
          <span className="text-sm font-medium text-muted-foreground">{t('settings')}</span>
        )}
        {isLauncher && (
          <span className="text-sm font-medium text-muted-foreground">{t('home')}</span>
        )}
        {isWorkspaceOrDesigner && <SystemSwitcher />}
      </div>

      {/* Right-side actions */}
      <div className="flex items-center gap-1 shrink-0">
        {area === 'workspace' && appCode && canAccessDesigner && (
          <Link
            href={`/apps?fromWorkspace=${appCode}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md hover:bg-accent transition-colors"
            title={t('designer')}
          >
            <Paintbrush className="w-4 h-4" />
            {t('designer')}
          </Link>
        )}
        {canAccessDesigner && !isSettings && (
          <Link
            href="/settings"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors"
            title={t('settings')}
          >
            <Settings className="w-4 h-4" />
          </Link>
        )}
      </div>
    </header>
  );
}
