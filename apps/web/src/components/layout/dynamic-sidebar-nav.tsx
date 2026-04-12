'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  LayoutGrid,
  Database,
  Menu as MenuIcon,
  BookOpen,
  Settings,
} from 'lucide-react';
import { useArea } from '@/hooks/use-area';
import { useCurrentApp } from '@/hooks/use-current-app';
import { useAppById } from '@/hooks/use-app-by-id';
import { useMenuStore } from '@/stores/menu-store';
import { MenuTreeNode } from './menu-tree-node';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'openforge_sidebar_collapsed';

/**
 * Area-aware sidebar:
 * - workspace  → fetches per-app menu tree, renders MenuTreeNode
 * - designer   → hardcoded design-time navigation
 * - settings / launcher / other → returns null (settings has its own sidebar via layout.tsx)
 */
export function DynamicSidebarNav() {
  const area = useArea();
  const { appCode, appId } = useCurrentApp();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') setCollapsed(true);
  }, []);

  const handleToggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  if (area === 'settings' || area === 'launcher' || area === 'other') return null;

  if (area === 'designer' && appId) {
    return (
      <SidebarShell collapsed={collapsed} onToggle={handleToggle}>
        <DesignerSidebar appId={appId} collapsed={collapsed} />
      </SidebarShell>
    );
  }

  if (area === 'workspace' && appCode) {
    return (
      <SidebarShell collapsed={collapsed} onToggle={handleToggle}>
        <WorkspaceSidebar appCode={appCode} collapsed={collapsed} />
      </SidebarShell>
    );
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Shell wrapper                                                      */
/* ------------------------------------------------------------------ */

function SidebarShell({
  collapsed,
  onToggle,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border bg-card transition-all shrink-0',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex items-center px-3 h-12 border-b border-border',
          collapsed ? 'justify-center' : 'justify-end',
        )}
      >
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

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">{children}</nav>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Workspace Sidebar — dynamic menu tree for a specific app           */
/* ------------------------------------------------------------------ */

function WorkspaceSidebar({
  appCode,
  collapsed,
}: {
  appCode: string;
  collapsed: boolean;
}) {
  const appMenuState = useMenuStore((s) => s.byApp.get(appCode));
  const fetch = useMenuStore((s) => s.fetch);

  const tree = appMenuState?.tree ?? [];
  const loading = appMenuState?.loading ?? false;
  const loaded = !!appMenuState?.loadedAt;

  useEffect(() => {
    fetch(appCode);
  }, [appCode, fetch]);

  if (loading && !loaded) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-3 py-2">
        （无可访问菜单）
      </p>
    );
  }

  return (
    <>
      {tree.map((node) => (
        <MenuTreeNode key={node.id} node={node} collapsed={collapsed} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Designer Sidebar — hardcoded design-time links                     */
/* ------------------------------------------------------------------ */

interface DesignerLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function DesignerSidebar({
  appId,
  collapsed,
}: {
  appId: string;
  collapsed: boolean;
}) {
  const { app } = useAppById(appId);
  const pathname = usePathname() ?? '';

  const links: DesignerLink[] = [
    { href: `/apps/${appId}`, label: '概览', icon: LayoutGrid },
    { href: `/apps/${appId}/models`, label: '模型', icon: Database },
    { href: `/apps/${appId}/menus`, label: '菜单', icon: MenuIcon },
    { href: `/apps/${appId}/dicts`, label: '字典', icon: BookOpen },
    { href: `/apps/${appId}/settings`, label: '设置', icon: Settings },
  ];

  return (
    <>
      {/* App name header */}
      {!collapsed && app && (
        <div className="px-3 py-2 mb-1">
          <div className="text-xs font-medium text-muted-foreground truncate">
            {app.name}
          </div>
        </div>
      )}
      {links.map((link) => {
        const isActive =
          link.href === `/apps/${appId}`
            ? pathname === link.href // exact match for overview
            : pathname === link.href || pathname.startsWith(link.href + '/');

        return (
          <Link
            key={link.href}
            href={link.href}
            title={collapsed ? link.label : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              collapsed && 'justify-center px-0',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <link.icon className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="truncate">{link.label}</span>}
          </Link>
        );
      })}
    </>
  );
}
