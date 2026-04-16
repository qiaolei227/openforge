'use client';

import { useState, useEffect, useRef } from 'react';
import type { Field, LayoutNode } from '@openforge/shared';
import type { PickerColumn } from './field-props';

interface SchemaView {
  id: string;
  type: string;
  isDefault: boolean;
  layout: any;
}

interface SchemaResponse {
  fields: Field[];
  views?: SchemaView[];
}

/** Walk the layout tree recursively, collecting Column nodes that have a fieldId prop. */
function collectColumnNodes(node: LayoutNode): Array<{ fieldId: string; label?: string }> {
  const results: Array<{ fieldId: string; label?: string }> = [];

  if (node.type === 'Column' && node.props?.fieldId) {
    results.push({ fieldId: node.props.fieldId, label: node.props.label });
  }

  if (node.children) {
    for (const child of node.children) {
      results.push(...collectColumnNodes(child));
    }
  }

  return results;
}

/** Parse a layout value (string JSON or object) into a LayoutNode tree root. Returns null on failure. */
function parseLayout(layout: any): LayoutNode | null {
  if (!layout) return null;
  if (typeof layout === 'string') {
    try {
      return JSON.parse(layout) as LayoutNode;
    } catch {
      return null;
    }
  }
  if (typeof layout === 'object') {
    return layout as LayoutNode;
  }
  return null;
}

export function usePickerColumns(
  field: Field,
  targetAppCode: string,
  targetModelCode: string,
  fetchSchema: (appCode: string, modelCode: string) => Promise<SchemaResponse>,
): { columns: PickerColumn[]; loading: boolean } {
  const [columns, setColumns] = useState<PickerColumn[]>([]);
  const [loading, setLoading] = useState(true);

  // Track the last fetched target to avoid redundant network calls when
  // the same (appCode, modelCode) pair is seen again.
  const fetchedRef = useRef<string | null>(null);
  const cacheRef = useRef<SchemaResponse | null>(null);

  useEffect(() => {
    if (!targetAppCode || !targetModelCode) {
      setLoading(false);
      return;
    }

    const cacheKey = `${targetAppCode}::${targetModelCode}`;
    let cancelled = false;

    async function resolve() {
      setLoading(true);

      let schema: SchemaResponse;

      if (fetchedRef.current === cacheKey && cacheRef.current) {
        // Re-use cached schema — same target model.
        schema = cacheRef.current;
      } else {
        try {
          schema = await fetchSchema(targetAppCode, targetModelCode);
          if (cancelled) return;
          fetchedRef.current = cacheKey;
          cacheRef.current = schema;
        } catch {
          // Fetch failed — fall through to tier 3.
          if (cancelled) return;
          const fallbackKey = field.options?.targetDisplayField ?? 'name';
          setColumns([{ key: fallbackKey, label: fallbackKey, fieldType: 'STRING' }]);
          setLoading(false);
          return;
        }
      }

      // Build a lookup map: columnName → Field and id → Field
      const fieldByColumnName = new Map<string, Field>();
      const fieldById = new Map<string, Field>();
      for (const f of schema.fields) {
        fieldByColumnName.set(f.columnName, f);
        fieldById.set(f.id, f);
      }

      // --- Tier 1: default list view layout ---
      const defaultListView = schema.views?.find(
        (v) => v.type === 'list' && v.isDefault,
      );
      if (defaultListView?.layout) {
        const root = parseLayout(defaultListView.layout);
        if (root) {
          const colNodes = collectColumnNodes(root);
          const tier2: PickerColumn[] = [];
          for (const { fieldId, label } of colNodes) {
            // fieldId in layout nodes may be the field UUID or columnName — try both.
            const f = fieldById.get(fieldId) ?? fieldByColumnName.get(fieldId);
            if (f) {
              tier2.push({
                key: f.columnName,
                label: label ?? f.name,
                fieldType: f.fieldType,
              });
            }
          }
          if (tier2.length > 0) {
            setColumns(tier2);
            setLoading(false);
            return;
          }
        }
      }

      // --- Tier 2: all non-system fields from target model ---
      const allCols: PickerColumn[] = schema.fields
        .filter((f) => !f.isSystem && !f.deletedAt)
        .map((f) => ({ key: f.columnName, label: f.name, fieldType: f.fieldType }));

      if (allCols.length > 0) {
        setColumns(allCols);
      } else {
        // Absolute fallback: single displayField
        const fallbackColName = field.options?.targetDisplayField ?? 'name';
        const fallbackField = fieldByColumnName.get(fallbackColName);
        setColumns([{
          key: fallbackColName,
          label: fallbackField?.name ?? fallbackColName,
          fieldType: fallbackField?.fieldType ?? 'STRING',
        }]);
      }
      setLoading(false);
    }

    resolve();

    return () => {
      cancelled = true;
    };
  }, [field, targetAppCode, targetModelCode, fetchSchema]);

  return { columns, loading };
}
