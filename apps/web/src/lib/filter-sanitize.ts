import type { FilterGroup, FilterCondition } from '@openforge/shared';
import { parseEntityField } from './filter-entity-field';

export interface AvailableFields {
  /** Main model column names (including system pseudo-fields like data_status, is_archived, etc.). */
  main: Set<string>;
  /** Per-1:1-entity visible column names, keyed by entityCode. */
  oneToOne: Map<string, Set<string>>;
  /** Visible detail entity + its visible columns. Absent when no detail entity selected. */
  detail?: { code: string; fields: Set<string> };
}

export interface SanitizeResult {
  filter: FilterGroup;
  droppedCount: number;
}

function isGroup(node: any): node is FilterGroup {
  return node && Array.isArray(node.conditions);
}

function isCondFieldAvailable(field: string, avail: AvailableFields): boolean {
  const parsed = parseEntityField(field);
  if (parsed.kind === 'main') return avail.main.has(parsed.columnName);
  if (parsed.kind === 'oneToOne') {
    return !!avail.oneToOne.get(parsed.entityCode!)?.has(parsed.columnName);
  }
  // detail
  return !!(avail.detail?.code === parsed.entityCode && avail.detail?.fields.has(parsed.columnName));
}

/**
 * Walk a FilterGroup tree and drop any leaf condition whose `field` is not in the
 * available-fields registry. Empty groups (after dropping) are also removed.
 * Conditions with empty `field` (placeholder rows in the editor) are kept.
 *
 * Returns the cleaned tree and how many leaf conditions were dropped.
 */
export function sanitizeFilter(
  filter: FilterGroup,
  avail: AvailableFields,
): SanitizeResult {
  let dropped = 0;

  const walk = (group: FilterGroup): FilterGroup => {
    const kept: (FilterCondition | FilterGroup)[] = [];
    for (const node of group.conditions) {
      if (isGroup(node)) {
        const w = walk(node);
        if (w.conditions.length > 0) kept.push(w);
      } else {
        if (!node.field || isCondFieldAvailable(node.field, avail)) {
          kept.push(node);
        } else {
          dropped++;
        }
      }
    }
    return { op: group.op, conditions: kept };
  };

  const cleaned = walk(filter);
  return { filter: cleaned, droppedCount: dropped };
}
