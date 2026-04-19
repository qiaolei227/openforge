'use client';

import { useContext, useState, useEffect, type ComponentType } from 'react';
import type { FieldType } from '@openforge/shared';
import { getFieldComponent, type FieldComponentProps } from '@openforge/ui';
import { RenderCtx, ServiceCtx } from './context';
import { ReferenceRecordCtx } from './provider';

export function useRenderContext() {
  return useContext(RenderCtx);
}

export function useServiceContext() {
  return useContext(ServiceCtx);
}

const globalComponentCache = new Map<string, ComponentType<FieldComponentProps>>();

export function useFieldComponent(fieldType: FieldType): ComponentType<FieldComponentProps> | null {
  const [comp, setComp] = useState<ComponentType<FieldComponentProps> | null>(
    () => globalComponentCache.get(fieldType) ?? null,
  );

  useEffect(() => {
    if (globalComponentCache.has(fieldType)) {
      // Wrap in arrow to prevent React from calling the component as a state updater
      setComp(() => globalComponentCache.get(fieldType)!);
      return;
    }
    let cancelled = false;
    const loader = getFieldComponent(fieldType);
    if (!loader) return;
    loader().then((mod) => {
      globalComponentCache.set(fieldType, mod.default);
      if (!cancelled) setComp(() => mod.default);
    });
    return () => { cancelled = true; };
  }, [fieldType]);

  return comp;
}

/**
 * Subscribe to the full target record currently selected in a REFERENCE/USER/ORGANIZATION field.
 * Returns null when no record is cached for that field.
 */
export function useReferenceRecord(fieldName: string): Record<string, any> | null {
  const ctx = useContext(ReferenceRecordCtx);
  return ctx?.cache[fieldName] ?? null;
}

/**
 * Get the setter used by REFERENCE/USER/ORGANIZATION pickers to write the full
 * target record into the form's cache, so LOOKUP fields can read columns from it.
 * Returns a no-op when used outside a RenderProvider.
 */
export function useSetReferenceRecord(): (fieldName: string, record: Record<string, any> | null) => void {
  const ctx = useContext(ReferenceRecordCtx);
  if (!ctx) return () => {};
  return ctx.setReferenceRecord;
}
