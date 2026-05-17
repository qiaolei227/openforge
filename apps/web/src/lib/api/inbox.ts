import { apiClient } from '@/lib/api-client';

export interface InboxQueryParams {
  appId?: string;
  orgId?: string;
  limit?: number;
  offset?: number;
}

export interface InboxItem {
  id: string;
  instanceId: string;
  modelId: string;
  recordId: string;
  appCode?: string;
  modelCode?: string;
  title?: string;
  submitter?: { id: string; displayName?: string; username?: string };
  status?: string;
  createdAt: string;
  [key: string]: any;
}

export interface InboxCounts {
  pending: number;
  done: number;
  cc: number;
  myInstances: number;
}

export const inboxApi = {
  async pending(params: InboxQueryParams = {}): Promise<InboxItem[]> {
    const { data } = await apiClient.get<InboxItem[]>('/inbox/pending', { params });
    return data;
  },
  async done(params: InboxQueryParams = {}): Promise<InboxItem[]> {
    const { data } = await apiClient.get<InboxItem[]>('/inbox/done', { params });
    return data;
  },
  async cc(params: InboxQueryParams = {}): Promise<InboxItem[]> {
    const { data } = await apiClient.get<InboxItem[]>('/inbox/cc', { params });
    return data;
  },
  async myInstances(params: InboxQueryParams = {}): Promise<InboxItem[]> {
    const { data } = await apiClient.get<InboxItem[]>('/inbox/my-instances', {
      params,
    });
    return data;
  },
  async counts(): Promise<InboxCounts> {
    const { data } = await apiClient.get<InboxCounts>('/inbox/counts');
    return data;
  },
};
