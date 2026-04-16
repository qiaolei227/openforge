import type { Field, FieldType, LayoutConfig, LayoutNode } from '@openforge/shared';
import { isVirtualFieldType } from '@openforge/shared';

/* ── Column width map (shared across DataTable + SubTable) ── */
export const DEFAULT_COLUMN_WIDTH: Record<FieldType, number> = {
  STRING: 150,
  ENUM: 150,
  MULTI_ENUM: 150,
  TEXT: 200,
  RICHTEXT: 200,
  INTEGER: 120,
  DECIMAL: 120,
  BOOLEAN: 80,
  DATE: 120,
  DATETIME: 180,
  TIME: 100,
  REFERENCE: 180,
  USER: 150,
  ORGANIZATION: 150,
  AUTO_NUMBER: 140,
  FILE: 200,
  IMAGE: 120,
  MULTI_REFERENCE: 200,
};

/* ── Column alignment by type ── */
const COLUMN_ALIGN: Partial<Record<FieldType, 'left' | 'center' | 'right'>> = {
  INTEGER: 'right',
  DECIMAL: 'right',
  BOOLEAN: 'center',
};

/**
 * Sort visible fields: AUTO_NUMBER first, then by sortOrder.
 * Filters out system and deleted fields.
 */
function sortVisibleFields(fields: Field[]): Field[] {
  return fields
    .filter((f) => !f.isSystem && !f.deletedAt)
    .sort((a, b) => {
      if (a.fieldType === 'AUTO_NUMBER' && b.fieldType !== 'AUTO_NUMBER') return -1;
      if (a.fieldType !== 'AUTO_NUMBER' && b.fieldType === 'AUTO_NUMBER') return 1;
      return a.sortOrder - b.sortOrder;
    });
}

/**
 * Generate a default Form layout from field metadata.
 * Regular fields become `{ type: 'Field', ... }` nodes.
 * Entities become `{ type: 'SubTable', ... }` nodes (at the bottom).
 */
export function generateDefaultFormLayout(
  fields: Field[],
  entities: { id: string; code: string; entityType: string }[] = [],
): LayoutConfig {
  const sorted = sortVisibleFields(fields);

  const children: LayoutNode[] = [];

  // Regular fields
  for (const field of sorted) {
    children.push({
      type: 'Field',
      props: {
        fieldId: field.id,
        columnName: field.columnName,
        fieldType: field.fieldType,
      },
    });
  }

  // Entity-based SubTable nodes (at the bottom)
  for (const entity of entities) {
    children.push({
      type: 'SubTable',
      props: { entityId: entity.id, entityCode: entity.code, entityType: entity.entityType },
    });
  }

  return { type: 'Form', children };
}

/**
 * Generate a default List layout from field metadata.
 * Excludes virtual fields (MULTI_REFERENCE has no column to display).
 * Regular fields become `{ type: 'Column', props: { fieldId, columnName, fieldType, width, align } }` nodes.
 */
export function generateDefaultListLayout(fields: Field[]): LayoutConfig {
  const sorted = sortVisibleFields(fields);

  const children: LayoutNode[] = sorted
    .filter((field) => !isVirtualFieldType(field.fieldType))
    .map((field) => ({
      type: 'Column',
      props: {
        fieldId: field.id,
        columnName: field.columnName,
        fieldType: field.fieldType,
        width: DEFAULT_COLUMN_WIDTH[field.fieldType] ?? 150,
        align: COLUMN_ALIGN[field.fieldType] ?? 'left',
      },
    }));

  return { type: 'List', children };
}
