'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icon';
import type { MenuNode } from '@openforge/shared';

interface Props {
  node: MenuNode;
  depth?: number;
  collapsed: boolean;
}

function buildModelRoute(node: MenuNode): string {
  const base = `/workspace/${node.targetAppCode}/${node.targetModelCode}`;
  const qs = new URLSearchParams();
  if (node.targetViewId) {
    qs.set('view', node.targetViewId);
  } else if (node.targetViewType) {
    qs.set('type', node.targetViewType);
  }
  const qsStr = qs.toString();
  return qsStr ? `${base}?${qsStr}` : base;
}

export function MenuTreeNode({ node, depth = 0, collapsed }: Props) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);

  if (node.type === 'divider') {
    return <hr className="my-2 border-border" />;
  }

  if (node.type === 'group') {
    if (node.children.length === 0) return null;
    return (
      <div>
        {!collapsed && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
        )}
        {expanded && (
          <div className={cn(collapsed ? '' : 'ml-2')}>
            {node.children.map((child) => (
              <MenuTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                collapsed={collapsed}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (node.type === 'link') {
    return (
      <a
        href={node.targetUrl ?? '#'}
        target="_blank"
        rel="noreferrer"
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
          collapsed && 'justify-center px-0',
        )}
      >
        {node.icon && <Icon name={node.icon} className="w-4 h-4 shrink-0" />}
        {!collapsed && <span className="truncate">{node.name}</span>}
      </a>
    );
  }

  // page or model
  const href = node.type === 'model' ? buildModelRoute(node) : '#';
  const isActive = pathname === href || pathname?.startsWith(href + '/');

  return (
    <Link
      href={href}
      title={collapsed ? node.name : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        collapsed && 'justify-center px-0',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {node.icon && <Icon name={node.icon} className="w-4 h-4 shrink-0" />}
      {!collapsed && <span className="truncate">{node.name}</span>}
    </Link>
  );
}
