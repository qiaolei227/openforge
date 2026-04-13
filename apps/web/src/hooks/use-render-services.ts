'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Field, QueryResponse } from '@openforge/shared';
import type { ApiQueryFn, SystemQueryFn } from '@openforge/ui';
import type { EntityWithFields } from '@openforge/render-engine';
import { apiClient } from '@/lib/api-client';

/**
 * Relation metadata: for each REFERENCE/MULTI_REFERENCE field,
 * resolve the target model's app code and model code (needed to build data URLs).
 */
export type RelationMeta = Record<
  string,
  { appCode: string; modelCode: string; name: string }
>;

/**
 * Shape of the `services` object that gets passed to `<RenderProvider services={...}>`.
 * Includes all the stateless API functions plus the stateful relationMeta.
 */
export interface RenderServices {
  queryFn: ApiQueryFn;
  systemQueryFn: SystemQueryFn;
  uploadFn: (file: File) => Promise<{ id: string; originalName: string; url: string }>;
  fetchSchema: (appCode: string, modelCode: string) => Promise<{ fields: any[]; views?: any[] }>;
  relationMeta: RelationMeta;
  /** Fields that have a target model reference (REFERENCE/MULTI_REFERENCE) — for callers that need to iterate them. */
  referenceFields: Field[];
}

/**
 * Unified hook that provides all the services the render engine needs.
 * Used by the designer preview AND (future) runtime data pages.
 *
 * Pass in the current model's `fields` AND `entities` so REFERENCE/
 * MULTI_REFERENCE target model metadata can be resolved for both
 * main-form fields and sub-entity row cells.
 */
export function useRenderServices(
  fields: Field[],
  entities: EntityWithFields[] = [],
): RenderServices {
  /* ---------- Stateless API functions ---------- */

  const queryFn: ApiQueryFn = useCallback(
    async ({ appCode, modelCode }, params) => {
      const { data: resp } = await apiClient.post<QueryResponse>(
        `/apps/${appCode}/models/${modelCode}/data/query`,
        {
          keyword: params.keyword || undefined,
          page: params.page || 1,
          pageSize: params.pageSize || 10,
          includeArchived: params.includeArchived ?? false,
        },
      );
      return { data: resp.data, total: resp.total };
    },
    [],
  );

  const systemQueryFn: SystemQueryFn = useCallback(async (table, params) => {
    const endpoint = table === 'users' ? '/users' : '/orgs';
    const queryParams = new URLSearchParams();
    if (params.keyword) queryParams.set('keyword', params.keyword);
    if (params.page) queryParams.set('page', String(params.page));
    if (params.pageSize) queryParams.set('pageSize', String(params.pageSize));
    const { data: resp } = await apiClient.get(`${endpoint}?${queryParams.toString()}`);
    return { data: resp.data, total: resp.total };
  }, []);

  const uploadFn = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data: result } = await apiClient.post<{
      id: string;
      originalName: string;
      url: string;
    }>('/files/upload', formData);
    return result;
  }, []);

  const fetchSchema = useCallback(
    async (appCode: string, modelCode: string) => {
      const { data } = await apiClient.get(`/apps/${appCode}/models/${modelCode}/data/schema`);
      return data;
    },
    [],
  );

  /* ---------- Stateful: resolve target model metadata for REFERENCE fields ---------- */

  const [relationMeta, setRelationMeta] = useState<RelationMeta>({});

  // Collect all REFERENCE/MULTI_REFERENCE fields from both the main model
  // AND every sub-entity, so row-cell pickers inside SubTableField also
  // get their target model resolved.
  const referenceFields = useMemo(() => {
    const isRef = (f: Field) =>
      (f.fieldType === 'REFERENCE' || f.fieldType === 'MULTI_REFERENCE') &&
      f.options?.targetModelId;
    const collected: Field[] = fields.filter(isRef);
    for (const entity of entities) {
      for (const f of entity.fields ?? []) {
        if (isRef(f)) collected.push(f);
      }
    }
    return collected;
  }, [fields, entities]);

  // Build a stable key from the set of (columnName → targetModelId) so the
  // effect only re-runs when the actual targets change, not on every render.
  const referenceKey = useMemo(() => {
    if (referenceFields.length === 0) return '';
    const pairs = referenceFields
      .map((f) => `${f.columnName}:${f.options?.targetModelId}`)
      .sort();
    return pairs.join(',');
  }, [referenceFields]);

  useEffect(() => {
    if (!referenceKey) return;
    let cancelled = false;

    // Dedupe targetModelIds: multiple fields may point at the same model.
    // Map of targetModelId → list of columnNames referencing it.
    const targets = new Map<string, string[]>();
    for (const field of referenceFields) {
      const id = field.options?.targetModelId;
      if (!id) continue;
      const list = targets.get(id) ?? [];
      list.push(field.columnName);
      targets.set(id, list);
    }

    // Fetch all unique target models in parallel
    (async () => {
      const results = await Promise.all(
        Array.from(targets.entries()).map(async ([targetModelId, columnNames]) => {
          try {
            const { data: targetModel } = await apiClient.get(`/models/${targetModelId}`);
            const entry = {
              appCode: targetModel.app?.code ?? '',
              modelCode: targetModel.code,
              name: targetModel.name,
            };
            return columnNames.map((col) => [col, entry] as const);
          } catch (err) {
            console.warn('[useRenderServices] failed to resolve target model', targetModelId, err);
            return [] as Array<readonly [string, RelationMeta[string]]>;
          }
        }),
      );
      if (cancelled) return;
      setRelationMeta(Object.fromEntries(results.flat()));
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceKey]);

  /* ---------- Stable services object for RenderProvider ---------- */

  return useMemo(
    () => ({ queryFn, systemQueryFn, uploadFn, fetchSchema, relationMeta, referenceFields }),
    [queryFn, systemQueryFn, uploadFn, fetchSchema, relationMeta, referenceFields],
  );
}
