import { ConditionExpression } from './condition-expression';

export type AssigneeStrategy =
  | 'fixed'
  | 'role'
  | 'org'
  | 'submitterUpline'
  | 'userField'
  | 'orgField';

export interface AssigneeConfig {
  userIds?: string[];
  roleIds?: string[];
  orgIds?: string[];
  includeChildren?: boolean;
  upLevel?: number;
  fieldColumnName?: string;
  orgRole?: 'members' | 'leader';
}

export interface ApproveNodeConfig {
  assigneeStrategy: AssigneeStrategy;
  assigneeConfig: AssigneeConfig;
  mode: 'and' | 'or' | 'sequential';
  passThreshold?: number;
  onEmpty: 'pass' | 'fallback' | 'error';
  fallbackUserIds?: string[];
  autoSkipDuplicates: boolean;
  autoSkipSubmitter: boolean;
  fieldPermissions?: Record<string, 'readwrite' | 'readonly'>;
  timeoutHours?: number;
  onTimeout?: 'notify' | 'autoApprove' | 'autoReject' | 'transferTo';
  onTimeoutTransferUserIds?: string[];
  allowedActions: {
    approve: boolean;
    reject: boolean;
    transfer: boolean;
    addBefore: boolean;
    addAfter: boolean;
    returnPrev: boolean;
    returnStart: boolean;
  };
  aiSuggesterEnabled?: boolean;
}

export interface CcNodeConfig {
  assigneeStrategy: AssigneeStrategy;
  assigneeConfig: AssigneeConfig;
  dedupAcrossInstance: boolean;
}

export interface ConditionBranch {
  name: string;
  condition: ConditionExpression;
  targetNodeId: string;
  isDefault?: boolean;
}

export interface ConditionNodeConfig {
  branches: ConditionBranch[];
}

export interface ParallelForkConfig {}

export interface ParallelJoinConfig {
  joinMode: 'and' | 'or';
}
