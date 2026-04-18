export type EntityFieldKind = 'main' | 'oneToOne' | 'detail';

export interface ParsedEntityField {
  kind: EntityFieldKind;
  entityCode?: string;
  columnName: string;
}

/**
 * Parse a FilterCondition.field string.
 *   "name"                              → main
 *   "__oneToOne__{code}__{columnName}"  → oneToOne
 *   "__detail__{code}__{columnName}"    → detail
 * columnName may contain underscores; entityCode may not (code is snake_case but
 * we split on the first `__` after the prefix marker).
 */
export function parseEntityField(field: string): ParsedEntityField {
  const ONE_TO_ONE = '__oneToOne__';
  const DETAIL = '__detail__';

  const parseWith = (marker: string, kind: 'oneToOne' | 'detail'): ParsedEntityField | null => {
    if (!field.startsWith(marker)) return null;
    const rest = field.slice(marker.length);
    const sep = rest.indexOf('__');
    if (sep <= 0 || sep === rest.length - 2) return null;
    return {
      kind,
      entityCode: rest.slice(0, sep),
      columnName: rest.slice(sep + 2),
    };
  };

  return (
    parseWith(ONE_TO_ONE, 'oneToOne') ||
    parseWith(DETAIL, 'detail') || {
      kind: 'main',
      columnName: field,
    }
  );
}

export function buildEntityFieldName(
  kind: 'oneToOne' | 'detail',
  entityCode: string,
  columnName: string,
): string {
  const marker = kind === 'oneToOne' ? '__oneToOne__' : '__detail__';
  return `${marker}${entityCode}__${columnName}`;
}
