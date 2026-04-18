'use client';

import { useCallback, useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { Field, FilterGroup, FilterCondition } from '@openforge/shared';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { FilterSearchInput } from '@/components/workspace/filter-search-input';

interface ColumnFilterPopoverProps {
  field: Field;
  filter: FilterGroup;
  onApply: (next: FilterGroup) => void;
}

/**
 * Apply replaces all top-level conditions on `columnName`. Nested groups
 * (from the full filter panel) are left untouched — advanced users compose
 * those themselves. If the caller's filter has the same field buried in a
 * nested group, the quick-filter result will sit alongside it; users who
 * want that level of control can open the full panel.
 */
function replaceColumnConditions(
  filter: FilterGroup,
  columnName: string,
  newLeaves: FilterCondition[],
): FilterGroup {
  const kept = filter.conditions.filter(
    (c) => !('field' in c && c.field === columnName),
  );
  return { ...filter, conditions: [...kept, ...newLeaves] };
}

function topLevelConditionsForField(
  filter: FilterGroup,
  columnName: string,
): FilterCondition[] {
  return filter.conditions.filter(
    (c): c is FilterCondition => 'field' in c && c.field === columnName,
  );
}

export function ColumnFilterPopover({ field, filter, onApply }: ColumnFilterPopoverProps) {
  const t = useTranslations('filter');
  const [open, setOpen] = useState(false);

  const activeConditions = useMemo(
    () => topLevelConditionsForField(filter, field.columnName),
    [filter, field.columnName],
  );
  const isActive = activeConditions.length > 0;

  const applyAndClose = useCallback(
    (leaves: FilterCondition[]) => {
      onApply(replaceColumnConditions(filter, field.columnName, leaves));
      setOpen(false);
    },
    [filter, field.columnName, onApply],
  );

  const clearAndClose = useCallback(() => {
    applyAndClose([]);
  }, [applyAndClose]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title={isActive ? t('quickFilterActive') : t('quickFilter')}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          'inline-flex items-center justify-center w-5 h-5 rounded transition-colors',
          isActive
            ? 'text-primary bg-primary/10 hover:bg-primary/20'
            : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted',
        )}
      >
        <Filter className="w-3 h-3" fill={isActive ? 'currentColor' : 'none'} />
      </PopoverTrigger>
      <PopoverContent align="start" className="p-3 w-64">
        <FilterBody
          field={field}
          activeConditions={activeConditions}
          onApply={applyAndClose}
          onClear={clearAndClose}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/*  Per-field-type body                                                 */
/* ------------------------------------------------------------------ */

interface FilterBodyProps {
  field: Field;
  activeConditions: FilterCondition[];
  onApply: (leaves: FilterCondition[]) => void;
  onClear: () => void;
}

function FilterBody(props: FilterBodyProps) {
  const { field } = props;
  const type = field.fieldType;

  if (type === 'STRING' || type === 'TEXT' || type === 'RICHTEXT' || type === 'AUTO_NUMBER') {
    return <KeywordFilter {...props} />;
  }
  if (type === 'INTEGER' || type === 'DECIMAL') {
    return <NumberRangeFilter {...props} />;
  }
  if (type === 'DATE') {
    return <DateRangeFilter {...props} htmlType="date" />;
  }
  if (type === 'DATETIME') {
    return <DateRangeFilter {...props} htmlType="datetime-local" />;
  }
  if (type === 'TIME') {
    return <DateRangeFilter {...props} htmlType="time" />;
  }
  if (type === 'BOOLEAN') {
    return <BooleanFilter {...props} />;
  }
  if (type === 'ENUM') {
    return <EnumFilter {...props} op="in" />;
  }
  if (type === 'MULTI_ENUM') {
    return <EnumFilter {...props} op="contains_any" />;
  }
  if (type === 'REFERENCE' || type === 'USER' || type === 'ORGANIZATION') {
    const inputType = type === 'REFERENCE' ? 'reference' : type === 'USER' ? 'user' : 'organization';
    return <SearchFilter {...props} inputType={inputType} />;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Keyword (STRING / TEXT / AUTO_NUMBER)                              */
/* ------------------------------------------------------------------ */

function KeywordFilter({ field, activeConditions, onApply, onClear }: FilterBodyProps) {
  const t = useTranslations('filter');
  const seed = activeConditions.find((c) => c.op === 'like')?.value ?? '';
  const [value, setValue] = useState<string>(typeof seed === 'string' ? seed : '');

  const apply = () => {
    const v = value.trim();
    if (!v) return onClear();
    onApply([{ field: field.columnName, op: 'like', value: v }]);
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply();
        }}
        placeholder={t('keywordPlaceholder')}
        className="h-7 rounded-md border border-input bg-background px-2 text-xs"
      />
      <FooterButtons onApply={apply} onClear={onClear} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NumberRange (INTEGER / DECIMAL)                                     */
/* ------------------------------------------------------------------ */

function NumberRangeFilter({ field, activeConditions, onApply, onClear }: FilterBodyProps) {
  const t = useTranslations('filter');
  const seedMin = activeConditions.find((c) => c.op === 'gte')?.value;
  const seedMax = activeConditions.find((c) => c.op === 'lte')?.value;
  const [minVal, setMinVal] = useState<string>(seedMin != null ? String(seedMin) : '');
  const [maxVal, setMaxVal] = useState<string>(seedMax != null ? String(seedMax) : '');

  const apply = () => {
    const leaves: FilterCondition[] = [];
    if (minVal.trim() !== '') leaves.push({ field: field.columnName, op: 'gte', value: Number(minVal) });
    if (maxVal.trim() !== '') leaves.push({ field: field.columnName, op: 'lte', value: Number(maxVal) });
    if (leaves.length === 0) return onClear();
    onApply(leaves);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs">
        <span className="w-8 text-muted-foreground shrink-0">{t('from')}</span>
        <input
          type="number"
          autoFocus
          value={minVal}
          onChange={(e) => setMinVal(e.target.value)}
          className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs"
        />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <span className="w-8 text-muted-foreground shrink-0">{t('to')}</span>
        <input
          type="number"
          value={maxVal}
          onChange={(e) => setMaxVal(e.target.value)}
          className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs"
        />
      </label>
      <FooterButtons onApply={apply} onClear={onClear} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DateRange (DATE / DATETIME / TIME)                                  */
/* ------------------------------------------------------------------ */

function DateRangeFilter({
  field,
  activeConditions,
  onApply,
  onClear,
  htmlType,
}: FilterBodyProps & { htmlType: 'date' | 'datetime-local' | 'time' }) {
  const t = useTranslations('filter');
  const seedFrom = activeConditions.find((c) => c.op === 'gte')?.value;
  const seedTo = activeConditions.find((c) => c.op === 'lte')?.value;
  const [fromVal, setFromVal] = useState<string>(seedFrom != null ? String(seedFrom) : '');
  const [toVal, setToVal] = useState<string>(seedTo != null ? String(seedTo) : '');

  const apply = () => {
    const leaves: FilterCondition[] = [];
    if (fromVal.trim() !== '') leaves.push({ field: field.columnName, op: 'gte', value: fromVal });
    if (toVal.trim() !== '') leaves.push({ field: field.columnName, op: 'lte', value: toVal });
    if (leaves.length === 0) return onClear();
    onApply(leaves);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs">
        <span className="w-8 text-muted-foreground shrink-0">{t('from')}</span>
        <input
          type={htmlType}
          autoFocus
          value={fromVal}
          onChange={(e) => setFromVal(e.target.value)}
          className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs"
        />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <span className="w-8 text-muted-foreground shrink-0">{t('to')}</span>
        <input
          type={htmlType}
          value={toVal}
          onChange={(e) => setToVal(e.target.value)}
          className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs"
        />
      </label>
      <FooterButtons onApply={apply} onClear={onClear} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Boolean                                                             */
/* ------------------------------------------------------------------ */

function BooleanFilter({ field, activeConditions, onApply, onClear }: FilterBodyProps) {
  const tc = useTranslations('common');
  const seed = activeConditions.find((c) => c.op === 'eq')?.value;
  const current: boolean | null = seed === true ? true : seed === false ? false : null;

  const choose = (v: boolean) => {
    onApply([{ field: field.columnName, op: 'eq', value: v }]);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-xs cursor-pointer rounded px-1 py-1 hover:bg-muted/50">
        <input
          type="radio"
          checked={current === true}
          onChange={() => choose(true)}
          className="h-3.5 w-3.5"
        />
        <span>{tc('statusActive')}</span>
      </label>
      <label className="flex items-center gap-2 text-xs cursor-pointer rounded px-1 py-1 hover:bg-muted/50">
        <input
          type="radio"
          checked={current === false}
          onChange={() => choose(false)}
          className="h-3.5 w-3.5"
        />
        <span>{tc('statusDisabled')}</span>
      </label>
      <FooterButtons onApply={() => {}} onClear={onClear} hideApply />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Enum (ENUM / MULTI_ENUM)                                            */
/* ------------------------------------------------------------------ */

function EnumFilter({
  field,
  activeConditions,
  onApply,
  onClear,
  op,
}: FilterBodyProps & { op: 'in' | 'contains_any' }) {
  const choices = (field.options?.choices ?? []) as Array<{ value: string; label: string }>;
  const seed = activeConditions.find((c) => c.op === op)?.value;
  const initial: string[] = Array.isArray(seed) ? seed.map(String) : [];
  const [selected, setSelected] = useState<string[]>(initial);

  const toggle = (v: string) => {
    setSelected((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const apply = () => {
    if (selected.length === 0) return onClear();
    onApply([{ field: field.columnName, op, value: selected }]);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="max-h-48 overflow-auto -mr-2 pr-2">
        {choices.map((c) => (
          <label
            key={c.value}
            className="flex items-center gap-2 text-xs cursor-pointer rounded px-1 py-1 hover:bg-muted/50"
          >
            <input
              type="checkbox"
              checked={selected.includes(c.value)}
              onChange={() => toggle(c.value)}
              className="h-3.5 w-3.5 rounded"
            />
            <span className="flex-1 truncate">{c.label}</span>
          </label>
        ))}
      </div>
      <FooterButtons onApply={apply} onClear={onClear} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reference / User / Organization (single-select)                     */
/* ------------------------------------------------------------------ */

function SearchFilter({
  field,
  activeConditions,
  onApply,
  onClear,
  inputType,
}: FilterBodyProps & { inputType: 'reference' | 'user' | 'organization' }) {
  const seed = activeConditions.find((c) => c.op === 'eq')?.value;
  const [value, setValue] = useState<any>(seed ?? null);

  const apply = () => {
    if (value === null || value === undefined || value === '') return onClear();
    onApply([{ field: field.columnName, op: 'eq', value }]);
  };

  return (
    <div className="flex flex-col gap-2">
      <FilterSearchInput type={inputType} field={field} value={value} onChange={setValue} />
      <FooterButtons onApply={apply} onClear={onClear} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer buttons                                                      */
/* ------------------------------------------------------------------ */

function FooterButtons({
  onApply,
  onClear,
  hideApply,
}: {
  onApply: () => void;
  onClear: () => void;
  hideApply?: boolean;
}) {
  const t = useTranslations('filter');
  return (
    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
      <button
        type="button"
        onClick={onClear}
        className="h-6 rounded-md border border-input bg-background px-2 text-[11px] hover:bg-muted"
      >
        {t('clear')}
      </button>
      {!hideApply && (
        <button
          type="button"
          onClick={onApply}
          className="h-6 rounded-md bg-primary px-2 text-[11px] text-primary-foreground hover:bg-primary/90"
        >
          {t('apply')}
        </button>
      )}
    </div>
  );
}
