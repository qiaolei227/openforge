'use client';

import { create } from 'zustand';

export type TabType = 'list' | 'detail' | 'create';

export interface Tab {
  id: string;
  type: TabType;
  appCode: string;
  modelCode: string;
  modelName: string;
  recordId?: string;
  title: string;
  icon?: string;
  dirty: boolean;
  /** When opened from a menu with targetViewType, preserved for dedup */
  menuViewType?: string;
  listState?: {
    scrollTop: number;
    filter: any;
    page: number;
    selectedIds: string[];
    keyword: string;
  };
}

interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;
  /** Per-app last-active tab — restored when switching back to that system */
  activeByApp: Record<string, string>;

  openListTab: (params: { appCode: string; modelCode: string; modelName: string; icon?: string; viewType?: string }) => string;
  openDetailTab: (params: { appCode: string; modelCode: string; modelName: string; recordId: string; title: string }) => string;
  openCreateTab: (params: { appCode: string; modelCode: string; modelName: string }) => string;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeRightTabs: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setDirty: (tabId: string, dirty: boolean) => void;
  updateListState: (tabId: string, state: Partial<Tab['listState']>) => void;
  updateTitle: (tabId: string, title: string) => void;
  getActiveTab: () => Tab | undefined;
  /** Get the active tab scoped to a specific system */
  getActiveTabForApp: (appCode: string) => Tab | undefined;
}

let counter = 0;
const genId = () => `tab-${++counter}`;

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  activeByApp: {},

  openListTab({ appCode, modelCode, modelName, icon, viewType }) {
    const { tabs } = get();

    if (viewType === 'form') {
      const existing = tabs.find(
        (t) => t.menuViewType === 'form' && t.appCode === appCode && t.modelCode === modelCode,
      );
      if (existing) {
        set((s) => ({ activeTabId: existing.id, activeByApp: { ...s.activeByApp, [appCode]: existing.id } }));
        return existing.id;
      }
      const id = genId();
      const tab: Tab = { id, type: 'create', appCode, modelCode, modelName, title: modelName, icon, dirty: false, menuViewType: 'form' };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id, activeByApp: { ...s.activeByApp, [appCode]: id } }));
      return id;
    }

    const existing = tabs.find(
      (t) => t.type === 'list' && t.appCode === appCode && t.modelCode === modelCode,
    );
    if (existing) {
      set((s) => ({ activeTabId: existing.id, activeByApp: { ...s.activeByApp, [appCode]: existing.id } }));
      return existing.id;
    }
    const id = genId();
    const tab: Tab = { id, type: 'list', appCode, modelCode, modelName, title: modelName, icon, dirty: false };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id, activeByApp: { ...s.activeByApp, [appCode]: id } }));
    return id;
  },

  openDetailTab({ appCode, modelCode, modelName, recordId, title }) {
    const { tabs } = get();
    const existing = tabs.find((t) => t.type === 'detail' && t.recordId === recordId);
    if (existing) {
      set((s) => ({ activeTabId: existing.id, activeByApp: { ...s.activeByApp, [appCode]: existing.id } }));
      return existing.id;
    }
    const id = genId();
    const tab: Tab = { id, type: 'detail', appCode, modelCode, modelName, recordId, title, dirty: false };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id, activeByApp: { ...s.activeByApp, [appCode]: id } }));
    return id;
  },

  openCreateTab({ appCode, modelCode, modelName }) {
    const id = genId();
    const tab: Tab = { id, type: 'create', appCode, modelCode, modelName, title: `新建${modelName}`, dirty: false };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id, activeByApp: { ...s.activeByApp, [appCode]: id } }));
    return id;
  },

  closeTab(tabId) {
    set((s) => {
      const closedTab = s.tabs.find((t) => t.id === tabId);
      if (!closedTab) return s;

      const newTabs = s.tabs.filter((t) => t.id !== tabId);
      const newByApp = { ...s.activeByApp };
      let newActive = s.activeTabId;

      // Find replacement within the same app
      if (s.activeTabId === tabId || newByApp[closedTab.appCode] === tabId) {
        const appTabs = newTabs.filter((t) => t.appCode === closedTab.appCode);
        const oldAppTabs = s.tabs.filter((t) => t.appCode === closedTab.appCode);
        const closedIdx = oldAppTabs.findIndex((t) => t.id === tabId);
        const nextTab = appTabs[Math.min(closedIdx, appTabs.length - 1)];
        newByApp[closedTab.appCode] = nextTab?.id ?? '';
        if (s.activeTabId === tabId) {
          newActive = nextTab?.id ?? null;
        }
      }

      return { tabs: newTabs, activeTabId: newActive, activeByApp: newByApp };
    });
  },

  closeOtherTabs(tabId) {
    set((s) => {
      const target = s.tabs.find((t) => t.id === tabId);
      if (!target) return s;
      // Keep the target tab + all tabs from OTHER systems
      return {
        tabs: s.tabs.filter((t) => t.id === tabId || t.appCode !== target.appCode),
        activeTabId: tabId,
        activeByApp: { ...s.activeByApp, [target.appCode]: tabId },
      };
    });
  },

  closeRightTabs(tabId) {
    set((s) => {
      const target = s.tabs.find((t) => t.id === tabId);
      if (!target) return s;
      // Among tabs of the same system, close those to the right
      const appTabs = s.tabs.filter((t) => t.appCode === target.appCode);
      const idx = appTabs.findIndex((t) => t.id === tabId);
      const idsToClose = new Set(appTabs.slice(idx + 1).map((t) => t.id));
      return {
        tabs: s.tabs.filter((t) => !idsToClose.has(t.id)),
        activeTabId: s.activeTabId && idsToClose.has(s.activeTabId) ? tabId : s.activeTabId,
        activeByApp: { ...s.activeByApp, [target.appCode]: tabId },
      };
    });
  },

  setActiveTab(tabId) {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    set((s) => ({ activeTabId: tabId, activeByApp: { ...s.activeByApp, [tab.appCode]: tabId } }));
  },

  setDirty(tabId, dirty) {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId);
      if (!tab || tab.dirty === dirty) return s;
      return { tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, dirty } : t)) };
    });
  },

  updateListState(tabId, state) {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, listState: { ...t.listState, ...state } as Tab['listState'] } : t,
      ),
    }));
  },

  updateTitle(tabId, title) {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId);
      if (!tab || tab.title === title) return s;
      return { tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)) };
    });
  },

  getActiveTab() {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId);
  },

  getActiveTabForApp(appCode: string) {
    const { tabs, activeByApp } = get();
    const appActiveId = activeByApp[appCode];
    if (appActiveId) {
      const tab = tabs.find((t) => t.id === appActiveId);
      if (tab) return tab;
    }
    return undefined;
  },
}));
