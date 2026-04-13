'use client';

import { useParams } from 'next/navigation';
import { useMenuStore } from '@/stores/menu-store';
import { useAccessibleApps } from '@/hooks/use-accessible-apps';
import { AppIcon } from '@/lib/app-icon';
import { Loader2, LayoutDashboard } from 'lucide-react';

export default function WorkspaceAppHomePage() {
  const { appCode } = useParams<{ appCode: string }>();
  const appMenuState = useMenuStore((s) => s.byApp.get(appCode));
  const loaded = !!appMenuState?.loadedAt;

  const { apps } = useAccessibleApps();
  const app = apps.find((a) => a.code === appCode);

  if (!loaded) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {app?.icon ? (
          <AppIcon iconName={app.icon} className="h-8 w-8" />
        ) : (
          <LayoutDashboard className="h-8 w-8" />
        )}
      </div>
      <div className="text-center">
        <h1 className="text-xl font-semibold">{app?.name ?? appCode}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          仪表盘即将上线，请从左侧菜单进入业务模块
        </p>
      </div>
    </div>
  );
}
