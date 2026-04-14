'use client';

import { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, X, ArrowUpDown, Trash2 } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { useToastStore } from '@/stores/toast-store';
import type { SortItem } from '@openforge/shared';

interface FieldOption {
  columnName: string;
  name: string;
}

interface SortRow extends SortItem {
  _id: string;
}

interface DefaultSortPopoverProps {
  modelId: string;
  fields: FieldOption[];
  defaultSort: SortItem[] | null;
  onSaved: () => void;
}

const SYSTEM_SORTABLE_FIELDS = [
  { columnName: 'created_at', i18nKey: 'sortCreatedAt' },
  { columnName: 'updated_at', i18nKey: 'sortUpdatedAt' },
] as const;

/* ---------- Sortable Row ---------- */

function SortableRow({
  item,
  allOptions,
  usedFields,
  onChangeField,
  onChangeOrder,
  onRemove,
  tModels,
}: {
  item: SortRow;
  allOptions: FieldOption[];
  usedFields: Set<string>;
  onChangeField: (id: string, field: string) => void;
  onChangeOrder: (id: string) => void;
  onRemove: (id: string) => void;
  tModels: ReturnType<typeof useTranslations>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item._id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 py-1">
      <button
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <select
        className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm"
        value={item.field}
        onChange={(e) => onChangeField(item._id, e.target.value)}
      >
        <option value="">{tModels('sortFieldPlaceholder')}</option>
        {allOptions.map((f) => (
          <option
            key={f.columnName}
            value={f.columnName}
            disabled={usedFields.has(f.columnName) && f.columnName !== item.field}
          >
            {f.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="h-8 px-2 rounded-md border border-input bg-background text-xs font-medium hover:bg-accent min-w-[52px]"
        onClick={() => onChangeOrder(item._id)}
      >
        {item.order === 'asc' ? tModels('sortAsc') : tModels('sortDesc')}
      </button>
      <button
        type="button"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(item._id)}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ---------- Main Component ---------- */

export default function DefaultSortPopover({
  modelId,
  fields,
  defaultSort,
  onSaved,
}: DefaultSortPopoverProps) {
  const tModels = useTranslations('models');
  const tCommon = useTranslations('common');
  const showToast = useToastStore((s) => s.show);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SortRow[]>([]);
  const [saving, setSaving] = useState(false);
  const nextId = useRef(0);

  const makeId = () => `sort_${++nextId.current}`;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleOpen = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        nextId.current = 0;
        setItems(
          defaultSort
            ? defaultSort.map((s) => ({ ...s, _id: `sort_${++nextId.current}` }))
            : [],
        );
      }
      setOpen(isOpen);
    },
    [defaultSort],
  );

  const allOptions: FieldOption[] = [
    ...fields,
    ...SYSTEM_SORTABLE_FIELDS.map((sf) => ({
      columnName: sf.columnName,
      name: tModels(sf.i18nKey),
    })),
  ];

  const usedFields = new Set(items.map((i) => i.field).filter(Boolean));

  const handleChangeField = (id: string, field: string) => {
    setItems((prev) => prev.map((item) => (item._id === id ? { ...item, field } : item)));
  };

  const handleChangeOrder = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item._id === id ? { ...item, order: item.order === 'asc' ? 'desc' : 'asc' } : item,
      ),
    );
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((item) => item._id !== id));
  };

  const handleAdd = () => {
    setItems((prev) => [...prev, { field: '', order: 'asc', _id: makeId() }]);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i._id === active.id);
        const newIndex = prev.findIndex((i) => i._id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleSave = async (sortValue: SortItem[] | null) => {
    setSaving(true);
    try {
      await apiClient.put(`/models/${modelId}`, { defaultSort: sortValue });
      onSaved();
      setOpen(false);
    } catch {
      showToast(tCommon('operationFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => handleSave(null);

  const handleConfirm = () => {
    const validItems = items
      .filter((i) => i.field)
      .map(({ field, order }) => ({ field, order }));
    handleSave(validItems.length > 0 ? validItems : null);
  };

  // Build display label for the trigger badge
  const systemFieldNames: Record<string, string> = Object.fromEntries(
    SYSTEM_SORTABLE_FIELDS.map((sf) => [sf.columnName, tModels(sf.i18nKey)]),
  );
  const sortLabel = defaultSort
    ?.map((s) => {
      const name =
        systemFieldNames[s.field] || fields.find((f) => f.columnName === s.field)?.name || s.field;
      return `${name}${s.order === 'asc' ? '\u2191' : '\u2193'}`;
    })
    .join(', ');

  const hasSort = defaultSort && defaultSort.length > 0;
  const triggerBase =
    'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-colors cursor-pointer hover:bg-accent hover:text-accent-foreground';

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger
        className={cn(
          triggerBase,
          hasSort
            ? 'bg-muted font-medium text-muted-foreground'
            : 'border border-dashed border-muted-foreground/30 text-muted-foreground',
        )}
      >
        {hasSort ? (
          <>
            <ArrowUpDown className="w-3 h-3" />
            {tModels('defaultSort')}: {sortLabel}
          </>
        ) : (
          <>
            <Plus className="w-3 h-3" />
            {tModels('addDefaultSort')}
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <p className="text-sm font-medium mb-2">{tModels('defaultSort')}</p>

        {items.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i._id)} strategy={verticalListSortingStrategy}>
              {items.map((item) => (
                <SortableRow
                  key={item._id}
                  item={item}
                  allOptions={allOptions}
                  usedFields={usedFields}
                  onChangeField={handleChangeField}
                  onChangeOrder={handleChangeOrder}
                  onRemove={handleRemove}
                  tModels={tModels}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          <p className="text-xs text-muted-foreground py-2">{tModels('sortFieldPlaceholder')}</p>
        )}

        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1 py-1"
          onClick={handleAdd}
        >
          <Plus className="w-3 h-3" />
          {tModels('addSortField')}
        </button>

        <div className="flex items-center justify-between mt-3 pt-2 border-t">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
            onClick={handleClear}
            disabled={saving || (!defaultSort?.length && items.length === 0)}
          >
            <Trash2 className="w-3 h-3" />
            {tModels('clearAllSort')}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md text-xs font-medium h-7 px-3 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            onClick={handleConfirm}
            disabled={saving}
          >
            {tModels('sortConfirm')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
