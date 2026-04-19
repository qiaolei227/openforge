'use client';

import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { Field } from '@openforge/shared';
import { RenderCtx, ServiceCtx, type RenderMode, type EntityWithFields, type ServiceContextValue, type TranslateFn } from './context';

export type ReferenceRecordCache = Record<string, Record<string, any> | null>;

export interface ReferenceRecordContextValue {
  cache: ReferenceRecordCache;
  setReferenceRecord: (fieldName: string, record: Record<string, any> | null) => void;
}

export const ReferenceRecordCtx = createContext<ReferenceRecordContextValue | null>(null);

export interface RenderProviderProps {
  mode: RenderMode;
  fields: Field[];
  entities?: EntityWithFields[];
  data?: Record<string, any>;
  onChange?: (columnName: string, value: any) => void;
  errors?: Record<string, string>;
  t?: TranslateFn;
  services?: Omit<ServiceContextValue, 'childrenData' | 'onChildrenChange'>;
  childrenData?: Record<string, Record<string, any>[]>;
  onChildrenChange?: (entityCode: string, rows: Record<string, any>[]) => void;
  children: ReactNode;
}

export function RenderProvider({
  mode,
  fields,
  entities = [],
  data,
  onChange,
  errors = {},
  t: tProp,
  services = {},
  childrenData,
  onChildrenChange,
  children,
}: RenderProviderProps) {
  // Local state for form data (preview/create without external state)
  const [localData, setLocalData] = useState<Record<string, any>>({});
  const effectiveData = data ?? localData;
  const localOnChange = useCallback((col: string, val: any) =>
    setLocalData((prev) => ({ ...prev, [col]: val })),
  []);
  const effectiveOnChange = onChange ?? localOnChange;

  // Local state for children/SubTable data (preview/create without external state)
  const [localChildrenData, setLocalChildrenData] = useState<Record<string, Record<string, any>[]>>({});
  const effectiveChildrenData = childrenData ?? localChildrenData;
  const localOnChildrenChange = useCallback((entityCode: string, rows: Record<string, any>[]) =>
    setLocalChildrenData((prev) => ({ ...prev, [entityCode]: rows })),
  []);
  const effectiveOnChildrenChange = onChildrenChange ?? localOnChildrenChange;

  // Local state for reference record cache (used by LOOKUP fields to read target records)
  const [referenceRecordCache, setReferenceRecordCache] = useState<ReferenceRecordCache>({});
  const setReferenceRecord = useCallback(
    (fieldName: string, record: Record<string, any> | null) => {
      setReferenceRecordCache((prev) => ({ ...prev, [fieldName]: record }));
    },
    [],
  );

  const referenceRecordValue = useMemo<ReferenceRecordContextValue>(
    () => ({ cache: referenceRecordCache, setReferenceRecord }),
    [referenceRecordCache, setReferenceRecord],
  );

  // Build a unified field lookup that covers both main-table fields and
  // entity-owned (sub-table) fields. Some callers (e.g. the model detail
  // page) split these into `fields` (main) and `entities[].fields` (sub),
  // and we still need every Field LayoutNode to resolve its real Field —
  // including its persisted props like `span` — by id.
  const fieldMap = useMemo(() => {
    const m = new Map<string, Field>();
    for (const f of fields) m.set(f.id, f);
    for (const e of entities) {
      for (const f of e.fields ?? []) m.set(f.id, f);
    }
    return m;
  }, [fields, entities]);

  const defaultT: TranslateFn = useCallback((key: string) => key, []);
  const t = tProp ?? defaultT;

  const renderValue = useMemo(
    () => ({
      mode,
      fields,
      entities,
      fieldMap,
      data: effectiveData,
      onChange: effectiveOnChange,
      errors,
      t,
    }),
    [mode, fields, entities, fieldMap, effectiveData, effectiveOnChange, errors, t],
  );

  const serviceValue = useMemo<ServiceContextValue>(
    () => ({
      ...services,
      childrenData: effectiveChildrenData,
      onChildrenChange: effectiveOnChildrenChange,
      t,
    }),
    [services, effectiveChildrenData, effectiveOnChildrenChange, t],
  );

  return (
    <ReferenceRecordCtx.Provider value={referenceRecordValue}>
      <RenderCtx.Provider value={renderValue}>
        <ServiceCtx.Provider value={serviceValue}>
          {children}
        </ServiceCtx.Provider>
      </RenderCtx.Provider>
    </ReferenceRecordCtx.Provider>
  );
}
