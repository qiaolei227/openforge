'use client';

import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import type { MenuNode } from '@openforge/shared';

interface AppMenuState {
  tree: MenuNode[];
  loading: boolean;
  error: unknown | null;
  loadedAt: number | null;
}

interface MenuStore {
  /** Per-app menu cache keyed by appCode */
  byApp: Map<string, AppMenuState>;

  /** Global (all-app) menu cache — used by root page and useCanAccessDesigner */
  globalTree: MenuNode[];
  globalLoading: boolean;
  globalLoadedAt: number | null;

  /** Fetch menu tree for a specific app */
  fetch: (appCode: string, force?: boolean) => Promise<void>;

  /** Fetch the global (all-app) tree — equivalent to old fetchTree() */
  fetchGlobal: (force?: boolean) => Promise<void>;

  /** Invalidate cache. If appCode provided, only that app; otherwise clear all. */
  invalidate: (appCode?: string) => void;

  /** Flatten the global tree and find the permissions array for a given menu code */
  getPermissions: (code: string) => string[];
}

const STALE_MS = 5 * 60 * 1000;

function flatten(nodes: MenuNode[], out: MenuNode[] = []): MenuNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) flatten(n.children, out);
  }
  return out;
}

export const useMenuStore = create<MenuStore>((set, get) => ({
  byApp: new Map(),
  globalTree: [],
  globalLoading: false,
  globalLoadedAt: null,

  async fetch(appCode: string, force = false) {
    const existing = get().byApp.get(appCode);
    if (
      !force &&
      existing &&
      !existing.loading &&
      existing.loadedAt &&
      Date.now() - existing.loadedAt < STALE_MS
    ) {
      return;
    }

    set((s) => {
      const next = new Map(s.byApp);
      next.set(appCode, {
        tree: existing?.tree ?? [],
        loading: true,
        error: null,
        loadedAt: existing?.loadedAt ?? null,
      });
      return { byApp: next };
    });

    try {
      const { data } = await apiClient.get<MenuNode[]>(
        `/menus/tree?appCode=${encodeURIComponent(appCode)}`,
      );
      set((s) => {
        const next = new Map(s.byApp);
        next.set(appCode, {
          tree: data ?? [],
          loading: false,
          error: null,
          loadedAt: Date.now(),
        });
        return { byApp: next };
      });
    } catch (e) {
      set((s) => {
        const next = new Map(s.byApp);
        next.set(appCode, {
          tree: existing?.tree ?? [],
          loading: false,
          error: e,
          loadedAt: existing?.loadedAt ?? null,
        });
        return { byApp: next };
      });
    }
  },

  async fetchGlobal(force = false) {
    const { globalLoading, globalLoadedAt } = get();
    if (!force && globalLoadedAt && !globalLoading && Date.now() - globalLoadedAt < STALE_MS) {
      return;
    }

    set({ globalLoading: true });

    try {
      const { data } = await apiClient.get<MenuNode[]>('/menus/tree');
      set({ globalTree: data ?? [], globalLoading: false, globalLoadedAt: Date.now() });
    } catch {
      set({ globalLoading: false });
    }
  },

  invalidate(appCode?: string) {
    set((s) => {
      const next = new Map(s.byApp);
      if (appCode) {
        next.delete(appCode);
      } else {
        next.clear();
      }
      return {
        byApp: next,
        // Also reset global cache when invalidating
        ...(appCode ? {} : { globalTree: [], globalLoadedAt: null }),
      };
    });
  },

  getPermissions(code: string) {
    const flat = flatten(get().globalTree);
    const node = flat.find((n) => n.code === code);
    return node?.permissions ?? [];
  },
}));
