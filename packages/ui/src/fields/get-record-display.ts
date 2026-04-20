import type { Field } from '@openforge/shared';

/**
 * Compute the display string for a picked reference-like record.
 * Mirrors the per-field-type logic used inside RelationPicker / UserField /
 * OrgField so parents (FieldNode, SubTableField) can format consistently
 * when wiring `onPickRecord`.
 */
export function getRecordDisplay(field: Field, record: Record<string, any>): string {
  if (field.fieldType === 'USER') {
    return record.displayName || record.username || String(record.id);
  }
  if (field.fieldType === 'ORGANIZATION') {
    return record.name || String(record.id);
  }
  const df = (field.options as any)?.targetDisplayField || 'name';
  return record[df] ?? String(record.id);
}
