'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { FilterGroup, FilterCondition } from '@openforge/shared';
import type { Field } from '@openforge/shared';

/* ------------------------------------------------------------------ */
/*  Flatten helpers                                                     */
/* ------------------------------------------------------------------ */

function isGroup(node: FilterCondition | FilterGroup): node is FilterGroup {
  return 'conditions' in node;
}

interface FlatCondition {
  /** Dot-separated path like "0.1" identifying the node in the tree */
  path: number[];
  condition: FilterCondition;
}

function flattenConditions(
  group: FilterGroup,
  pathPrefix: number[] = [],
): FlatCondition[] {
  const result: FlatCondition[] = [];
  group.conditions.forEach((node, idx) => {
    const path = [...pathPrefix, idx];
    if (isGroup(node)) {
      result.push(...flattenConditions(node, path));
    } else {
      if (node.field) {
        result.push({ path, condition: node });
      }
    }
  });
  return result;
}

/** Immutably remove a node at a given path */
function removeAtPath(group: FilterGroup, path: number[]): FilterGroup {
  if (path.length === 1) {
    return { ...group, conditions: group.conditions.filter((_, i) => i !== path[0]) };
  }
  const [head, ...tail] = path;
  const newConditions = [...group.conditions];
  newConditions[head] = removeAtPath(newConditions[head] as FilterGroup, tail);
  return { ...group, conditions: newConditions };
}

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

function formatValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */

export interface FilterChipsProps {
  /** Model fields — used to resolve field names */
  fields: Field[];
  /** Current filter tree */
  value: FilterGroup;
  onChange: (value: FilterGroup) => void;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

const NO_VALUE_OPS = ['is_null', 'is_not_null'];

const SYSTEM_FIELD_LABEL_KEYS: Record<string, keyof Record<string, string>> = {
  data_status: 'dataStatus',
  is_archived: 'archived',
  created_by: 'createdBy',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
};

export function FilterChips({ fields, value, onChange, className }: FilterChipsProps) {
  const t = useTranslations('filter');

  const flat = flattenConditions(value);

  if (flat.length === 0) return null;

  const fieldMap = new Map(fields.map((f) => [f.columnName, f.name]));

  function getFieldLabel(columnName: string): string {
    const modelLabel = fieldMap.get(columnName);
    if (modelLabel) return modelLabel;
    const sysKey = SYSTEM_FIELD_LABEL_KEYS[columnName];
    if (sysKey) return t(sysKey as any);
    return columnName;
  }

  const handleRemove = (path: number[]) => {
    onChange(removeAtPath(value, path));
  };

  const handleClearAll = () => {
    onChange({ op: value.op, conditions: [] });
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="text-xs text-muted-foreground shrink-0">{t('activeFilters')}:</span>

      {flat.map(({ path, condition }) => {
        const fieldLabel = getFieldLabel(condition.field);
        const opLabel = t(`ops.${condition.op}` as any);
        const hasValue = !NO_VALUE_OPS.includes(condition.op);
        const valueStr = hasValue ? formatValue(condition.value) : '';

        return (
          <span
            key={path.join('-')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted text-xs text-foreground"
          >
            <span className="font-medium">{fieldLabel}</span>
            <span className="text-muted-foreground">{opLabel}</span>
            {valueStr && (
              <span className="font-medium">{valueStr}</span>
            )}
            <button
              type="button"
              onClick={() => handleRemove(path)}
              className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="移除此条件"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        );
      })}

      <button
        type="button"
        onClick={handleClearAll}
        className="text-xs text-muted-foreground hover:text-destructive transition-colors underline-offset-2 hover:underline"
      >
        {t('clearAll')}
      </button>
    </div>
  );
}
