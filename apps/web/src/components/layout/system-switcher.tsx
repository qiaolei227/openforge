'use client';

import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2, LayoutGrid } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAccessibleApps } from '@/hooks/use-accessible-apps';
import { useCurrentApp } from '@/hooks/use-current-app';
import { cn } from '@/lib/utils';

function AppIcon({ iconName }: { iconName: string | null }) {
  if (!iconName) return <LayoutGrid className="w-4 h-4" />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (LucideIcons as any)[iconName] as React.ComponentType<{ className?: string }> | undefined;
  return Icon ? <Icon className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />;
}

export function SystemSwitcher() {
  const router = useRouter();
  const { appCode } = useCurrentApp();
  const { apps, loading } = useAccessibleApps();

  const currentApp = apps.find((a) => a.code === appCode);
  const currentName = currentApp?.name ?? '选择系统';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md hover:bg-accent transition-colors">
        <AppIcon iconName={currentApp?.icon ?? null} />
        <span className="truncate max-w-[160px]">{currentName}</span>
        <ChevronDown className="w-4 h-4 opacity-60 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          {loading && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && apps.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              暂无可访问的系统
            </div>
          )}
          {apps.map((app) => (
            <DropdownMenuItem
              key={app.id}
              onClick={() => router.push(`/workspace/${app.code}`)}
              className={cn(
                'flex items-center gap-2',
                app.code === appCode && 'bg-accent',
              )}
            >
              <AppIcon iconName={app.icon} />
              <span className="flex-1 truncate">{app.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => router.push('/launcher')}
          className="flex items-center gap-2"
        >
          <LayoutGrid className="w-4 h-4" />
          <span>全部系统</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
