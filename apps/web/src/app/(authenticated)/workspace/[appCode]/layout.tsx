'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useMenuStore } from '@/stores/menu-store';
import { useTabStore } from '@/stores/tab-store';

/**
 * Workspace per-app layout.
 *
 * - Ensures menu data is loaded for any child page.
 * - On F5 refresh with no tabs, redirects model pages to dashboard.
 *
 * Tab content rendering is handled by the parent workspace/layout.tsx
 * so component state persists across both modelCode and appCode changes.
 */
export default function WorkspaceAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { appCode } = useParams<{ appCode: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const fetchAppMenu = useMenuStore((s) => s.fetch);

  const isModelPage = pathname !== `/workspace/${appCode}`;
  const tabCount = useTabStore((s) => s.tabs.length);
  const needsRedirect = isModelPage && tabCount === 0;

  // Fetch menu data for this system
  useEffect(() => {
    fetchAppMenu(appCode);
  }, [appCode, fetchAppMenu]);

  // Redirect to dashboard on fresh load
  useEffect(() => {
    if (needsRedirect) {
      router.replace(`/workspace/${appCode}`);
    }
  }, [needsRedirect, appCode, router]);

  if (needsRedirect) return null;

  return children;
}
