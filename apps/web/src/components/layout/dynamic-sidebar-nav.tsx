'use client';

import { useEffect } from 'react';
import { ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/utils';
import { useMenuStore } from '@/stores/menu-store';
import { MenuTreeNode } from './menu-tree-node';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export function DynamicSidebarNav({ collapsed, onToggle }: Props) {
  const { tree, loading, loaded, fetchTree } = useMenuStore();

  useEffect(() => {
    if (!loaded) fetchTree();
  }, [loaded, fetchTree]);

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border bg-card transition-all',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex items-center px-3 h-14 border-b border-border',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        {!collapsed && <Logo />}
        <button
          type="button"
          onClick={onToggle}
          className="p-1 text-muted-foreground hover:text-foreground"
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? (
            <ChevronsRight className="w-4 h-4" />
          ) : (
            <ChevronsLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {loading && !loaded ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : tree.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3 py-2">
            （无可访问菜单）
          </p>
        ) : (
          tree.map((node) => (
            <MenuTreeNode key={node.id} node={node} collapsed={collapsed} />
          ))
        )}
      </nav>
    </aside>
  );
}
