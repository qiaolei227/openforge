import { apiClient } from '@/lib/api-client';

export type DistAction = 'allocate' | 'revoke';
export type SyncAction = 'force_push' | 'backfill';

/** Confirmation phrases shared with the backend (apps/server/.../sync.service.ts). */
export const SYNC_PHRASES: Record<SyncAction, string> = {
  force_push: '强制覆盖',
  backfill: '策略回填',
};

export interface CopyStatusEntry {
  orgId: string;
  copyId: string;
  isArchived: boolean;
  hasLocalEdits: boolean;
}

export interface DistributionResult {
  recordId: string;
  orgId: string;
  action: DistAction;
  status: 'success' | 'failed';
  errorCode?: string;
  errorMessage?: string;
  copyId?: string;
}

export interface DistributionApplyResponse {
  results: DistributionResult[];
  summary: { succeeded: number; failed: number };
}

export interface DistributionLogItem {
  id: string;
  modelId: string;
  recordId: string;
  action: string;
  sourceOrgId: string | null;
  targetOrgId: string | null;
  fieldColumn: string | null;
  beforeValue: any;
  afterValue: any;
  operatorId: string;
  createdAt: string;
}

export interface DistributionLogResponse {
  items: DistributionLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getDistributionStatus(
  appCode: string,
  modelCode: string,
  recordIds: string[],
): Promise<Record<string, CopyStatusEntry[]>> {
  const { data } = await apiClient.get<Record<string, CopyStatusEntry[]>>(
    `/apps/${appCode}/models/${modelCode}/data/distribution-status`,
    { params: { recordIds: recordIds.join(',') } },
  );
  return data;
}

export async function distribute(
  appCode: string,
  modelCode: string,
  recordIds: string[],
  changes: Array<{ orgId: string; action: DistAction }>,
): Promise<DistributionApplyResponse> {
  const { data } = await apiClient.post<DistributionApplyResponse>(
    `/apps/${appCode}/models/${modelCode}/data/distribute`,
    { recordIds, changes },
  );
  return data;
}

export async function syncMaster(
  appCode: string,
  modelCode: string,
  recordId: string,
  body: { action: SyncAction; fieldColumns: string[]; confirmationPhrase: string },
): Promise<{ affected: number; fieldCount: number }> {
  const { data } = await apiClient.post<{ affected: number; fieldCount: number }>(
    `/apps/${appCode}/models/${modelCode}/data/${recordId}/sync`,
    body,
  );
  return data;
}

export async function getDistributionLog(
  appCode: string,
  modelCode: string,
  recordId: string,
  page = 1,
  pageSize = 20,
): Promise<DistributionLogResponse> {
  const { data } = await apiClient.get<DistributionLogResponse>(
    `/apps/${appCode}/models/${modelCode}/data/${recordId}/distribution-log`,
    { params: { page, pageSize } },
  );
  return data;
}

export async function fillMissingCopies(
  appCode: string,
  modelCode: string,
): Promise<{ created: number; skipped: number }> {
  const { data } = await apiClient.post<{ created: number; skipped: number }>(
    `/apps/${appCode}/models/${modelCode}/data/fill-missing-copies`,
  );
  return data;
}

export interface DistributionPolicyItem {
  fieldId: string;
  fieldName: string;
  columnName: string;
  fieldType: string;
  editable: boolean;
}

export async function getDistributionPolicy(modelId: string): Promise<DistributionPolicyItem[]> {
  const { data } = await apiClient.get<DistributionPolicyItem[]>(
    `/models/${modelId}/distribution-policies`,
  );
  return data;
}

export async function getFieldLocalEditsCount(
  appCode: string,
  modelCode: string,
  fieldId: string,
): Promise<{ count: number }> {
  const { data } = await apiClient.get<{ count: number }>(
    `/apps/${appCode}/models/${modelCode}/fields/${fieldId}/local-edits-count`,
  );
  return data;
}
