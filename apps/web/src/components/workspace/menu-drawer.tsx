'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Star, ChevronRight, X, Clock, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icon';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useMenuStore } from '@/stores/menu-store';
import { useTabStore } from '@/stores/tab-store';
import { useFavoriteStore } from '@/stores/favorite-store';
import { useRecentStore } from '@/stores/recent-store';
import { useCurrentApp } from '@/hooks/use-current-app';
import { buildModelRoute } from '@/components/layout/menu-tree-node';
import type { MenuNode } from '@openforge/shared';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

type TabKey = 'all' | 'favorites' | 'recent';

interface L1Section {
  node: MenuNode;
  l2Items: L2Item[];
}

interface L2Item {
  node: MenuNode;
  /** L3 groups or leaf items to show in the right panel */
  rightPanelGroups: RightPanelGroup[];
}

interface RightPanelGroup {
  name: string;
  items: MenuNode[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Build the drawer data structure from the menu tree.
 * depth-0 groups -> L1 (left panel sections)
 * depth-1 groups -> L2 (left panel clickable items)
 * depth-2 groups -> L3 (right panel group headers)
 * depth-2/3 leaf nodes -> right panel items
 * Non-group depth-1 children -> right panel under "默认" group
 */
function buildDrawerStructure(tree: MenuNode[]): L1Section[] {
  const sections: L1Section[] = [];

  for (const l1 of tree) {
    if (l1.type !== 'group') continue;

    const l2Items: L2Item[] = [];

    for (const child of l1.children) {
      if (child.type === 'divider') continue;

      if (child.type === 'group') {
        // depth-1 group -> L2
        const rightPanelGroups = buildRightPanelGroups(child.children);
        l2Items.push({ node: child, rightPanelGroups });
      } else {
        // depth-1 leaf -> fold into a virtual L2 "默认"
        let defaultL2 = l2Items.find((l) => l.node.id === `__default_${l1.id}`);
        if (!defaultL2) {
          defaultL2 = {
            node: {
              id: `__default_${l1.id}`,
              appId: l1.appId,
              code: '__default',
              type: 'group',
              name: '默认',
              sortOrder: -1,
              children: [],
              permissions: [],
            },
            rightPanelGroups: [{ name: '默认', items: [] }],
          };
          l2Items.unshift(defaultL2);
        }
        defaultL2.rightPanelGroups[0].items.push(child);
      }
    }

    if (l2Items.length > 0) {
      sections.push({ node: l1, l2Items });
    }
  }

  return sections;
}

function buildRightPanelGroups(children: MenuNode[]): RightPanelGroup[] {
  const groups: RightPanelGroup[] = [];
  let defaultGroup: RightPanelGroup | null = null;

  for (const child of children) {
    if (child.type === 'divider') continue;

    if (child.type === 'group') {
      // depth-2 group -> L3 header
      const leaves = collectAllLeaves(child.children);
      if (leaves.length > 0) {
        groups.push({ name: child.name, items: leaves });
      }
    } else {
      // depth-2 leaf -> "默认" group
      if (!defaultGroup) {
        defaultGroup = { name: '默认', items: [] };
        groups.unshift(defaultGroup);
      }
      defaultGroup.items.push(child);
    }
  }

  return groups;
}

function collectAllLeaves(nodes: MenuNode[]): MenuNode[] {
  const result: MenuNode[] = [];
  for (const n of nodes) {
    if (n.type === 'divider') continue;
    if (n.type === 'model' || n.type === 'link' || n.type === 'page') {
      result.push(n);
    }
    if (n.children?.length) {
      result.push(...collectAllLeaves(n.children));
    }
  }
  return result;
}

/** Collect all leaf nodes from entire tree (for search / favorites) */
function collectAllTreeLeaves(tree: MenuNode[]): MenuNode[] {
  const result: MenuNode[] = [];
  for (const n of tree) {
    if (n.type === 'model' || n.type === 'link' || n.type === 'page') {
      result.push(n);
    }
    if (n.children?.length) {
      result.push(...collectAllTreeLeaves(n.children));
    }
  }
  return result;
}

/**
 * Find which L1 section a leaf node belongs to by walking the tree.
 */
function findL1Name(tree: MenuNode[], targetId: string): string {
  for (const l1 of tree) {
    if (l1.id === targetId) return l1.name;
    if (containsNode(l1.children, targetId)) return l1.name;
  }
  return '';
}

function containsNode(nodes: MenuNode[], targetId: string): boolean {
  for (const n of nodes) {
    if (n.id === targetId) return true;
    if (n.children?.length && containsNode(n.children, targetId)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

interface MenuDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MenuDrawer({ open, onOpenChange }: MenuDrawerProps) {
  const router = useRouter();
  const { appCode } = useCurrentApp();

  /* Stores */
  const menuState = useMenuStore((s) => (appCode ? s.byApp.get(appCode) : undefined));
  const tree = menuState?.tree ?? [];
  const openListTab = useTabStore((s) => s.openListTab);
  const favoriteIds = useFavoriteStore((s) => s.ids);
  const isFavorite = useFavoriteStore((s) => s.isFavorite);
  const toggleFavorite = useFavoriteStore((s) => s.toggle);
  const recentItems = useRecentStore((s) => s.items);
  const addRecent = useRecentStore((s) => s.addRecent);

  /* Local state */
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [expandedL1, setExpandedL1] = useState<Set<string>>(new Set());
  const [selectedL2Id, setSelectedL2Id] = useState<string | null>(null);

  /* Derived data */
  const sections = useMemo(() => buildDrawerStructure(tree), [tree]);
  const allLeaves = useMemo(() => collectAllTreeLeaves(tree), [tree]);

  /* Auto-expand first L1 and select first L2 on open */
  useEffect(() => {
    if (open && sections.length > 0) {
      const firstL1Id = sections[0].node.id;
      setExpandedL1(new Set([firstL1Id]));
      if (sections[0].l2Items.length > 0) {
        setSelectedL2Id(sections[0].l2Items[0].node.id);
      }
      setSearch('');
      setActiveTab('all');
    }
  }, [open, sections]);

  /* Keyboard shortcut: Ctrl+K / Cmd+K */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  /* Toggle L1 expansion */
  const toggleL1 = useCallback((id: string) => {
    setExpandedL1((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* Handle item click */
  const handleItemClick = useCallback(
    (node: MenuNode) => {
      if (node.type === 'link') {
        window.open(node.targetUrl ?? '#', '_blank');
        onOpenChange(false);
        return;
      }

      if (node.type === 'model' && node.targetAppCode && node.targetModelCode) {
        const route = buildModelRoute(node);
        router.push(route);
        openListTab({
          appCode: node.targetAppCode,
          modelCode: node.targetModelCode,
          modelName: node.name,
          icon: node.icon ?? undefined,
          viewType: node.targetViewType ?? undefined,
        });
        addRecent({
          menuId: node.id,
          name: node.name,
          appCode: node.targetAppCode,
          modelCode: node.targetModelCode,
          viewType: node.targetViewType ?? undefined,
          viewId: node.targetViewId ?? undefined,
          icon: node.icon ?? undefined,
        });
        onOpenChange(false);
      }
    },
    [router, openListTab, addRecent, onOpenChange],
  );

  /* Handle recent item click */
  const handleRecentClick = useCallback(
    (item: (typeof recentItems)[0]) => {
      const base = `/workspace/${item.appCode}/${item.modelCode}`;
      const qs = new URLSearchParams();
      if (item.viewId) qs.set('view', item.viewId);
      else if (item.viewType) qs.set('type', item.viewType);
      const s = qs.toString();
      const route = s ? `${base}?${s}` : base;

      router.push(route);
      openListTab({
        appCode: item.appCode,
        modelCode: item.modelCode,
        modelName: item.name,
        icon: item.icon,
        viewType: item.viewType,
      });
      addRecent(item);
      onOpenChange(false);
    },
    [router, openListTab, addRecent, onOpenChange],
  );

  /* Search filtering */
  const searchQuery = search.trim().toLowerCase();
  const filteredBySearch = useMemo(() => {
    if (!searchQuery) return null;
    const matched = allLeaves.filter((n) => n.name.toLowerCase().includes(searchQuery));
    // Group by L1 section
    const grouped = new Map<string, MenuNode[]>();
    for (const leaf of matched) {
      const l1Name = findL1Name(tree, leaf.id) || '其他';
      if (!grouped.has(l1Name)) grouped.set(l1Name, []);
      grouped.get(l1Name)!.push(leaf);
    }
    return grouped;
  }, [searchQuery, allLeaves, tree]);

  /* Favorites list */
  const favoriteLeaves = useMemo(
    () => allLeaves.filter((n) => favoriteIds.has(n.id)),
    [allLeaves, favoriteIds],
  );

  /* Find the currently selected L2's right panel data */
  const selectedL2 = useMemo(() => {
    if (!selectedL2Id) return null;
    for (const s of sections) {
      const found = s.l2Items.find((l) => l.node.id === selectedL2Id);
      if (found) return found;
    }
    return null;
  }, [selectedL2Id, sections]);

  /* ---- Render ---- */

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[80vw] max-w-[920px] sm:max-w-[920px]! p-0 gap-0 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索当前系统功能..."
              className={cn(
                'w-full h-8 pl-8 pr-3 rounded-md text-sm bg-background',
                'border border-input focus:outline-none focus:ring-1 focus:ring-primary',
              )}
              autoFocus
            />
          </div>

          {/* Tabs */}
          <div className="flex items-center bg-muted rounded-md p-0.5 shrink-0">
            {(['all', 'favorites', 'recent'] as TabKey[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-all',
                  activeTab === tab
                    ? 'bg-background text-foreground shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab === 'all' && '全部'}
                {tab === 'favorites' && '收藏'}
                {tab === 'recent' && '最近'}
              </button>
            ))}
          </div>

          {/* Close — always far right */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="shrink-0 ml-auto inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* ---- Search results ---- */}
          {activeTab === 'all' && searchQuery && filteredBySearch ? (
            <div className="flex-1 overflow-y-auto p-5">
              {filteredBySearch.size === 0 && (
                <div className="text-sm text-muted-foreground text-center py-10">
                  未找到匹配的功能
                </div>
              )}
              {Array.from(filteredBySearch.entries()).map(([sectionName, items]) => (
                <div key={sectionName} className="mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-[3px] h-3.5 rounded bg-primary" />
                    <span className="text-sm font-semibold text-foreground">{sectionName}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.map((item) => (
                      <DrawerItem
                        key={item.id}
                        node={item}
                        isFav={isFavorite(item.id)}
                        onToggleFav={() => toggleFavorite(item.id)}
                        onClick={() => handleItemClick(item)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : activeTab === 'favorites' ? (
            /* ---- Favorites ---- */
            <div className="flex-1 overflow-y-auto p-5">
              {favoriteLeaves.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Star className="w-8 h-8 mb-3 text-muted-foreground/40" />
                  <p className="text-sm">暂无收藏</p>
                  <p className="text-xs mt-1">点击功能项上的星标可添加收藏</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {favoriteLeaves.map((item) => (
                    <DrawerItem
                      key={item.id}
                      node={item}
                      isFav={true}
                      onToggleFav={() => toggleFavorite(item.id)}
                      onClick={() => handleItemClick(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'recent' ? (
            /* ---- Recent ---- */
            <div className="flex-1 overflow-y-auto p-5">
              {recentItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Clock className="w-8 h-8 mb-3 text-muted-foreground/40" />
                  <p className="text-sm">暂无最近访问</p>
                  <p className="text-xs mt-1">打开功能后会自动记录</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {recentItems.map((item) => (
                    <RecentItem
                      key={item.menuId}
                      item={item}
                      isFav={isFavorite(item.menuId)}
                      onToggleFav={() => toggleFavorite(item.menuId)}
                      onClick={() => handleRecentClick(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ---- All (two-panel) ---- */
            <>
              {/* Left panel */}
              <div className="w-[200px] shrink-0 bg-muted border-r overflow-y-auto">
                {sections.map((section) => (
                  <div key={section.node.id}>
                    {/* L1 */}
                    <button
                      type="button"
                      onClick={() => toggleL1(section.node.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold',
                        'text-foreground hover:bg-background/50 transition-colors',
                      )}
                    >
                      <ChevronRight
                        className={cn(
                          'w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
                          expandedL1.has(section.node.id) && 'rotate-90',
                        )}
                      />
                      {section.node.icon && (
                        <Icon name={section.node.icon} className="w-4 h-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate flex-1 text-left">{section.node.name}</span>
                    </button>

                    {/* L2 items */}
                    {expandedL1.has(section.node.id) && (
                      <div className="pb-1">
                        {section.l2Items.map((l2) => (
                          <button
                            key={l2.node.id}
                            type="button"
                            onClick={() => setSelectedL2Id(l2.node.id)}
                            className={cn(
                              'w-full flex items-center gap-2 py-1.5 text-sm transition-all',
                              'pl-8 pr-3',
                              selectedL2Id === l2.node.id
                                ? 'bg-background text-primary font-medium border-l-3 border-primary'
                                : 'text-muted-foreground hover:text-foreground hover:bg-background/50',
                            )}
                          >
                            <span className="truncate">{l2.node.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {sections.length === 0 && (
                  <div className="p-4 text-xs text-muted-foreground text-center">
                    暂无菜单
                  </div>
                )}
              </div>

              {/* Right panel */}
              <div className="flex-1 overflow-y-auto p-5">
                {selectedL2 ? (
                  selectedL2.rightPanelGroups.map((group) => (
                    <div key={group.name} className="mb-5 last:mb-0">
                      {/* L3 group header */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-[3px] h-3.5 rounded bg-primary" />
                        <span className="text-sm font-semibold text-foreground">
                          {group.name}
                        </span>
                      </div>

                      {/* Items grid */}
                      <div className="flex flex-wrap gap-2">
                        {group.items.map((item) => (
                          <DrawerItem
                            key={item.id}
                            node={item}
                            isFav={isFavorite(item.id)}
                            onToggleFav={() => toggleFavorite(item.id)}
                            onClick={() => handleItemClick(item)}
                          />
                        ))}
                      </div>

                      {group.items.length === 0 && (
                        <div className="text-xs text-muted-foreground py-2">
                          暂无功能项
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    请从左侧选择分类
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function DrawerItem({
  node,
  isFav,
  onToggleFav,
  onClick,
}: {
  node: MenuNode;
  isFav: boolean;
  onToggleFav: () => void;
  onClick: () => void;
}) {
  const isLink = node.type === 'link';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      className={cn(
        'group relative flex items-center gap-2 w-[170px] p-2 rounded-md text-sm cursor-pointer',
        'text-foreground transition-all',
        'hover:bg-primary/8 hover:text-primary',
      )}
    >
      {node.icon && (
        <Icon
          name={node.icon}
          className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors"
        />
      )}
      <span className="truncate flex-1 text-left">{node.name}</span>
      {isLink && (
        <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground/40" />
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav();
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
    </div>
  );
}

function RecentItem({
  item,
  isFav,
  onToggleFav,
  onClick,
}: {
  item: { menuId: string; name: string; icon?: string; appCode: string; modelCode: string };
  isFav: boolean;
  onToggleFav: () => void;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      className={cn(
        'group relative flex items-center gap-2 w-[170px] p-2 rounded-md text-sm cursor-pointer',
        'text-foreground transition-all',
        'hover:bg-primary/8 hover:text-primary',
      )}
    >
      {item.icon && (
        <Icon
          name={item.icon}
          className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors"
        />
      )}
      <span className="truncate flex-1 text-left">{item.name}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav();
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
    </div>
  );
}
