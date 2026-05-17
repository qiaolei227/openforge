import { apiClient } from '@/lib/api-client';

export interface Notification {
  id: string;
  userId: string;
  orgId?: string;
  type: string;
  title: string;
  body?: string;
  relatedType?: string;
  relatedId?: string;
  navigateTo?: string;
  data?: any;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface NotificationListParams {
  type?: string;
  isRead?: 'true' | 'false';
  since?: string;
  limit?: number;
}

export const notificationApi = {
  async list(params: NotificationListParams = {}): Promise<Notification[]> {
    const { data } = await apiClient.get<Notification[]>('/notifications', {
      params,
    });
    return data;
  },
  async unreadCount(): Promise<{ count: number }> {
    const { data } = await apiClient.get<{ count: number }>(
      '/notifications/unread-count',
    );
    return data;
  },
  async markRead(id: string): Promise<void> {
    await apiClient.patch(`/notifications/${id}/read`);
  },
  async markAllRead(type?: string): Promise<void> {
    await apiClient.post('/notifications/read-all', { type });
  },
};
