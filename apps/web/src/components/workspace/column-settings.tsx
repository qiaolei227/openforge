'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { Field } from '@openforge/shared';
import { buildEntityFieldName } from '@/lib/filter-entity-field';
import { deriveDetailEntity } from '@/lib/column-config';

function SettingsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
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

interface ColumnSettingsProps {
  fields: Field[];
  /** Unified prefix-encoded columns array (undefined = use designer default). */
  columns?: string[];
  entities?: EntityInfo[];
  onApply: (columns: string[]) => void;
  onReset: () => void;
}

export function ColumnSettings({
  fields,
  columns,
  entities,
  onApply,
  onReset,
}: ColumnSettingsProps) {
  const t = useTranslations('workspace');
  const [open, setOpen] = useState(false);

  const allFields = useMemo(
    () => fields.filter((f) => !f.isSystem && !f.deletedAt),
    [fields],
  );

  const oneToOneEntities = useMemo(
    () => (entities ?? []).filter((e) => e.entityType === 'one_to_one'),
    [entities],
  );
  const oneToManyEntities = useMemo(
    () => (entities ?? []).filter((e) => e.entityType === 'one_to_many'),
    [entities],
  );

  /** Local editing copy of the unified columns array. */
  const [local, setLocal] = useState<string[]>(columns ?? []);
  const [prevColumns, setPrevColumns] = useState(columns);
  if (columns !== prevColumns) {
    setPrevColumns(columns);
    setLocal(columns ?? []);
  }

  const has = useCallback((key: string) => local.includes(key), [local]);

  const toggleKey = useCallback((key: string) => {
    setLocal((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  /** Detail entity — derived from local (first detail entityCode if any). */
  const currentDetail = useMemo(() => deriveDetailEntity(local), [local]);

  /** Switch detail entity: drop all __detail__ entries (user must re-check fields for new entity). */
  const selectDetailEntity = useCallback((_entityCode: string | null) => {
    setLocal((prev) => prev.filter((k) => !k.startsWith('__detail__')));
  }, []);

  const toggleDetailField = useCallback((entityCode: string, columnName: string) => {
    const key = buildEntityFieldName('detail', entityCode, columnName);
    setLocal((prev) => {
      // Drop detail entries for OTHER entities before toggling
      const cleaned = prev.filter((k) => {
        if (!k.startsWith('__detail__')) return true;
        return k.startsWith(`__detail__${entityCode}__`);
      });
      return cleaned.includes(key)
        ? cleaned.filter((k) => k !== key)
        : [...cleaned, key];
    });
  }, []);

  const handleApply = useCallback(() => {
    onApply(local);
    setOpen(false);
  }, [local, onApply]);

  const handleReset = useCallback(() => {
    onReset();
    setOpen(false);
  }, [onReset]);

  const hasCustomConfig = !!columns?.length;

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
              {/* Master fields */}
              <div>
                <div className="sticky top-0 bg-popover px-3 py-1.5 text-xs font-medium text-muted-foreground border-b">
                  {t('columnSettings.masterFields')}
                </div>
                <div className="p-1">
                  {allFields.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={has(f.columnName)}
                        onChange={() => toggleKey(f.columnName)}
                        className="h-3.5 w-3.5 rounded border-gray-300"
                      />
                      <span className="flex-1 text-sm truncate">{f.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 1:1 entity fields */}
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
                      return (
                        <div key={entity.code} className="mb-1">
                          <div className="px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                            {entity.name}
                          </div>
                          {entFields.map((f) => {
                            const key = buildEntityFieldName('oneToOne', entity.code, f.columnName);
                            return (
                              <div
                                key={f.id}
                                className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                              >
                                <input
                                  type="checkbox"
                                  checked={has(key)}
                                  onChange={() => toggleKey(key)}
                                  className="h-3.5 w-3.5 rounded border-gray-300"
                                />
                                <span className="flex-1 text-sm truncate">{f.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 1:N detail (single radio) */}
              {oneToManyEntities.length > 0 && (
                <div className="border-t">
                  <div className="sticky top-0 bg-popover px-3 py-1.5 text-xs font-medium text-muted-foreground border-b">
                    {t('columnSettings.detailEntity')}
                  </div>
                  <div className="p-1 space-y-1">
                    <label className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50 cursor-pointer">
                      <input
                        type="radio"
                        name="detail-entity"
                        checked={currentDetail === null}
                        onChange={() => selectDetailEntity(null)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="flex-1 text-sm text-muted-foreground">
                        {t('columnSettings.detailNone')}
                      </span>
                    </label>

                    {oneToManyEntities.map((entity) => {
                      const isSelected = currentDetail?.entityCode === entity.code;
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
                              {entFields.map((f) => {
                                const key = buildEntityFieldName('detail', entity.code, f.columnName);
                                return (
                                  <div
                                    key={f.id}
                                    className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={has(key)}
                                      onChange={() => toggleDetailField(entity.code, f.columnName)}
                                      className="h-3.5 w-3.5 rounded border-gray-300"
                                    />
                                    <span className="flex-1 text-sm truncate">{f.name}</span>
                                  </div>
                                );
                              })}
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
