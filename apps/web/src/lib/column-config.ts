import { parseEntityField } from './filter-entity-field';

/**
 * Derive the backend DTO shape `oneToOneFields: Record<entityCode, columnName[]>`
 * from a unified `columns` array. Order within each entity preserves encounter order.
 */
export function deriveOneToOneFields(columns: string[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const key of columns) {
    const p = parseEntityField(key);
    if (p.kind === 'oneToOne' && p.entityCode) {
      (result[p.entityCode] ??= []).push(p.columnName);
    }
  }
  return result;
}

/**
 * Derive the backend DTO shape `detailEntity: { entityCode, fields: string[] } | null`
 * from a unified `columns` array. Returns null if no `__detail__*` entries.
 * The design invariant is that all detail entries share a single entityCode —
 * this function takes the first encountered entityCode and ignores any others.
 * Server validation rejects cross-entity configs on save; this is a defensive fallback.
 */
export function deriveDetailEntity(
  columns: string[],
): { entityCode: string; fields: string[] } | null {
  let code: string | null = null;
  const fields: string[] = [];
  for (const key of columns) {
    const p = parseEntityField(key);
    if (p.kind === 'detail' && p.entityCode) {
      if (code && code !== p.entityCode) continue;
      code = p.entityCode;
      fields.push(p.columnName);
    }
  }
  return code ? { entityCode: code, fields } : null;
}

/** True when the unified columns array contains any `__detail__*` entry. */
export function hasDetailExpansion(columns: string[]): boolean {
  return columns.some((k) => parseEntityField(k).kind === 'detail');
}
