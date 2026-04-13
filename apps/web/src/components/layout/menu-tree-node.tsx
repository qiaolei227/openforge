'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icon';
import { useFavoriteStore } from '@/stores/favorite-store';
import { useTabStore } from '@/stores/tab-store';
import type { MenuNode } from '@openforge/shared';

export function buildModelRoute(node: MenuNode): string {
  const base = `/workspace/${node.targetAppCode}/${node.targetModelCode}`;
  const qs = new URLSearchParams();
  if (node.targetViewId) qs.set('view', node.targetViewId);
  else if (node.targetViewType) qs.set('type', node.targetViewType);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

/** Check if any descendant is the active route */
export function hasActiveDescendant(nodes: MenuNode[], pathname: string): boolean {
  for (const n of nodes) {
    if (n.type === 'model') {
      const href = buildModelRoute(n);
      if (pathname === href || pathname?.startsWith(href + '/')) return true;
    }
    if (n.children?.length && hasActiveDescendant(n.children, pathname)) return true;
  }
  return false;
}

/** Collect all leaf nodes from a tree */
export function collectLeaves(nodes: MenuNode[]): MenuNode[] {
  const result: MenuNode[] = [];
  for (const n of nodes) {
    if (n.type === 'model' || n.type === 'link') result.push(n);
    if (n.children?.length) result.push(...collectLeaves(n.children));
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Animated collapse wrapper                                          */
/* ------------------------------------------------------------------ */

function CollapsibleContent({
  expanded,
  children,
}: {
  expanded: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>(() => (expanded ? 'auto' : 0));
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const el = ref.current;
    if (!el) return;

    if (expanded) {
      const h = el.scrollHeight;
      setHeight(h);
      const timer = setTimeout(() => setHeight('auto'), 200);
      return () => clearTimeout(timer);
    } else {
      setHeight(el.scrollHeight);
      requestAnimationFrame(() => setHeight(0));
    }
  }, [expanded]);

  return (
    <div
      ref={ref}
      className="overflow-hidden transition-[height] duration-200 ease-in-out"
      style={{ height: typeof height === 'number' ? `${height}px` : 'auto' }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Star button                                                        */
/* ------------------------------------------------------------------ */

function StarButton({ nodeId }: { nodeId: string }) {
  const isFav = useFavoriteStore((s) => s.isFavorite(nodeId));
  const toggle = useFavoriteStore((s) => s.toggle);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(nodeId);
      }}
      className={cn(
        'shrink-0 p-0.5 rounded transition-all',
        isFav
          ? 'text-amber-400 opacity-100'
          : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-amber-400',
      )}
      title={isFav ? '取消收藏' : '收藏'}
    >
      <Star className={cn('w-3 h-3', isFav && 'fill-amber-400')} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  node: MenuNode;
  depth?: number;
  /** Compact mode for favorites section */
  compact?: boolean;
}

export function MenuTreeNode({ node, depth = 0, compact }: Props) {
  const pathname = usePathname();
  const isTopLevelGroup = depth === 0 && node.type === 'group';
  const childActive = node.children?.length
    ? hasActiveDescendant(node.children, pathname)
    : false;
  const [expanded, setExpanded] = useState(true);

  /* ---- divider ---- */
  if (node.type === 'divider') {
    return <hr className="my-3 mx-3 border-border/40" />;
  }

  /* ---- group ---- */
  if (node.type === 'group') {
    if (isTopLevelGroup) {
      return (
        <div className="mt-4 first:mt-1">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={cn(
              'group w-full flex items-center gap-2 px-3 py-1.5 rounded-md',
              'text-sm transition-colors',
              childActive
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
            )}
          >
            {/* Accent bar */}
            <span
              className={cn(
                'w-[3px] h-3.5 rounded-full shrink-0 transition-colors',
                childActive ? 'bg-primary' : 'bg-border group-hover:bg-muted-foreground/40',
              )}
            />
            {node.icon && (
              <Icon
                name={node.icon}
                className={cn(
                  'w-4 h-4 shrink-0 transition-colors',
                  childActive ? 'text-primary' : 'text-muted-foreground/60 group-hover:text-muted-foreground',
                )}
              />
            )}
            <span className="flex-1 text-left truncate">{node.name}</span>
            <ChevronRight
              className={cn(
                'w-3.5 h-3.5 shrink-0 transition-all duration-200',
                'text-muted-foreground/40',
                expanded && 'rotate-90',
              )}
            />
          </button>

          <CollapsibleContent expanded={expanded}>
            <div className="mt-0.5 space-y-0.5">
              {node.children.map((child) => (
                <MenuTreeNode key={child.id} node={child} depth={depth + 1} />
              ))}
            </div>
          </CollapsibleContent>
        </div>
      );
    }

    // Nested group
    return (
      <div className="mt-0.5">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={cn(
            'group w-full flex items-center gap-2 rounded-md py-1.5',
            'text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40',
            'transition-colors',
          )}
          style={{ paddingLeft: `${14 + depth * 14}px`, paddingRight: '12px' }}
        >
          <ChevronRight
            className={cn(
              'w-3.5 h-3.5 shrink-0 transition-transform duration-200',
              expanded && 'rotate-90',
            )}
          />
          <span className="truncate flex-1 text-left">{node.name}</span>
        </button>

        <CollapsibleContent expanded={expanded}>
          <div className="relative">
            <div
              className="absolute top-0 bottom-0 w-px bg-border/40"
              style={{ left: `${20 + depth * 14}px` }}
            />
            <div className="space-y-0.5">
              {node.children.map((child) => (
                <MenuTreeNode key={child.id} node={child} depth={depth + 1} />
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    );
  }

  /* ---- link (external) ---- */
  if (node.type === 'link') {
    return (
      <a
        href={node.targetUrl ?? '#'}
        target="_blank"
        rel="noreferrer"
        className={cn(
          'group flex items-center gap-2 rounded-md py-1.5 text-sm transition-colors',
          'text-muted-foreground hover:bg-primary/5 hover:text-foreground',
        )}
        style={{ paddingLeft: compact ? '12px' : `${14 + depth * 14}px`, paddingRight: '12px' }}
      >
        {node.icon && <Icon name={node.icon} className="w-4 h-4 shrink-0 text-muted-foreground/60" />}
        <span className="truncate flex-1">{node.name}</span>
        <StarButton nodeId={node.id} />
      </a>
    );
  }

  /* ---- model / page ---- */
  const href = node.type === 'model' ? buildModelRoute(node) : '#';
  const isActive = pathname === href || pathname?.startsWith(href + '/');

  const openListTab = useTabStore((s) => s.openListTab);

  /** Open a tab alongside URL navigation for model-type menu items */
  const handleClick = useCallback(() => {
    if (node.type === 'model' && node.targetAppCode && node.targetModelCode) {
      openListTab({
        appCode: node.targetAppCode,
        modelCode: node.targetModelCode,
        modelName: node.name,
        icon: node.icon ?? undefined,
        viewType: node.targetViewType ?? undefined,
      });
    }
  }, [node, openListTab]);

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={cn(
        'group relative flex items-center gap-2 rounded-md py-1.5 text-sm transition-all duration-150',
        isActive
          ? 'bg-primary/8 text-primary font-medium'
          : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground',
      )}
      style={{ paddingLeft: compact ? '12px' : `${14 + depth * 14}px`, paddingRight: '12px' }}
    >
      {/* Active indicator bar */}
      {isActive && (
        <span className="absolute left-1 top-1.5 bottom-1.5 w-[3px] rounded-full bg-primary" />
      )}
      {node.icon && (
        <Icon
          name={node.icon}
          className={cn(
            'w-4 h-4 shrink-0 transition-colors',
            isActive ? 'text-primary' : 'text-muted-foreground/60 group-hover:text-foreground',
          )}
        />
      )}
      <span className="truncate flex-1">{node.name}</span>
      <StarButton nodeId={node.id} />
    </Link>
  );
}
