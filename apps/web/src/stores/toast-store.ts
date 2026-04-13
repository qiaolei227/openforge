'use client';

import { create } from 'zustand';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface ToastStore {
  toasts: Toast[];
  show: (message: string, type: 'success' | 'error') => void;
  dismiss: (id: number) => void;
}

let nextId = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show(message, type) {
    const id = ++nextId;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
