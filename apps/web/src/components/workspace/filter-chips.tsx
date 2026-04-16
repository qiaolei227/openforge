'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import type { FilterGroup, FilterCondition } from '@openforge/shared';
import type { Field } from '@openforge/shared';

/* ------------------------------------------------------------------ */
/*  Flatten helpers                                                     */
/* ------------------------------------------------------------------ */

import { isFilterGroup, removeAtPath } from '@/lib/filter-utils';

interface FlatCondition {
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
    if (isFilterGroup(node)) {
      result.push(...flattenConditions(node, path));
    } else {
      if (node.field) {
        result.push({ path, condition: node });
      }
    }
  });
  return result;
}

/* ------------------------------------------------------------------ */
/*  Module-level caches for async display value resolution             */
/* ------------------------------------------------------------------ */

const referenceDisplayCache = new Map<string, string>();
const userNameCache = new Map<string, string>();
const orgNameCache = new Map<string, string>();
const modelInfoCache = new Map<string, { appCode: string; modelCode: string }>();

async function resolveModelInfo(targetModelId: string) {
  const cached = modelInfoCache.get(targetModelId);
  if (cached) return cached;
  const { data: model } = await apiClient.get(`/models/${targetModelId}`);
  const info = { appCode: model.app?.code ?? '', modelCode: model.code };
  modelInfoCache.set(targetModelId, info);
  return info;
}

async function resolveReferenceDisplay(
  uuid: string,
  targetModelId: string,
  displayField: string,
): Promise<string> {
  const cacheKey = `${targetModelId}:${displayField}:${uuid}`;
  const cached = referenceDisplayCache.get(cacheKey);
  if (cached) return cached;
  try {
    const { appCode, modelCode } = await resolveModelInfo(targetModelId);
    if (!appCode || !modelCode) return String(uuid);
    const { data } = await apiClient.get(
      `/apps/${appCode}/models/${modelCode}/data/${uuid}`,
    );
    const display = data?.[displayField] ?? data?.name ?? String(uuid);
    referenceDisplayCache.set(cacheKey, display);
    return display;
  } catch {
    return String(uuid);
  }
}

async function resolveUserName(uuid: string): Promise<string> {
  const cached = userNameCache.get(uuid);
  if (cached) return cached;
  try {
    const { data } = await apiClient.get(`/users/${uuid}`);
    const display = data?.displayName || data?.username || String(uuid);
    userNameCache.set(uuid, display);
    return display;
  } catch {
    return String(uuid);
  }
}

async function resolveOrgName(uuid: string): Promise<string> {
  const cached = orgNameCache.get(uuid);
  if (cached) return cached;
  try {
    const { data } = await apiClient.get(`/orgs/${uuid}`);
    const display = data?.name || String(uuid);
    orgNameCache.set(uuid, display);
    return display;
  } catch {
    return String(uuid);
  }
}

/* ------------------------------------------------------------------ */
/*  Default formatter (for primitives without async resolution)         */
/* ------------------------------------------------------------------ */

function formatPrimitive(value: any): string {
  if (value === null || value === undefined) return '';
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
/*  ChipValue — resolves and displays the human-readable value         */
/* ------------------------------------------------------------------ */

const NO_VALUE_OPS = ['is_null', 'is_not_null'];

interface ChipValueProps {
  field: Field | undefined;
  condition: FilterCondition;
}

function ChipValue({ field, condition }: ChipValueProps) {
  const tFilter = useTranslations('filter');
  const tStatus = useTranslations('dataStatus');
  const value = condition.value;
  const columnName = condition.field;
  const op = condition.op;

  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    if (NO_VALUE_OPS.includes(op)) {
      setResolved('');
      return;
    }
    if (value === null || value === undefined || value === '') {
      setResolved('');
      return;
    }

    // System pseudo-fields that don't have model metadata
    if (columnName === 'is_archived') {
      const b = value === true || value === 'true';
      setResolved(b ? tFilter('boolTrue') : tFilter('boolFalse'));
      return;
    }
    if (columnName === 'data_status') {
      try {
        if (Array.isArray(value)) {
          setResolved(value.map((v) => tStatus(v as any)).join(', '));
        } else {
          setResolved(tStatus(value as any));
        }
      } catch {
        setResolved(formatPrimitive(value));
      }
      return;
    }

    // Without field metadata, fall back to primitive formatting
    if (!field) {
      setResolved(formatPrimitive(value));
      return;
    }

    // BOOLEAN
    if (field.fieldType === 'BOOLEAN') {
      const b = value === true || value === 'true';
      setResolved(b ? tFilter('boolTrue') : tFilter('boolFalse'));
      return;
    }

    // ENUM / MULTI_ENUM — translate via choices
    if (field.fieldType === 'ENUM' || field.fieldType === 'MULTI_ENUM') {
      const choices = field.options?.choices as
        | Array<{ value: string; label: string }>
        | undefined;
      if (choices?.length) {
        const map = new Map(choices.map((c) => [c.value, c.label]));
        if (Array.isArray(value)) {
          setResolved(value.map((v) => map.get(v) ?? String(v)).join(', '));
        } else {
          setResolved(map.get(value as string) ?? String(value));
        }
        return;
      }
      setResolved(formatPrimitive(value));
      return;
    }

    // REFERENCE — async resolve display name from target model
    if (field.fieldType === 'REFERENCE') {
      const targetModelId = field.options?.targetModelId as string | undefined;
      const displayField =
        (field.options?.targetDisplayField as string | undefined) || 'name';
      if (!targetModelId || typeof value !== 'string') {
        setResolved(formatPrimitive(value));
        return;
      }
      let cancelled = false;
      // Show UUID immediately while resolving so the chip isn't blank
      setResolved(formatPrimitive(value));
      resolveReferenceDisplay(value, targetModelId, displayField).then((d) => {
        if (!cancelled) setResolved(d);
      });
      return () => {
        cancelled = true;
      };
    }

    // USER — async resolve displayName from sys_user
    if (field.fieldType === 'USER') {
      if (typeof value !== 'string') {
        setResolved(formatPrimitive(value));
        return;
      }
      let cancelled = false;
      setResolved(formatPrimitive(value));
      resolveUserName(value).then((d) => {
        if (!cancelled) setResolved(d);
      });
      return () => {
        cancelled = true;
      };
    }

    // ORGANIZATION — async resolve name from sys_organization
    if (field.fieldType === 'ORGANIZATION') {
      if (typeof value !== 'string') {
        setResolved(formatPrimitive(value));
        return;
      }
      let cancelled = false;
      setResolved(formatPrimitive(value));
      resolveOrgName(value).then((d) => {
        if (!cancelled) setResolved(d);
      });
      return () => {
        cancelled = true;
      };
    }

    // Default — primitive types (STRING, INTEGER, DECIMAL, DATE, etc.)
    setResolved(formatPrimitive(value));
  }, [field, value, op, columnName, tStatus, tFilter]);

  if (!resolved) return null;
  return <span className="font-medium">{resolved}</span>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

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

  const fieldByColumnName = new Map(fields.map((f) => [f.columnName, f]));
  const fieldLabelMap = new Map(fields.map((f) => [f.columnName, f.name]));

  function getFieldLabel(columnName: string): string {
    const modelLabel = fieldLabelMap.get(columnName);
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
        const field = fieldByColumnName.get(condition.field);

        return (
          <span
            key={path.join('-')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted text-xs text-foreground"
          >
            <span className="font-medium">{fieldLabel}</span>
            <span className="text-muted-foreground">{opLabel}</span>
            {hasValue && <ChipValue field={field} condition={condition} />}
            <button
              type="button"
              onClick={() => handleRemove(path)}
              className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title={t('removeCondition')}
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
