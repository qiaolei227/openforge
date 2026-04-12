'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDown, Loader2, LayoutGrid } from 'lucide-react';
import { AppIcon } from '@/lib/app-icon';
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

export function SystemSwitcher() {
  const router = useRouter();
  const t = useTranslations('systemSwitcher');
  const { appCode } = useCurrentApp();
  const { apps, loading } = useAccessibleApps();

  const currentApp = apps.find((a) => a.code === appCode);
  const currentName = currentApp?.name ?? t('select');

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
              {t('none')}
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
          <span>{t('allSystems')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
