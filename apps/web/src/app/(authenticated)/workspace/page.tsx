'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { Icon } from '@/components/icon';
import { useMenuStore } from '@/stores/menu-store';
import { Loader2 } from 'lucide-react';
import type { MenuNode } from '@openforge/shared';

/**
 * /workspace — Runtime business home.
 * Shows top-level menu nodes (excluding system management and designer)
 * as application cards. Clicking a card navigates into its first leaf.
 */
export default function WorkspaceHomePage() {
  const { tree, loaded, fetchTree } = useMenuStore();

  useEffect(() => {
    if (!loaded) fetchTree();
  }, [loaded, fetchTree]);

  const entries = useMemo<MenuNode[]>(
    () =>
      tree.filter(
        (n) => n.code !== 'sys:management' && n.code !== 'sys:designer',
      ),
    [tree],
  );

  if (!loaded) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-24 text-center">
        <h2 className="text-lg font-medium">暂无可访问的应用</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          请联系管理员分配角色和菜单权限
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">工作台</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {entries.map((node) => (
          <AppCard key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}

function AppCard({ node }: { node: MenuNode }) {
  const firstLeaf = findFirstLeaf(node);
  const href = firstLeaf ? routeForNode(firstLeaf) : '#';

  return (
    <Link
      href={href}
      className="flex items-start gap-3 p-4 border border-border rounded-lg hover:border-primary hover:bg-muted/30 transition-colors"
    >
      {node.icon && <Icon name={node.icon} className="w-8 h-8 text-primary shrink-0" />}
      <div className="min-w-0">
        <div className="font-medium truncate">{node.name}</div>
        <div className="text-xs text-muted-foreground mt-1 truncate">
          {node.children.length > 0 ? `${node.children.length} 项` : node.code}
        </div>
      </div>
    </Link>
  );
}

function findFirstLeaf(node: MenuNode): MenuNode | null {
  if (node.type === 'page' || node.type === 'model' || node.type === 'link') {
    return node;
  }
  for (const child of node.children) {
    const leaf = findFirstLeaf(child);
    if (leaf) return leaf;
  }
  return null;
}

function routeForNode(node: MenuNode): string {
  // TODO Task 16: fix after sidebar refactor — targetRoute/targetFilterPreset removed from MenuNode
  if (node.type === 'page') return (node as any).targetRoute ?? '#';
  if (node.type === 'link') return node.targetUrl ?? '#';
  if (node.type === 'model') {
    const base = `/workspace/${node.targetAppCode}/${node.targetModelCode}`;
    const qs = new URLSearchParams();
    if (node.targetViewId) qs.set('view', node.targetViewId);
    const filterPreset = (node as any).targetFilterPreset;
    if (filterPreset) {
      qs.set('filter', btoa(encodeURIComponent(JSON.stringify(filterPreset))));
    }
    const qsStr = qs.toString();
    return qsStr ? `${base}?${qsStr}` : base;
  }
  return '#';
}
