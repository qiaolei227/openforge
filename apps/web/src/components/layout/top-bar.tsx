'use client';

import Link from 'next/link';
import { Settings, Paintbrush, Home } from 'lucide-react';
import { useArea } from '@/hooks/use-area';
import { useCurrentApp } from '@/hooks/use-current-app';
import { SystemSwitcher } from './system-switcher';
import { useCanAccessDesigner } from '@/hooks/use-can-access-designer';
import { cn } from '@/lib/utils';

export function TopBar() {
  const area = useArea();
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
      >
        <Home className="w-4 h-4" />
        OpenForge
      </Link>

      {/* Center / context-aware section */}
      <div className="flex-1 min-w-0">
        {isSettings && (
          <span className="text-sm font-medium text-muted-foreground">平台设置</span>
        )}
        {isLauncher && (
          <span className="text-sm font-medium text-muted-foreground">系统启动器</span>
        )}
        {isWorkspaceOrDesigner && <SystemSwitcher />}
      </div>

      {/* Right-side actions */}
      <div className="flex items-center gap-1 shrink-0">
        {area === 'workspace' && appCode && canAccessDesigner && (
          <Link
            href={`/apps?fromWorkspace=${appCode}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md hover:bg-accent transition-colors"
            title="进入系统设计器"
          >
            <Paintbrush className="w-4 h-4" />
            设计器
          </Link>
        )}
        {canAccessDesigner && !isSettings && (
          <Link
            href="/settings"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors"
            title="平台设置"
          >
            <Settings className="w-4 h-4" />
          </Link>
        )}
      </div>
    </header>
  );
}
