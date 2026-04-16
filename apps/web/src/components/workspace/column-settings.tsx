'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { Field } from '@openforge/shared';

/* ── Inline Icons ── */
function SettingsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

interface EntityInfo {
  id: string;
  code: string;
  name: string;
  entityType: string;
  fields?: Field[];
}

export interface ColumnSettingsValue {
  columns: string[];
  oneToOneFields: Record<string, string[]>;
  detailEntity: { entityCode: string; fields: string[] } | null;
}

interface ColumnSettingsProps {
  fields: Field[];
  userColumns?: string[];
  oneToOneFields?: Record<string, string[]>;
  detailEntity?: { entityCode: string; fields: string[] } | null;
  entities?: EntityInfo[];
  onApply: (value: ColumnSettingsValue) => void;
  onReset: () => void;
}

export function ColumnSettings({
  fields,
  userColumns,
  oneToOneFields,
  detailEntity,
  entities,
  onApply,
  onReset,
}: ColumnSettingsProps) {
  const t = useTranslations('workspace');
  const [open, setOpen] = useState(false);

  /* ───── Master fields ───── */
  const allFields = useMemo(
    () => fields.filter((f) => !f.isSystem && !f.deletedAt),
    [fields],
  );

  const orderedItems = useMemo(() => {
    const fieldMap = new Map(allFields.map((f) => [f.id, f]));
    const items: Array<{ field: Field; visible: boolean }> = [];
    const seen = new Set<string>();

    if (userColumns) {
      for (const fid of userColumns) {
        const f = fieldMap.get(fid);
        if (f) {
          items.push({ field: f, visible: true });
          seen.add(fid);
        }
      }
      for (const f of allFields) {
        if (!seen.has(f.id)) items.push({ field: f, visible: false });
      }
    } else {
      for (const f of allFields) items.push({ field: f, visible: true });
    }
    return items;
  }, [allFields, userColumns]);

  const [localItems, setLocalItems] = useState(orderedItems);
  const [prevOrdered, setPrevOrdered] = useState(orderedItems);
  if (orderedItems !== prevOrdered) {
    setPrevOrdered(orderedItems);
    setLocalItems(orderedItems);
  }

  const toggleVisible = useCallback((fieldId: string) => {
    setLocalItems((prev) =>
      prev.map((item) =>
        item.field.id === fieldId ? { ...item, visible: !item.visible } : item,
      ),
    );
  }, []);

  const moveUp = useCallback((index: number) => {
    if (index <= 0) return;
    setLocalItems((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    setLocalItems((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  /* ───── 1:1 entities ───── */
  const oneToOneEntities = useMemo(
    () => (entities ?? []).filter((e) => e.entityType === 'one_to_one'),
    [entities],
  );

  const [localOneToOne, setLocalOneToOne] = useState<Record<string, string[]>>(
    oneToOneFields ?? {},
  );
  const [prevOneToOne, setPrevOneToOne] = useState(oneToOneFields);
  if (oneToOneFields !== prevOneToOne) {
    setPrevOneToOne(oneToOneFields);
    setLocalOneToOne(oneToOneFields ?? {});
  }

  const toggleOneToOneField = useCallback((entityCode: string, fieldCol: string) => {
    setLocalOneToOne((prev) => {
      const cur = prev[entityCode] ?? [];
      const exists = cur.includes(fieldCol);
      const next = exists ? cur.filter((c) => c !== fieldCol) : [...cur, fieldCol];
      return { ...prev, [entityCode]: next };
    });
  }, []);

  /* ───── 1:N detail (single) ───── */
  const oneToManyEntities = useMemo(
    () => (entities ?? []).filter((e) => e.entityType === 'one_to_many'),
    [entities],
  );

  const [localDetailCode, setLocalDetailCode] = useState<string | null>(
    detailEntity?.entityCode ?? null,
  );
  const [localDetailFields, setLocalDetailFields] = useState<string[]>(
    detailEntity?.fields ?? [],
  );
  const [prevDetailEntity, setPrevDetailEntity] = useState(detailEntity);
  if (detailEntity !== prevDetailEntity) {
    setPrevDetailEntity(detailEntity);
    setLocalDetailCode(detailEntity?.entityCode ?? null);
    setLocalDetailFields(detailEntity?.fields ?? []);
  }

  const selectDetailEntity = useCallback((entityCode: string | null) => {
    setLocalDetailCode(entityCode);
    setLocalDetailFields([]);
  }, []);

  const toggleDetailField = useCallback((fieldCol: string) => {
    setLocalDetailFields((prev) =>
      prev.includes(fieldCol) ? prev.filter((c) => c !== fieldCol) : [...prev, fieldCol],
    );
  }, []);

  /* ───── Apply / Reset ───── */
  const handleApply = useCallback(() => {
    const visible = localItems.filter((i) => i.visible).map((i) => i.field.id);

    // Drop empty one-to-one entries
    const cleanedOneToOne: Record<string, string[]> = {};
    for (const [code, cols] of Object.entries(localOneToOne)) {
      if (cols.length > 0) cleanedOneToOne[code] = cols;
    }

    const cleanedDetail =
      localDetailCode && localDetailFields.length > 0
        ? { entityCode: localDetailCode, fields: localDetailFields }
        : null;

    onApply({
      columns: visible,
      oneToOneFields: cleanedOneToOne,
      detailEntity: cleanedDetail,
    });
    setOpen(false);
  }, [localItems, localOneToOne, localDetailCode, localDetailFields, onApply]);

  const handleReset = useCallback(() => {
    onReset();
    setOpen(false);
  }, [onReset]);

  const hasCustomConfig =
    !!userColumns ||
    (oneToOneFields && Object.values(oneToOneFields).some((v) => v.length > 0)) ||
    !!detailEntity;

  /* ───── Render ───── */
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={`inline-flex items-center justify-center w-7 h-7 rounded transition-colors ${
          hasCustomConfig
            ? 'text-primary hover:bg-primary/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        }`}
        title={t('columnSettings.title')}
      >
        <SettingsIcon />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute top-full right-0 z-50 mt-1 w-80 rounded-md border bg-popover shadow-lg">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-medium">{t('columnSettings.title')}</span>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {t('columnSettings.reset')}
              </button>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              {/* ── Master fields ── */}
              <div>
                <div className="sticky top-0 bg-popover px-3 py-1.5 text-xs font-medium text-muted-foreground border-b">
                  {t('columnSettings.masterFields')}
                </div>
                <div className="p-1">
                  {localItems.map((item, idx) => (
                    <div
                      key={item.field.id}
                      className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={item.visible}
                        onChange={() => toggleVisible(item.field.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300"
                      />
                      <span className="flex-1 text-sm truncate">{item.field.name}</span>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveUp(idx)}
                          disabled={idx === 0}
                          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronUpIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveDown(idx)}
                          disabled={idx === localItems.length - 1}
                          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronDownIcon />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── 1:1 entities ── */}
              {oneToOneEntities.length > 0 && (
                <div className="border-t">
                  <div className="sticky top-0 bg-popover px-3 py-1.5 text-xs font-medium text-muted-foreground border-b">
                    {t('columnSettings.oneToOneFields')}
                  </div>
                  <div className="p-1">
                    {oneToOneEntities.map((entity) => {
                      const entFields = (entity.fields ?? []).filter(
                        (f) => !f.isSystem && !f.deletedAt && f.fieldType !== 'MULTI_REFERENCE',
                      );
                      if (entFields.length === 0) return null;
                      const selected = localOneToOne[entity.code] ?? [];
                      return (
                        <div key={entity.code} className="mb-1">
                          <div className="px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                            {entity.name}
                          </div>
                          {entFields.map((field) => (
                            <div
                              key={field.id}
                              className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                            >
                              <input
                                type="checkbox"
                                checked={selected.includes(field.columnName)}
                                onChange={() => toggleOneToOneField(entity.code, field.columnName)}
                                className="h-3.5 w-3.5 rounded border-gray-300"
                              />
                              <span className="flex-1 text-sm truncate">{field.name}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── 1:N detail (single select) ── */}
              {oneToManyEntities.length > 0 && (
                <div className="border-t">
                  <div className="sticky top-0 bg-popover px-3 py-1.5 text-xs font-medium text-muted-foreground border-b">
                    {t('columnSettings.detailEntity')}
                  </div>
                  <div className="p-1 space-y-1">
                    {/* "None" option */}
                    <label className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50 cursor-pointer">
                      <input
                        type="radio"
                        name="detail-entity"
                        checked={localDetailCode === null}
                        onChange={() => selectDetailEntity(null)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="flex-1 text-sm text-muted-foreground">
                        {t('columnSettings.detailNone')}
                      </span>
                    </label>

                    {oneToManyEntities.map((entity) => {
                      const isSelected = localDetailCode === entity.code;
                      const entFields = (entity.fields ?? []).filter(
                        (f) => !f.isSystem && !f.deletedAt && f.fieldType !== 'MULTI_REFERENCE',
                      );
                      return (
                        <div key={entity.code}>
                          <label className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50 cursor-pointer">
                            <input
                              type="radio"
                              name="detail-entity"
                              checked={isSelected}
                              onChange={() => selectDetailEntity(entity.code)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="flex-1 text-sm">{entity.name}</span>
                          </label>
                          {isSelected && entFields.length > 0 && (
                            <div className="ml-5 pl-2 border-l border-muted mt-0.5">
                              {entFields.map((field) => (
                                <div
                                  key={field.id}
                                  className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={localDetailFields.includes(field.columnName)}
                                    onChange={() => toggleDetailField(field.columnName)}
                                    className="h-3.5 w-3.5 rounded border-gray-300"
                                  />
                                  <span className="flex-1 text-sm truncate">{field.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t px-3 py-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-7 rounded-md border border-input bg-background px-3 text-xs hover:bg-muted"
              >
                {t('columnSettings.cancel')}
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="h-7 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
              >
                {t('columnSettings.apply')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
