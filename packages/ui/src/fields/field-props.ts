import type { Field, FieldType } from '@openforge/shared';

export interface FieldComponentProps {
  field: Field;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
  error?: string;
  mode: 'edit' | 'view';
}

/** API client function type — injected by consuming app (avoids axios coupling) */
export type ApiQueryFn = (
  ref: { appCode: string; modelCode: string },
  params: { keyword?: string; page?: number; pageSize?: number; includeArchived?: boolean },
) => Promise<{ data: Record<string, any>[]; total: number }>;

/** System table query function — for USER and ORGANIZATION fields */
export type SystemQueryFn = (
  table: 'users' | 'orgs',
  params: { keyword?: string; page?: number; pageSize?: number },
) => Promise<{ data: Record<string, any>[]; total: number }>;

/** Column definition for the reference picker table */
export interface PickerColumn {
  key: string;           // columnName
  label: string;         // display name
  fieldType: FieldType;  // for formatting
}
