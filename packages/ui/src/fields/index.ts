import type { ComponentType } from 'react';
import type { FieldComponentProps } from './field-props';
import type { FieldType } from '@openforge/shared';

export { type FieldComponentProps, type ApiQueryFn, type SystemQueryFn } from './field-props';

const FIELD_COMPONENTS: Partial<Record<FieldType, () => Promise<{ default: ComponentType<FieldComponentProps> }>>> = {
  STRING: () => import('./string-field'),
  TEXT: () => import('./text-field'),
  RICHTEXT: () => import('./rich-text-field'),
  INTEGER: () => import('./integer-field'),
  DECIMAL: () => import('./decimal-field'),
  BOOLEAN: () => import('./boolean-field'),
  DATE: () => import('./date-field'),
  DATETIME: () => import('./datetime-field'),
  TIME: () => import('./time-field'),
  ENUM: () => import('./enum-field'),
  MULTI_ENUM: () => import('./multi-enum-field'),
  AUTO_NUMBER: () => import('./auto-number-field'),
  REFERENCE: () => import('./relation-picker'),
  USER: () => import('./user-field'),
  ORGANIZATION: () => import('./org-field'),
  FILE: () => import('./file-field'),
  IMAGE: () => import('./image-field'),
  MULTI_REFERENCE: () => import('./multi-relation-picker'),
};

export function getFieldComponent(fieldType: FieldType) {
  return FIELD_COMPONENTS[fieldType];
}

export { SubTableField } from './sub-table-field';
export type { SubTableProps, ChildrenMeta } from './sub-table-types';
export { usePickerColumns } from './use-picker-columns';
export { default as ReferencePickerDialog } from './reference-picker-dialog';
export type { ReferencePickerDialogProps } from './reference-picker-dialog';
