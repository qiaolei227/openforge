'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useTabStore } from '@/stores/tab-store';

/**
 * Workspace model page — lightweight "tab opener".
 *
 * URL: /workspace/:appCode/:modelCode
 *
 * This page only creates/activates a tab for the URL model on mount.
 * The actual content rendering is handled by WorkspaceTabRenderer in
 * the parent layout, which persists across modelCode changes and
 * preserves component state (form data, scroll position, etc.).
 */
export default function WorkspaceModelPage() {
  const { appCode, modelCode } = useParams<{
    appCode: string;
    modelCode: string;
  }>();
  const searchParams = useSearchParams();
  const viewType = searchParams.get('type') ?? undefined;

  const openListTab = useTabStore((s) => s.openListTab);

  const mountedRef = useRef(false);
  const viewTypeRef = useRef(viewType);
  viewTypeRef.current = viewType;

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Skip if there's already an active tab for this model
    const currentActive = useTabStore.getState().getActiveTabForApp(appCode);
    if (currentActive?.modelCode === modelCode) return;

    openListTab({
      appCode,
      modelCode,
      modelName: modelCode, // placeholder — layout's TabRenderer updates title when schema loads
      viewType: viewTypeRef.current,
    });
  }, [appCode, modelCode, openListTab]);

  // Content is rendered by the layout's WorkspaceTabRenderer
  return null;
}
