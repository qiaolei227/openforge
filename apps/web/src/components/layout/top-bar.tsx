'use client';

import Link from 'next/link';
import { Settings, Paintbrush } from 'lucide-react';
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

  const isDesigner = area === 'designer';
  const isSettings = area === 'settings';

  return (
    <header className="h-12 border-b border-border flex items-center px-4 gap-4 shrink-0">
      {/* Brand / Home link — always visible, always goes to launcher */}
      <Link
        href="/launcher"
        className="font-semibold text-base flex items-center gap-2 shrink-0"
        title={t('home')}
      >
        <img src="/logo.svg" alt="OpenForge" width={20} height={20} className="shrink-0" />
        <span className="hidden sm:inline">OpenForge</span>
      </Link>

      {/* Center — system switcher (workspace/designer) or area label */}
      <div className="flex-1 min-w-0">
        {isSettings && (
          <span className="text-sm font-medium text-muted-foreground">{t('settings')}</span>
        )}
        {(area === 'workspace' || area === 'designer') && <SystemSwitcher />}
      </div>

      {/* Right-side navigation — always show both designer + settings for admin */}
      <div className="flex items-center gap-1 shrink-0">
        {canAccessDesigner && (
          <Link
            href="/apps"
            className={cn(
              'inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors',
              isDesigner && 'bg-accent',
            )}
            title={t('designer')}
          >
            <Paintbrush className="w-4 h-4" />
          </Link>
        )}
        {canAccessDesigner && (
          <Link
            href="/settings"
            className={cn(
              'inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors',
              isSettings && 'bg-accent',
            )}
            title={t('settings')}
          >
            <Settings className="w-4 h-4" />
          </Link>
        )}
      </div>
    </header>
  );
}
