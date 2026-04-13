'use client';

import { create } from 'zustand';

const STORAGE_KEY = 'openforge_menu_recent';
const MAX_RECENT = 15;

interface RecentItem {
  menuId: string;
  name: string;
  appCode: string;
  modelCode: string;
  viewType?: string;
  viewId?: string;
  icon?: string;
  timestamp: number;
}

interface RecentState {
  items: RecentItem[];
  addRecent: (item: Omit<RecentItem, 'timestamp'>) => void;
  getRecent: () => RecentItem[];
}

function loadRecent(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecent(items: RecentItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const useRecentStore = create<RecentState>((set, get) => ({
  items: loadRecent(),
  addRecent: (item) => {
    set((state) => {
      const filtered = state.items.filter((i) => i.menuId !== item.menuId);
      const next = [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT);
      saveRecent(next);
      return { items: next };
    });
  },
  getRecent: () => get().items,
}));
