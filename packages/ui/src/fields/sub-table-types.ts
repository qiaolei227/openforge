import type { Field } from '@openforge/shared';

export interface ChildrenMeta {
  entityId: string;
  entityName: string;
  entityCode: string;
  targetTableName: string;
  fkColumnName: string;
  isOneToOne: boolean;
  targetFields: Field[];
}

export interface SubTableProps {
  meta: ChildrenMeta;
  rows: Record<string, any>[];
  onChange: (rows: Record<string, any>[]) => void;
  mode: 'edit' | 'view' | 'create';
  disabled?: boolean;
  t: (key: string, values?: Record<string, any>) => string;
  /**
   * Build extra props for a field cell (queryFn, targetAppCode, etc.).
   * Caller supplies this so cells get the same service injection as
   * main-form fields. Without it, REFERENCE pickers in rows won't work.
   */
  buildFieldExtraProps?: (field: Field, rowData: Record<string, any>) => Record<string, any>;
}
