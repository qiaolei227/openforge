'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { useMenuStore } from '@/stores/menu-store';
import { Loader2 } from 'lucide-react';
import type { MenuNode } from '@openforge/shared';

/**
 * /workspace/:appCode — App home page for a specific application.
 * Derives the app info and model list from the menu tree, so it works for
 * any authenticated user regardless of designer permissions.
 */
export default function WorkspaceAppHomePage() {
  const { appCode } = useParams<{ appCode: string }>();
  const appMenuState = useMenuStore((s) => s.byApp.get(appCode));
  const fetchAppMenu = useMenuStore((s) => s.fetch);
  const tree = appMenuState?.tree ?? [];
  const loaded = !!appMenuState?.loadedAt;

  useEffect(() => {
    fetchAppMenu(appCode);
  }, [appCode, fetchAppMenu]);

  // Find the top-level group node whose children include models targeting this appCode
  const { appNode, modelNodes } = useMemo(() => {
    if (!loaded) return { appNode: null, modelNodes: [] };

    // Collect all model nodes targeting this appCode from the whole tree
    const collected: MenuNode[] = [];
    let found: MenuNode | null = null;

    function walk(nodes: MenuNode[], parentGroup: MenuNode | null): void {
      for (const n of nodes) {
        if (n.type === 'model' && n.targetAppCode === appCode) {
          collected.push(n);
          if (!found && parentGroup) {
            found = parentGroup as MenuNode;
          }
        }
        if (n.children?.length) {
          walk(n.children, n.type === 'group' ? n : parentGroup);
        }
      }
    }

    walk(tree, null);
    return { appNode: found as MenuNode | null, modelNodes: collected };
  }, [tree, loaded, appCode]);

  if (!loaded) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (modelNodes.length === 0) {
    return (
      <div className="p-8 text-muted-foreground">应用不存在或无权访问</div>
    );
  }

  const appName = appNode?.name ?? appCode;

  return (
    <div>
      <h1 className="text-xl font-semibold">{appName}</h1>

      <h2 className="text-sm font-medium mt-6 mb-3">模型列表</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {modelNodes.map((m) => {
          const base = `/workspace/${appCode}/${m.targetModelCode}`;
          const qs = new URLSearchParams();
          if (m.targetViewId) {
            qs.set('view', m.targetViewId);
          } else if (m.targetViewType) {
            qs.set('type', m.targetViewType);
          }
          const qsStr = qs.toString();
          const href = qsStr ? `${base}?${qsStr}` : base;

          return (
            <Link
              key={m.id}
              href={href}
              className="p-4 border border-border rounded-lg hover:border-primary hover:bg-muted/30 transition-colors"
            >
              <div className="font-medium">{m.name}</div>
              {m.targetModelCode && (
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {m.targetModelCode}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
