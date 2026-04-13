'use client';

import { create } from 'zustand';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface DesignerBreadcrumbStore {
  items: BreadcrumbItem[];
  set: (items: BreadcrumbItem[]) => void;
  clear: () => void;
}

export const useDesignerBreadcrumbStore = create<DesignerBreadcrumbStore>((set) => ({
  items: [],
  set: (items) => set({ items }),
  clear: () => set({ items: [] }),
}));
