'use client';

import { useMemo } from 'react';
import type { LayoutConfig } from '@openforge/shared';
import { useRenderContext } from '../hooks';

export interface LayoutColumnConfig {
  fieldId: string;
  label?: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  fixed?: boolean;
}

export interface ListRendererProps {
  layout: LayoutConfig;
  children: (props: {
    layoutColumns: LayoutColumnConfig[];
    fields: import('@openforge/shared').Field[];
  }) => React.ReactNode;
}

export function ListRenderer({ layout, children }: ListRendererProps) {
  const { fields } = useRenderContext();

  const layoutColumns = useMemo<LayoutColumnConfig[]>(
    () =>
      layout.children
        .filter((n) => n.type === 'Column')
        .map((n) => ({
          fieldId: n.props?.fieldId,
          label: n.props?.label,
          width: n.props?.width,
          align: n.props?.align,
          fixed: n.props?.fixed,
        })),
    [layout.children],
  );

  return <>{children({ layoutColumns, fields })}</>;
}
