export interface FilterCondition {
  field: string;
  op:
    | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
    | 'in' | 'not_in'
    | 'like' | 'not_like'
    | 'is_null' | 'is_not_null'
    | 'contains' | 'contains_all' | 'contains_any';
  value?: any;
}

export interface FilterGroup {
  op: 'and' | 'or';
  conditions: Array<FilterCondition | FilterGroup>;
}

export interface SortItem {
  field: string;
  order: 'asc' | 'desc';
}

export interface QueryRequest {
  filter?: FilterGroup;
  keyword?: string;
  page?: number;
  pageSize?: number;
  sort?: SortItem[];
  includeArchived?: boolean;
}

export interface QueryResponse<T = Record<string, any>> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BatchRequest {
  action: 'delete' | 'update';
  ids: string[];
  data?: Record<string, any>;
}

export interface BatchResponse {
  succeeded: string[];
  failed: Array<{ id: string; errorCode: string; message: string }>;
}

export interface StatusTransitionRequest {
  action: 'submit' | 'withdraw' | 'approve' | 'unapprove';
}
