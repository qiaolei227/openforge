'use client';

import { useContext, useState, useEffect, type ComponentType } from 'react';
import type { FieldType } from '@openforge/shared';
import { getFieldComponent, type FieldComponentProps } from '@openforge/ui';
import { RenderCtx, ServiceCtx } from './context';

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
