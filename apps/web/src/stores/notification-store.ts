'use client';

import { create } from 'zustand';
import { notificationApi, type Notification } from '@/lib/api/notification';

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  loadNotifications: () => Promise<void>;
  loadUnreadCount: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: (type?: string) => Promise<void>;
  pushIncoming: (n: Notification) => void;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  async loadNotifications() {
    set({ loading: true });
    try {
      const list = await notificationApi.list({ limit: 50 });
      set({ notifications: list, loading: false });
    } catch (e) {
      set({ loading: false });
      console.error('Failed to load notifications', e);
    }
  },

  async loadUnreadCount() {
    try {
      const { count } = await notificationApi.unreadCount();
      set({ unreadCount: count });
    } catch (e) {
      console.error('Failed to load unread count', e);
    }
  },

  async markRead(id: string) {
    const target = get().notifications.find((n) => n.id === id);
    if (!target || target.isRead) return;
    try {
      await notificationApi.markRead(id);
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n,
        ),
        unreadCount: Math.max(0, s.unreadCount - 1),
      }));
    } catch (e) {
      console.error('Failed to mark read', e);
    }
  },

  async markAllRead(type?: string) {
    try {
      await notificationApi.markAllRead(type);
      const now = new Date().toISOString();
      set((s) => ({
        notifications: s.notifications.map((n) =>
          type && n.type !== type ? n : { ...n, isRead: true, readAt: now },
        ),
        // If type-scoped, refetch unread count for accuracy; otherwise zero.
        unreadCount: type ? s.unreadCount : 0,
      }));
      if (type) {
        // Best-effort refresh for type-scoped markAllRead
        void get().loadUnreadCount();
      }
    } catch (e) {
      console.error('Failed to mark all read', e);
    }
  },

  pushIncoming(n: Notification) {
    set((s) => {
      // Dedupe by id (in case the same event arrives twice)
      if (s.notifications.some((x) => x.id === n.id)) return s;
      return {
        notifications: [n, ...s.notifications].slice(0, 100),
        unreadCount: n.isRead ? s.unreadCount : s.unreadCount + 1,
      };
    });
  },
}));
