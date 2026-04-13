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

  openListTab: (params: { appCode: string; modelCode: string; modelName: string; icon?: string }) => string;
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
}

let counter = 0;
const genId = () => `tab-${++counter}`;

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openListTab({ appCode, modelCode, modelName, icon }) {
    const { tabs } = get();
    const existing = tabs.find(
      (t) => t.type === 'list' && t.appCode === appCode && t.modelCode === modelCode,
    );
    if (existing) {
      set({ activeTabId: existing.id });
      return existing.id;
    }
    const id = genId();
    const tab: Tab = { id, type: 'list', appCode, modelCode, modelName, title: modelName, icon, dirty: false };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
    return id;
  },

  openDetailTab({ appCode, modelCode, modelName, recordId, title }) {
    const { tabs } = get();
    const existing = tabs.find((t) => t.type === 'detail' && t.recordId === recordId);
    if (existing) {
      set({ activeTabId: existing.id });
      return existing.id;
    }
    const id = genId();
    const tab: Tab = { id, type: 'detail', appCode, modelCode, modelName, recordId, title, dirty: false };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
    return id;
  },

  openCreateTab({ appCode, modelCode, modelName }) {
    const id = genId();
    const tab: Tab = { id, type: 'create', appCode, modelCode, modelName, title: `新建${modelName}`, dirty: false };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
    return id;
  },

  closeTab(tabId) {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === tabId);
      const newTabs = s.tabs.filter((t) => t.id !== tabId);
      let newActive = s.activeTabId;
      if (s.activeTabId === tabId) {
        const nextIdx = Math.min(idx, newTabs.length - 1);
        newActive = newTabs[nextIdx]?.id ?? null;
      }
      return { tabs: newTabs, activeTabId: newActive };
    });
  },

  closeOtherTabs(tabId) {
    set((s) => ({
      tabs: s.tabs.filter((t) => t.id === tabId),
      activeTabId: tabId,
    }));
  },

  closeRightTabs(tabId) {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === tabId);
      return {
        tabs: s.tabs.slice(0, idx + 1),
        activeTabId: s.tabs.find((t) => t.id === s.activeTabId && s.tabs.indexOf(t) <= idx)
          ? s.activeTabId
          : tabId,
      };
    });
  },

  setActiveTab(tabId) {
    set({ activeTabId: tabId });
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
}));
