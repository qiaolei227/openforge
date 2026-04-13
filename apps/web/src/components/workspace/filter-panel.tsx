'use client';

import { useCallback } from 'react';
import { Plus, Trash2, CopyPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FilterGroup, FilterCondition } from '@openforge/shared';
import type { Field, FieldType } from '@openforge/shared';

/* ------------------------------------------------------------------ */
/*  Operator definitions per field type                                 */
/* ------------------------------------------------------------------ */

type OpKey =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in' | 'like' | 'is_null' | 'is_not_null';

const OPS_BY_TYPE: Record<string, OpKey[]> = {
  STRING:        ['like', 'eq', 'ne', 'is_null', 'is_not_null'],
  TEXT:          ['like', 'eq', 'ne', 'is_null', 'is_not_null'],
  RICHTEXT:      ['like', 'is_null', 'is_not_null'],
  INTEGER:       ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
  DECIMAL:       ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
  BOOLEAN:       ['eq', 'is_null', 'is_not_null'],
  DATE:          ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
  DATETIME:      ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
  TIME:          ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
  ENUM:          ['eq', 'ne', 'in', 'not_in', 'is_null', 'is_not_null'],
  MULTI_ENUM:    ['in', 'not_in', 'is_null', 'is_not_null'],
  AUTO_NUMBER:   ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
  REFERENCE:     ['eq', 'ne', 'is_null', 'is_not_null'],
  USER:          ['eq', 'ne', 'is_null', 'is_not_null'],
  ORGANIZATION:  ['eq', 'ne', 'is_null', 'is_not_null'],
  // System pseudo-fields
  data_status:   ['eq', 'ne', 'in', 'not_in', 'is_null', 'is_not_null'],
  is_archived:   ['eq'],
  created_by:    ['eq', 'ne', 'is_null', 'is_not_null'],
  created_at:    ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
  updated_at:    ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
};

/** Field types that cannot be filtered (no sensible predicate) */
const EXCLUDED_TYPES: FieldType[] = ['FILE', 'IMAGE', 'MULTI_REFERENCE'];

/** Operators that do not need a value input */
const NO_VALUE_OPS: OpKey[] = ['is_null', 'is_not_null'];

/* ------------------------------------------------------------------ */
/*  System pseudo-field definitions                                     */
/* ------------------------------------------------------------------ */

interface PseudoField {
  columnName: string;
  labelKey: keyof ReturnType<typeof useTranslations<'filter'>>;
  inputType: 'text' | 'select' | 'date' | 'datetime-local' | 'boolean';
  choices?: Array<{ value: string; label: string }>;
}

const DATA_STATUS_CHOICES = [
  { value: 'draft', label: 'draft' },
  { value: 'submitted', label: 'submitted' },
  { value: 'approved', label: 'approved' },
  { value: 'pending_revision', label: 'pending_revision' },
];

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */

export interface FilterPanelProps {
  /** Model fields to expose as filterable columns */
  fields: Field[];
  /** When true, include data_status pseudo-field */
  enableDataStatus?: boolean;
  /** Current filter tree */
  value: FilterGroup;
  onChange: (value: FilterGroup) => void;
  onApply?: () => void;
  onReset?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

import { isFilterGroup, updateAtPath, removeAtPath, pushAtPath } from '@/lib/filter-utils';

function makeCondition(): FilterCondition {
  return { field: '', op: 'eq' };
}

function makeGroup(): FilterGroup {
  return { op: 'and', conditions: [makeCondition()] };
}

/* ------------------------------------------------------------------ */
/*  FieldSelector — compact native select                               */
/* ------------------------------------------------------------------ */

interface FieldOption {
  value: string;
  label: string;
  inputType: PseudoField['inputType'];
  choices?: PseudoField['choices'];
  opsKey: string;
}

function buildFieldOptions(
  fields: Field[],
  enableDataStatus: boolean,
  t: ReturnType<typeof useTranslations<'filter'>>,
): FieldOption[] {
  const opts: FieldOption[] = [];

  // Model fields (exclude unsupported types)
  for (const f of fields) {
    if (EXCLUDED_TYPES.includes(f.fieldType)) continue;
    let inputType: PseudoField['inputType'] = 'text';
    if (f.fieldType === 'DATE') inputType = 'date';
    else if (f.fieldType === 'DATETIME') inputType = 'datetime-local';
    else if (f.fieldType === 'BOOLEAN') inputType = 'boolean';
    else if (f.fieldType === 'ENUM' || f.fieldType === 'MULTI_ENUM') inputType = 'select';
    opts.push({
      value: f.columnName,
      label: f.name,
      inputType,
      choices: f.options?.choices?.map((c) => ({ value: c.value, label: c.label })),
      opsKey: f.fieldType,
    });
  }

  // System pseudo-fields
  if (enableDataStatus) {
    opts.push({
      value: 'data_status',
      label: t('dataStatus'),
      inputType: 'select',
      choices: DATA_STATUS_CHOICES,
      opsKey: 'data_status',
    });
  }
  opts.push({
    value: 'is_archived',
    label: t('archived'),
    inputType: 'boolean',
    opsKey: 'is_archived',
  });
  opts.push({
    value: 'created_by',
    label: t('createdBy'),
    inputType: 'text',
    opsKey: 'created_by',
  });
  opts.push({
    value: 'created_at',
    label: t('createdAt'),
    inputType: 'datetime-local',
    opsKey: 'created_at',
  });
  opts.push({
    value: 'updated_at',
    label: t('updatedAt'),
    inputType: 'datetime-local',
    opsKey: 'updated_at',
  });

  return opts;
}

/* ------------------------------------------------------------------ */
/*  ValueInput — renders appropriate input for the field type          */
/* ------------------------------------------------------------------ */

interface ValueInputProps {
  op: string;
  fieldOpt: FieldOption | undefined;
  value: any;
  onChange: (v: any) => void;
  placeholder: string;
}

function ValueInput({ op, fieldOpt, value, onChange, placeholder }: ValueInputProps) {
  if (NO_VALUE_OPS.includes(op as OpKey)) return null;
  if (!fieldOpt) return null;

  const { inputType, choices } = fieldOpt;

  // Boolean — simple true/false select
  if (inputType === 'boolean') {
    return (
      <Select value={value ?? null} onValueChange={(v) => onChange(v === 'true')}>
        <SelectTrigger className="flex-1 min-w-0 bg-background h-7 text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">True</SelectItem>
          <SelectItem value="false">False</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  // Enum / data_status — choices select
  if (inputType === 'select' && choices?.length) {
    return (
      <Select value={value ?? null} onValueChange={onChange}>
        <SelectTrigger className="flex-1 min-w-0 bg-background h-7 text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {choices.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Date / datetime / text
  return (
    <Input
      type={inputType === 'datetime-local' ? 'datetime-local' : inputType === 'date' ? 'date' : 'text'}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder={placeholder}
      className="flex-1 min-w-0 bg-background h-7 text-xs"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  ConditionRow                                                        */
/* ------------------------------------------------------------------ */

interface ConditionRowProps {
  condition: FilterCondition;
  fieldOptions: FieldOption[];
  path: number[];
  onUpdate: (path: number[], updater: (c: FilterCondition) => FilterCondition) => void;
  onRemove: (path: number[]) => void;
  t: ReturnType<typeof useTranslations<'filter'>>;
}

function ConditionRow({ condition, fieldOptions, path, onUpdate, onRemove, t }: ConditionRowProps) {
  const fieldOpt = fieldOptions.find((f) => f.value === condition.field);
  const opsKey = fieldOpt?.opsKey ?? 'STRING';
  const availableOps: OpKey[] = OPS_BY_TYPE[opsKey] ?? OPS_BY_TYPE['STRING'];

  const handleFieldChange = useCallback(
    (field: string | null) => {
      if (!field) return;
      const newFieldOpt = fieldOptions.find((f) => f.value === field);
      const newOpsKey = newFieldOpt?.opsKey ?? 'STRING';
      const newOps = OPS_BY_TYPE[newOpsKey] ?? OPS_BY_TYPE['STRING'];
      const op = newOps[0];
      onUpdate(path, () => ({ field, op, value: undefined }));
    },
    [fieldOptions, path, onUpdate],
  );

  const handleOpChange = useCallback(
    (op: string | null) => {
      if (!op) return;
      onUpdate(path, (c) => ({
        ...c,
        op: op as FilterCondition['op'],
        value: NO_VALUE_OPS.includes(op as OpKey) ? undefined : (c as FilterCondition).value,
      }));
    },
    [path, onUpdate],
  );

  const handleValueChange = useCallback(
    (value: any) => {
      onUpdate(path, (c) => ({ ...c, value }));
    },
    [path, onUpdate],
  );

  return (
    <div className="flex items-center gap-1.5 group">
      {/* Field selector */}
      <Select value={condition.field || null} onValueChange={handleFieldChange}>
        <SelectTrigger className="w-32 shrink-0 bg-background h-7 text-xs">
          <SelectValue placeholder="字段" />
        </SelectTrigger>
        <SelectContent>
          {fieldOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operator selector */}
      <Select value={condition.op || null} onValueChange={handleOpChange}>
        <SelectTrigger className="w-28 shrink-0 bg-background h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableOps.map((op) => (
            <SelectItem key={op} value={op}>
              {t(`ops.${op}` as any)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value input */}
      <ValueInput
        op={condition.op}
        fieldOpt={fieldOpt}
        value={condition.value}
        onChange={handleValueChange}
        placeholder={t('valuePlaceholder')}
      />

      {/* Delete button */}
      <button
        type="button"
        title="删除条件"
        onClick={() => onRemove(path)}
        className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterGroupEditor — recursive                                       */
/* ------------------------------------------------------------------ */

interface FilterGroupEditorProps {
  group: FilterGroup;
  path: number[];
  fieldOptions: FieldOption[];
  onUpdate: (path: number[], updater: (node: FilterCondition | FilterGroup) => FilterCondition | FilterGroup) => void;
  onRemove: (path: number[]) => void;
  t: ReturnType<typeof useTranslations<'filter'>>;
  depth: number;
}

function FilterGroupEditor({
  group,
  path,
  fieldOptions,
  onUpdate,
  onRemove,
  t,
  depth,
}: FilterGroupEditorProps) {
  const isRoot = path.length === 0;

  const handleConditionUpdate = useCallback(
    (condPath: number[], updater: (c: FilterCondition) => FilterCondition) => {
      onUpdate(condPath, (node) => updater(node as FilterCondition));
    },
    [onUpdate],
  );

  const handleToggleOp = () => {
    onUpdate(path, (node) => ({
      ...(node as FilterGroup),
      op: (node as FilterGroup).op === 'and' ? 'or' : 'and',
    }));
  };

  const handleAddCondition = () => {
    onUpdate(path, (node) => ({
      ...(node as FilterGroup),
      conditions: [...(node as FilterGroup).conditions, makeCondition()],
    }));
  };

  const handleAddGroup = () => {
    onUpdate(path, (node) => ({
      ...(node as FilterGroup),
      conditions: [...(node as FilterGroup).conditions, makeGroup()],
    }));
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-2',
        !isRoot && 'pl-3 border-l-2 border-border/60',
      )}
    >
      {/* Group header: AND/OR toggle + optional remove */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleToggleOp}
          className={cn(
            'px-2 py-0.5 rounded text-xs font-semibold border transition-colors',
            group.op === 'and'
              ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
              : 'bg-orange-500/10 text-orange-600 border-orange-500/30 hover:bg-orange-500/20 dark:text-orange-400',
          )}
        >
          {group.op === 'and' ? 'AND' : 'OR'}
        </button>

        {!isRoot && (
          <button
            type="button"
            title="删除分组"
            onClick={() => onRemove(path)}
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Conditions */}
      <div className="flex flex-col gap-1.5">
        {group.conditions.map((node, idx) => {
          const childPath = [...path, idx];
          if (isFilterGroup(node)) {
            return (
              <FilterGroupEditor
                key={idx}
                group={node}
                path={childPath}
                fieldOptions={fieldOptions}
                onUpdate={onUpdate}
                onRemove={onRemove}
                t={t}
                depth={depth + 1}
              />
            );
          }
          return (
            <ConditionRow
              key={idx}
              condition={node}
              fieldOptions={fieldOptions}
              path={childPath}
              onUpdate={handleConditionUpdate}
              onRemove={onRemove}
              t={t}
            />
          );
        })}
      </div>

      {/* Add buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleAddCondition}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="w-3 h-3" />
          {t('addCondition')}
        </button>
        <button
          type="button"
          onClick={handleAddGroup}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <CopyPlus className="w-3 h-3" />
          {t('addGroup')}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterPanel — top-level                                             */
/* ------------------------------------------------------------------ */

export function FilterPanel({
  fields,
  enableDataStatus = false,
  value,
  onChange,
  onApply,
  onReset,
}: FilterPanelProps) {
  const t = useTranslations('filter');
  const fieldOptions = buildFieldOptions(fields, enableDataStatus, t);

  const handleUpdate = useCallback(
    (
      path: number[],
      updater: (node: FilterCondition | FilterGroup) => FilterCondition | FilterGroup,
    ) => {
      if (path.length === 0) {
        onChange(updater(value) as FilterGroup);
        return;
      }
      onChange(updateAtPath(value, path, updater));
    },
    [value, onChange],
  );

  const handleRemove = useCallback(
    (path: number[]) => {
      if (path.length === 0) return; // cannot remove root
      onChange(removeAtPath(value, path));
    },
    [value, onChange],
  );

  const handleReset = () => {
    onChange({ op: 'and', conditions: [] });
    onReset?.();
  };

  return (
    <div className="flex flex-col gap-4 p-4 min-w-[520px]">
      <FilterGroupEditor
        group={value}
        path={[]}
        fieldOptions={fieldOptions}
        onUpdate={handleUpdate}
        onRemove={handleRemove}
        t={t}
        depth={0}
      />

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button variant="outline" size="sm" onClick={handleReset}>
          {t('reset')}
        </Button>
        <Button size="sm" onClick={onApply}>
          {t('apply')}
        </Button>
      </div>
    </div>
  );
}
