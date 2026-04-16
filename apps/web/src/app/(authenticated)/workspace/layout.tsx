'use client';

import { usePathname } from 'next/navigation';
import { WorkspaceTabRenderer } from '@/components/workspace/workspace-tab-renderer';
import { useTabStore } from '@/stores/tab-store';
import { useCurrentApp } from '@/hooks/use-current-app';

/**
 * Top-level workspace layout — persists across ALL system (appCode) switches.
 *
 * Hosts WorkspaceTabRenderer here so tab component state (form data, scroll
 * positions, etc.) survives both modelCode AND appCode URL changes.
 */
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { appCode } = useCurrentApp();
  const activeTab = useTabStore((s) => s.getActiveTabForApp(appCode ?? ''));

  // Show tabs when there's an active tab and we're on a model page (not dashboard)
  // Dashboard URLs: /workspace or /workspace/{appCode}
  const isDashboard = pathname === '/workspace' || (appCode && pathname === `/workspace/${appCode}`);
  const showTabs = !isDashboard && !!activeTab;

  return (
    <>
      {/* Tab contents — always mounted, hidden/visible toggled */}
      <div className={showTabs ? 'h-full' : 'hidden'}>
        <WorkspaceTabRenderer />
      </div>

      {/* Children (dashboard, model tab-opener, workspace root) — hidden when tabs are visible */}
      <div className={showTabs ? 'hidden' : 'h-full overflow-auto p-6'}>{children}</div>
    </>
  );
}
