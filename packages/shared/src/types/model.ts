export interface Model {
  id: string;
  appId: string;
  name: string;
  code: string;
  tableName: string;
  description: string | null;
  dataScope: 'private' | 'shared' | 'distributed';
  isTree: boolean;
  fields?: Field[];
  entities?: SysEntity[];
}

export interface CreateModelRequest {
  appId: string;
  name: string;
  code: string;
  description?: string;
  dataScope?: 'private' | 'shared' | 'distributed';
}

export interface UpdateModelRequest {
  name?: string;
  description?: string;
}

export type FieldType =
  | 'STRING' | 'TEXT' | 'RICHTEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN'
  | 'DATE' | 'DATETIME' | 'TIME' | 'ENUM' | 'MULTI_ENUM'
  | 'AUTO_NUMBER' | 'REFERENCE' | 'MULTI_REFERENCE' | 'USER' | 'ORGANIZATION'
  | 'FILE' | 'IMAGE' | 'LOOKUP';

export interface FieldOption {
  maxLength?: number;
  scale?: number;
  dictCode?: string;
  // choices is populated at runtime by the backend (resolved from dictCode)
  choices?: Array<{ value: string; label: string; labelEn?: string; color?: string }>;
  prefix?: string;
  dateFormat?: string;
  digits?: number;
  startFrom?: number;
  // Reference options
  targetModelId?: string;
  targetDisplayField?: string;
  targetDisplayFields?: string[];   // Custom columns for picker dialog
  // Multi-Reference options
  relTableName?: string;        // Name of the junction table
  reverseFieldId?: string;      // ID of the reverse MULTI_REFERENCE field in target model
  // FILE/IMAGE options
  accept?: string;         // e.g., '.pdf,.doc' or 'image/*'
  maxSize?: number;        // bytes
  maxCount?: number;       // max files
  // LOOKUP options
  sourceFieldId?: string;            // id of the REFERENCE/USER/ORGANIZATION field on the same record
  targetFieldColumnName?: string;    // columnName of the target field on the target model/table
}

export interface Field {
  id: string;
  modelId: string;
  entityId?: string | null;
  name: string;
  columnName: string;
  fieldType: FieldType;
  isRequired: boolean;
  isUnique: boolean;
  defaultValue: any;
  options: FieldOption | null;
  sortOrder: number;
  isSystem: boolean;
  deletedAt: string | null;
}

export interface CreateFieldRequest {
  name: string;
  columnName: string;
  fieldType: FieldType;
  isRequired?: boolean;
  isUnique?: boolean;
  defaultValue?: any;
  options?: FieldOption;
  sortOrder?: number;
}

export interface UpdateFieldRequest {
  name?: string;
  isRequired?: boolean;
  isUnique?: boolean;
  defaultValue?: any;
  options?: FieldOption;
  sortOrder?: number;
}

export interface FieldValidationRule {
  type: 'required' | 'maxLength' | 'min' | 'max' | 'pattern' | 'unique';
  value?: any;
  message: string;
}

export interface SysEntity {
  id: string;
  modelId: string;
  name: string;
  code: string;
  tableName: string;
  entityType: 'one_to_one' | 'one_to_many';
  /** Server-assigned. Optional because synthetic client-side entities (e.g. from childrenMeta) don't carry it. */
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
  fields?: Field[];
  _count?: { fields: number };
}
