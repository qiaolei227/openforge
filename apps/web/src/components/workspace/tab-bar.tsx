'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useTabStore, type Tab } from '@/stores/tab-store';
import { ChevronLeft, ChevronRight, X, List, FileText, FilePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

const TAB_ICONS: Record<Tab['type'], typeof List> = {
  list: List,
  detail: FileText,
  create: FilePlus,
};

interface ContextMenuState {
  tabId: string;
  x: number;
  y: number;
}

export function TabBar() {
  const t = useTranslations('workspace.tabs');
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const closeOtherTabs = useTabStore((s) => s.closeOtherTabs);
  const closeRightTabs = useTabStore((s) => s.closeRightTabs);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Detect scroll overflow state
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState);
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState, tabs]);

  // Auto-scroll active tab into view
  useEffect(() => {
    const tab = activeTabRef.current;
    if (!tab) return;
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId]);

  const scrollLeft = () => {
    scrollRef.current?.scrollBy({ left: -120, behavior: 'smooth' });
  };

  const scrollRight = () => {
    scrollRef.current?.scrollBy({ left: 120, behavior: 'smooth' });
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  };

  const handleMiddleClick = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tabId);
    }
  };

  const closeContextMenu = () => setContextMenu(null);

  if (tabs.length === 0) return null;

  return (
    <div className="relative flex items-stretch h-9 border-b border-border bg-background shrink-0">
      {/* Left scroll arrow */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={scrollLeft}
          className="flex items-center justify-center w-7 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border-r border-border"
          aria-label="Scroll tabs left"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Tab list */}
      <div
        ref={scrollRef}
        className="flex-1 flex items-stretch overflow-x-auto scrollbar-none"
        style={{ scrollbarWidth: 'none' }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const Icon = TAB_ICONS[tab.type];
          return (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={isActive}
              Icon={Icon}
              ref={isActive ? activeTabRef : undefined}
              onActivate={() => setActiveTab(tab.id)}
              onClose={() => closeTab(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              onAuxClick={(e) => handleMiddleClick(e, tab.id)}
            />
          );
        })}
      </div>

      {/* Right scroll arrow */}
      {canScrollRight && (
        <button
          type="button"
          onClick={scrollRight}
          className="flex items-center justify-center w-7 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border-l border-border"
          aria-label="Scroll tabs right"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Context menu */}
      {contextMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={closeContextMenu}
            onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }}
          />
          {/* Menu */}
          <div
            className="fixed z-50 min-w-[140px] rounded-md border border-border bg-popover text-popover-foreground shadow-md py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={closeContextMenu}
          >
            <button
              type="button"
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => closeTab(contextMenu.tabId)}
            >
              {t('close')}
            </button>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => closeOtherTabs(contextMenu.tabId)}
            >
              {t('closeOthers')}
            </button>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => closeRightTabs(contextMenu.tabId)}
            >
              {t('closeRight')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Single Tab Item                                                     */
/* ------------------------------------------------------------------ */

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  Icon: typeof List;
  ref?: React.Ref<HTMLButtonElement>;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onAuxClick: (e: React.MouseEvent) => void;
}

function TabItem({
  tab,
  isActive,
  Icon,
  ref,
  onActivate,
  onClose,
  onContextMenu,
  onAuxClick,
}: TabItemProps) {
  return (
    <div
      className={cn(
        'group relative flex items-center gap-1.5 px-3 h-full min-w-0 max-w-[180px] shrink-0 cursor-pointer select-none border-r border-border',
        'text-sm transition-colors',
        isActive
          ? 'bg-background text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
      onClick={onActivate}
      onContextMenu={onContextMenu}
      onAuxClick={onAuxClick}
    >
      {/* Assign the ref to an invisible anchor button for scroll-into-view */}
      <button
        ref={ref}
        type="button"
        tabIndex={-1}
        aria-hidden
        className="absolute inset-0 pointer-events-none"
      />

      {/* Icon */}
      <Icon className="w-3.5 h-3.5 shrink-0" />

      {/* Title */}
      <span className="truncate flex-1 min-w-0">{tab.title}</span>

      {/* Dirty indicator */}
      {tab.dirty && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0"
          aria-label="Unsaved changes"
        />
      )}

      {/* Close button — visible on hover or when active */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className={cn(
          'shrink-0 rounded-sm p-0.5 transition-colors',
          'text-muted-foreground hover:text-foreground hover:bg-accent',
          isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        aria-label="Close tab"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
