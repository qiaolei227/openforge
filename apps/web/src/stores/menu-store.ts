'use client';

import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import type { MenuNode } from '@openforge/shared';

interface MenuStore {
  tree: MenuNode[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  fetchTree: () => Promise<void>;
  invalidate: () => void;
  /** Flatten the tree and find the permissions array for a given menu code */
  getPermissions: (code: string) => string[];
}

function flatten(nodes: MenuNode[], out: MenuNode[] = []): MenuNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) flatten(n.children, out);
  }
  return out;
}

export const useMenuStore = create<MenuStore>((set, get) => ({
  tree: [],
  loading: false,
  loaded: false,
  error: null,

  async fetchTree() {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const { data } = await apiClient.get<MenuNode[]>('/menus/tree');
      set({ tree: data, loading: false, loaded: true });
    } catch (err: any) {
      set({ error: err?.message ?? 'Failed to load menu', loading: false });
    }
  },

  invalidate() {
    set({ loaded: false, tree: [] });
  },

  getPermissions(code: string) {
    const flat = flatten(get().tree);
    const node = flat.find((n) => n.code === code);
    return node?.permissions ?? [];
  },
}));
