import { apiClient } from '@/lib/api-client';

export type WorkflowStatus =
  | 'running'
  | 'approved'
  | 'rejected'
  | 'returned'
  | 'cancelled'
  | 'withdrawn';

export type WorkflowNodeType =
  | 'start'
  | 'approve'
  | 'cc'
  | 'condition'
  | 'parallel-fork'
  | 'parallel-join'
  | 'end';

export interface WorkflowNodeFE {
  id: string;
  type: WorkflowNodeType;
  name: string;
  position: { x: number; y: number };
  config: Record<string, any>;
}

export interface WorkflowEdgeFE {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface WorkflowDefinitionFE {
  nodes: WorkflowNodeFE[];
  edges: WorkflowEdgeFE[];
}

export interface Workflow {
  id: string;
  modelId: string;
  name: string;
  description?: string;
  sortOrder: number;
  enabled: boolean;
  condition?: any;
  currentVersionId?: string;
  currentVersion?: {
    id: string;
    versionNo: number;
    definition: WorkflowDefinitionFE;
  };
  _count?: { instances: number };
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  versionNo: number;
  definition: WorkflowDefinitionFE;
  publishedBy: string;
  publishedAt: string;
}

export interface CreateWorkflowDto {
  name: string;
  description?: string;
  enabled?: boolean;
  condition?: any;
  sortOrder?: number;
}

export type UpdateWorkflowDto = Partial<CreateWorkflowDto>;

export const workflowApi = {
  async list(appCode: string, modelCode: string): Promise<Workflow[]> {
    const { data } = await apiClient.get<Workflow[]>(
      `/apps/${appCode}/models/${modelCode}/workflows`,
    );
    return data;
  },
  async create(
    appCode: string,
    modelCode: string,
    body: CreateWorkflowDto,
  ): Promise<Workflow> {
    const { data } = await apiClient.post<Workflow>(
      `/apps/${appCode}/models/${modelCode}/workflows`,
      body,
    );
    return data;
  },
  async update(id: string, body: UpdateWorkflowDto): Promise<Workflow> {
    const { data } = await apiClient.patch<Workflow>(`/workflows/${id}`, body);
    return data;
  },
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/workflows/${id}`);
  },
  async reorder(items: Array<{ id: string; sortOrder: number }>): Promise<void> {
    await apiClient.post(`/workflows/reorder`, { items });
  },
  async publishVersion(
    id: string,
    definition: WorkflowDefinitionFE,
  ): Promise<WorkflowVersion> {
    const { data } = await apiClient.post<WorkflowVersion>(
      `/workflows/${id}/versions`,
      { definition },
    );
    return data;
  },
  async listVersions(id: string): Promise<WorkflowVersion[]> {
    const { data } = await apiClient.get<WorkflowVersion[]>(
      `/workflows/${id}/versions`,
    );
    return data;
  },
  async activate(id: string, versionId: string): Promise<void> {
    await apiClient.post(`/workflows/${id}/versions/${versionId}/activate`);
  },
};

export const workflowInstanceApi = {
  async get(id: string): Promise<any> {
    const { data } = await apiClient.get(`/workflow-instances/${id}`);
    return data;
  },
  /** Latest instance for the given record (running first, else most recent), or null. */
  async getByRecord(recordId: string): Promise<any | null> {
    const { data } = await apiClient.get(
      `/workflow-instances/by-record/${recordId}`,
    );
    return data ?? null;
  },
  async withdraw(id: string): Promise<void> {
    await apiClient.post(`/workflow-instances/${id}/withdraw`);
  },
  async urge(id: string): Promise<void> {
    await apiClient.post(`/workflow-instances/${id}/urge`);
  },
};

export interface WorkflowUserSearchItem {
  id: string;
  username: string;
  displayName: string;
}

/**
 * Light user-search for workflow approver pickers (transfer / add-signer).
 * Backed by `GET /workflow-tasks/users/search` (sys:self perm), unlike
 * the heavier `/users` endpoint which requires `sys:users`.
 */
export const workflowUserSearchApi = {
  async search(keyword?: string): Promise<WorkflowUserSearchItem[]> {
    const params = new URLSearchParams();
    if (keyword?.trim()) params.set('keyword', keyword.trim());
    const { data } = await apiClient.get<{ data: WorkflowUserSearchItem[] }>(
      `/workflow-tasks/users/search?${params.toString()}`,
    );
    return data.data ?? [];
  },
};

export const workflowTaskApi = {
  async approve(taskId: string, comment?: string): Promise<void> {
    await apiClient.post(`/workflow-tasks/${taskId}/approve`, { comment });
  },
  async reject(taskId: string, comment?: string): Promise<void> {
    await apiClient.post(`/workflow-tasks/${taskId}/reject`, { comment });
  },
  async transfer(
    taskId: string,
    newUserId: string,
    comment?: string,
  ): Promise<void> {
    await apiClient.post(`/workflow-tasks/${taskId}/transfer`, {
      newUserId,
      comment,
    });
  },
  async addSigner(
    taskId: string,
    position: 'before' | 'after',
    newUserId: string,
    comment?: string,
  ): Promise<void> {
    await apiClient.post(`/workflow-tasks/${taskId}/add-signer`, {
      position,
      newUserId,
      comment,
    });
  },
  async returnTask(
    taskId: string,
    mode: 'prev' | 'start',
    comment: string,
  ): Promise<void> {
    await apiClient.post(`/workflow-tasks/${taskId}/return`, { mode, comment });
  },
};
