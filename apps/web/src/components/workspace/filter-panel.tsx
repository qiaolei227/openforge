'use client';

import { useCallback, useState } from 'react';
import { Plus, Trash2, CopyPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { buildEntityFieldName } from '@/lib/filter-entity-field';
import type { FilterGroup, FilterCondition } from '@openforge/shared';
import type { Field, FieldType } from '@openforge/shared';
import type { FilterPreset } from '@/components/workspace/filter-presets';
import { FilterSearchInput } from '@/components/workspace/filter-search-input';

/* ------------------------------------------------------------------ */
/*  Operator definitions per field type                                 */
/* ------------------------------------------------------------------ */

type OpKey =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in' | 'like' | 'not_like' | 'is_null' | 'is_not_null';

const OPS_BY_TYPE: Record<string, OpKey[]> = {
  STRING:        ['like', 'not_like', 'eq', 'ne', 'is_null', 'is_not_null'],
  TEXT:          ['like', 'not_like', 'eq', 'ne', 'is_null', 'is_not_null'],
  RICHTEXT:      ['like', 'not_like', 'is_null', 'is_not_null'],
  INTEGER:       ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
  DECIMAL:       ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
  BOOLEAN:       ['eq', 'is_null', 'is_not_null'],
  DATE:          ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
  DATETIME:      ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
  TIME:          ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
  ENUM:          ['eq', 'ne', 'in', 'not_in', 'is_null', 'is_not_null'],
  MULTI_ENUM:    ['in', 'not_in', 'is_null', 'is_not_null'],
  AUTO_NUMBER:   ['like', 'not_like', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
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
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const DATA_STATUS_KEYS = ['draft', 'submitted', 'approved', 'reaudit'] as const;

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */

/** Visible 1:1 entity columns (filter allowed on these). */
export interface OneToOneEntityGroup {
  entityCode: string;
  entityName: string;
  fields: Field[]; // only visible ones
}

/** Visible 1:N detail entity (filter allowed on these when expansion is active). */
export interface DetailEntityGroup {
  entityCode: string;
  entityName: string;
  fields: Field[];
}

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
  /** Called when user saves a new preset from within the panel */
  onSavePreset?: (preset: FilterPreset) => void;
  /** Currently active preset — when provided, a "保存" button updates it in-place */
  activePreset?: FilterPreset | null;
  /** Called when user updates the active preset */
  onUpdatePreset?: (preset: FilterPreset) => void;
  /** Visible 1:1 entity field groups */
  oneToOneGroups?: OneToOneEntityGroup[];
  /** Visible 1:N detail entity group (only one at a time when expansion is active) */
  detailGroup?: DetailEntityGroup | null;
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
  inputType: 'text' | 'select' | 'date' | 'datetime-local' | 'time' | 'number' | 'boolean' | 'reference' | 'user' | 'organization';
  choices?: Array<{ value: string; label: string }>;
  opsKey: string;
  /** Original Field object — needed by the REFERENCE/USER/ORG picker components */
  field?: Field;
  /** Group label for grouped rendering in the field selector */
  group: string;
}

function buildFieldOptions(
  fields: Field[],
  enableDataStatus: boolean,
  oneToOneGroups: OneToOneEntityGroup[] | undefined,
  detailGroup: DetailEntityGroup | null | undefined,
  t: ReturnType<typeof useTranslations<'filter'>>,
  tStatus: ReturnType<typeof useTranslations<'dataStatus'>>,
): FieldOption[] {
  const opts: FieldOption[] = [];
  const mainGroupLabel = t('groupMain');

  // Helper to convert a Field to a FieldOption with chosen encoded value + group label.
  const fieldToOpt = (f: Field, valueOverride: string | null, group: string): FieldOption => {
    let inputType: FieldOption['inputType'] = 'text';
    if (f.fieldType === 'DATE') inputType = 'date';
    else if (f.fieldType === 'DATETIME') inputType = 'datetime-local';
    else if (f.fieldType === 'TIME') inputType = 'time';
    else if (f.fieldType === 'INTEGER' || f.fieldType === 'DECIMAL') inputType = 'number';
    else if (f.fieldType === 'BOOLEAN') inputType = 'boolean';
    else if (f.fieldType === 'ENUM' || f.fieldType === 'MULTI_ENUM') inputType = 'select';
    else if (f.fieldType === 'REFERENCE') inputType = 'reference';
    else if (f.fieldType === 'USER') inputType = 'user';
    else if (f.fieldType === 'ORGANIZATION') inputType = 'organization';
    return {
      value: valueOverride ?? f.columnName,
      label: f.name,
      inputType,
      choices: f.options?.choices?.map((c) => ({ value: c.value, label: c.label })),
      opsKey: f.fieldType,
      field: f,
      group,
    };
  };

  // Main fields
  for (const f of fields) {
    if (EXCLUDED_TYPES.includes(f.fieldType)) continue;
    opts.push(fieldToOpt(f, null, mainGroupLabel));
  }

  // System pseudo-fields — under main group
  if (enableDataStatus) {
    opts.push({
      value: 'data_status',
      label: t('dataStatus'),
      inputType: 'select',
      choices: DATA_STATUS_KEYS.map((k) => ({ value: k, label: tStatus(k) })),
      opsKey: 'data_status',
      group: mainGroupLabel,
    });
  }
  opts.push({ value: 'is_archived', label: t('archived'), inputType: 'boolean', opsKey: 'is_archived', group: mainGroupLabel });
  opts.push({ value: 'created_by', label: t('createdBy'), inputType: 'text', opsKey: 'created_by', group: mainGroupLabel });
  opts.push({ value: 'created_at', label: t('createdAt'), inputType: 'datetime-local', opsKey: 'created_at', group: mainGroupLabel });
  opts.push({ value: 'updated_at', label: t('updatedAt'), inputType: 'datetime-local', opsKey: 'updated_at', group: mainGroupLabel });

  // 1:1 entity fields
  if (oneToOneGroups) {
    for (const grp of oneToOneGroups) {
      for (const f of grp.fields) {
        if (EXCLUDED_TYPES.includes(f.fieldType)) continue;
        opts.push(fieldToOpt(f, buildEntityFieldName('oneToOne', grp.entityCode, f.columnName), grp.entityName));
      }
    }
  }

  // 1:N detail entity fields
  if (detailGroup) {
    const detailHeader = `${t('groupDetailPrefix')} ${detailGroup.entityName}`;
    for (const f of detailGroup.fields) {
      if (EXCLUDED_TYPES.includes(f.fieldType)) continue;
      opts.push(fieldToOpt(f, buildEntityFieldName('detail', detailGroup.entityCode, f.columnName), detailHeader));
    }
  }

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
  t: ReturnType<typeof useTranslations<'filter'>>;
}

function ValueInput({ op, fieldOpt, value, onChange, placeholder, t }: ValueInputProps) {
  if (NO_VALUE_OPS.includes(op as OpKey)) return null;
  if (!fieldOpt) return null;

  const { inputType, choices } = fieldOpt;

  // Boolean — simple true/false select
  if (inputType === 'boolean') {
    const boolLabel = value === true || value === 'true' ? t('boolTrue') : value === false || value === 'false' ? t('boolFalse') : null;
    return (
      <Select value={value != null ? String(value) : null} onValueChange={(v) => onChange(v === 'true')}>
        <SelectTrigger className="flex-1 min-w-0 bg-background h-7 text-xs">
          <span className="flex flex-1 text-left truncate text-sm">
            {boolLabel ?? <span className="text-muted-foreground">{placeholder}</span>}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">{t('boolTrue')}</SelectItem>
          <SelectItem value="false">{t('boolFalse')}</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  // Enum / data_status — choices select
  if (inputType === 'select' && choices?.length) {
    const choiceLabel = choices.find((c) => c.value === value)?.label;
    return (
      <Select value={value ?? null} onValueChange={onChange}>
        <SelectTrigger className="flex-1 min-w-0 bg-background h-7 text-xs">
          <span className="flex flex-1 text-left truncate text-sm">
            {choiceLabel ?? <span className="text-muted-foreground">{placeholder}</span>}
          </span>
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

  // Reference / User / Organization — reuse the form's real picker components
  if ((inputType === 'reference' || inputType === 'user' || inputType === 'organization') && fieldOpt.field) {
    return (
      <FilterSearchInput
        type={inputType}
        field={fieldOpt.field}
        value={value}
        onChange={onChange}
      />
    );
  }

  // Date / datetime / time / number / text
  const htmlType =
    inputType === 'datetime-local' ? 'datetime-local'
    : inputType === 'date' ? 'date'
    : inputType === 'time' ? 'time'
    : inputType === 'number' ? 'number'
    : 'text';
  return (
    <Input
      type={htmlType}
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        if (inputType === 'number' && v !== '') {
          onChange(Number(v));
        } else {
          onChange(v || undefined);
        }
      }}
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
          <span className="flex flex-1 text-left truncate text-sm">
            {fieldOpt ? fieldOpt.label : <span className="text-muted-foreground">{t('fieldPlaceholder')}</span>}
          </span>
        </SelectTrigger>
        <SelectContent>
          {(() => {
            const grouped = new Map<string, FieldOption[]>();
            for (const opt of fieldOptions) {
              const arr = grouped.get(opt.group) ?? [];
              arr.push(opt);
              grouped.set(opt.group, arr);
            }
            return Array.from(grouped.entries()).map(([groupLabel, items]) => (
              <SelectGroup key={groupLabel}>
                <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  {groupLabel}
                </SelectLabel>
                {items.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ));
          })()}
        </SelectContent>
      </Select>

      {/* Operator selector */}
      <Select value={condition.op || null} onValueChange={handleOpChange}>
        <SelectTrigger className="w-28 shrink-0 bg-background h-7 text-xs">
          <span className="flex flex-1 text-left truncate text-sm">
            {condition.op ? t(`ops.${condition.op}` as any) : null}
          </span>
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
        t={t}
      />

      {/* Delete button */}
      <button
        type="button"
        title={t('deleteCondition')}
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
            title={t('deleteGroup')}
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
  onSavePreset,
  activePreset,
  onUpdatePreset,
  oneToOneGroups,
  detailGroup,
}: FilterPanelProps) {
  const t = useTranslations('filter');
  const tCommon = useTranslations('common');
  const tStatus = useTranslations('dataStatus');
  const fieldOptions = buildFieldOptions(fields, enableDataStatus, oneToOneGroups, detailGroup, t, tStatus);

  const [presetSaving, setPresetSaving] = useState(false);
  const [presetName, setPresetName] = useState('');

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

  const handleStartSavePreset = () => {
    setPresetSaving(true);
    setPresetName('');
  };

  const handleConfirmPreset = () => {
    if (!presetName.trim() || !onSavePreset) return;
    onSavePreset({
      id: crypto.randomUUID(),
      name: presetName.trim(),
      filter: value,
    });
    setPresetSaving(false);
    setPresetName('');
  };

  const handleCancelPreset = () => {
    setPresetSaving(false);
    setPresetName('');
  };

  const handleUpdateActivePreset = () => {
    if (!activePreset || !onUpdatePreset) return;
    onUpdatePreset({ ...activePreset, filter: value });
    // The parent handler is expected to apply the filter and close the panel.
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

      {/* Inline preset name input */}
      {presetSaving && (
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground shrink-0">{t('presetName')}:</span>
          <Input
            autoFocus
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmPreset();
              if (e.key === 'Escape') handleCancelPreset();
            }}
            placeholder={t('presetNamePlaceholder')}
            className="flex-1 h-7 text-xs bg-background"
          />
          <Button size="sm" onClick={handleConfirmPreset} disabled={!presetName.trim()}>
            {t('savePreset')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCancelPreset}>
            {tCommon('cancel')}
          </Button>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        {!presetSaving && activePreset && onUpdatePreset && (
          <Button variant="outline" size="sm" onClick={handleUpdateActivePreset} title={activePreset.name}>
            {t('updatePreset')}
          </Button>
        )}
        {!presetSaving && onSavePreset && value.conditions.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleStartSavePreset}>
            {t('savePreset')}
          </Button>
        )}
        <div className="flex-1" />
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
