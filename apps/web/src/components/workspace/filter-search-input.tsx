'use client';

import { useState, useEffect, type ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient } from '@/lib/api-client';
import { getFieldComponent, type FieldComponentProps, type ApiQueryFn, type SystemQueryFn } from '@openforge/ui';
import type { Field, QueryResponse } from '@openforge/shared';

/* ------------------------------------------------------------------ */
/*  Module-level caches + shared API functions                         */
/* ------------------------------------------------------------------ */

const modelInfoCache = new Map<
  string,
  { appCode: string; modelCode: string; name: string }
>();

async function resolveModelInfo(targetModelId: string) {
  const cached = modelInfoCache.get(targetModelId);
  if (cached) return cached;
  const { data: model } = await apiClient.get(`/models/${targetModelId}`);
  const info = {
    appCode: model.app?.code ?? '',
    modelCode: model.code,
    name: model.name ?? '',
  };
  modelInfoCache.set(targetModelId, info);
  return info;
}

const queryFn: ApiQueryFn = async ({ appCode, modelCode }, params) => {
  const { data: resp } = await apiClient.post<QueryResponse>(
    `/apps/${appCode}/models/${modelCode}/data/query`,
    {
      keyword: params.keyword || undefined,
      page: params.page || 1,
      pageSize: params.pageSize || 10,
      includeArchived: params.includeArchived ?? false,
      ...(params.searchFields?.length ? { searchFields: params.searchFields } : {}),
    },
  );
  return { data: resp.data, total: resp.total };
};

const systemQueryFn: SystemQueryFn = async (table, params) => {
  const endpoint = table === 'users' ? '/users' : '/orgs';
  const qp = new URLSearchParams();
  if (params.keyword) qp.set('keyword', params.keyword);
  if (params.page) qp.set('page', String(params.page));
  if (params.pageSize) qp.set('pageSize', String(params.pageSize));
  const { data: resp } = await apiClient.get(`${endpoint}?${qp.toString()}`);
  return { data: resp.data, total: resp.total };
};

const fetchSchema = async (appCode: string, modelCode: string) => {
  const { data } = await apiClient.get(`/apps/${appCode}/models/${modelCode}/data/schema`);
  return data;
};

/* ------------------------------------------------------------------ */
/*  Component loader cache                                             */
/* ------------------------------------------------------------------ */

const componentCache = new Map<string, ComponentType<FieldComponentProps>>();

async function loadComponent(fieldType: 'REFERENCE' | 'USER' | 'ORGANIZATION') {
  const cached = componentCache.get(fieldType);
  if (cached) return cached;
  const loader = getFieldComponent(fieldType);
  if (!loader) return null;
  const mod = await loader();
  componentCache.set(fieldType, mod.default);
  return mod.default;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface FilterSearchInputProps {
  type: 'reference' | 'user' | 'organization';
  field: Field;
  value: any;
  onChange: (v: any) => void;
}

/* ------------------------------------------------------------------ */
/*  Main dispatch                                                      */
/* ------------------------------------------------------------------ */

export function FilterSearchInput(props: FilterSearchInputProps) {
  if (props.type === 'reference') return <FilterReferenceInput {...props} />;
  if (props.type === 'user') return <FilterSystemInput {...props} table="users" />;
  if (props.type === 'organization') return <FilterSystemInput {...props} table="orgs" />;
  return null;
}

/* ------------------------------------------------------------------ */
/*  Reference — wraps RelationPicker with model resolution             */
/* ------------------------------------------------------------------ */

function FilterReferenceInput({ field, value, onChange }: FilterSearchInputProps) {
  const t = useTranslations();
  const [Comp, setComp] = useState<ComponentType<FieldComponentProps> | null>(null);
  const [modelInfo, setModelInfo] = useState<{ appCode: string; modelCode: string; name: string } | null>(null);
  const [displayValue, setDisplayValue] = useState<string>('');

  const targetModelId = field.options?.targetModelId as string | undefined;
  const displayField = (field.options?.targetDisplayField as string | undefined) || 'name';

  // Lazy-load RelationPicker
  useEffect(() => {
    let cancelled = false;
    loadComponent('REFERENCE').then((C) => {
      if (!cancelled) setComp(() => C);
    });
    return () => { cancelled = true; };
  }, []);

  // Resolve target model → appCode/modelCode
  useEffect(() => {
    if (!targetModelId) return;
    let cancelled = false;
    resolveModelInfo(targetModelId).then((info) => {
      if (!cancelled) setModelInfo(info);
    }).catch(() => {
      if (!cancelled) setModelInfo({ appCode: '', modelCode: '', name: '' });
    });
    return () => { cancelled = true; };
  }, [targetModelId]);

  // Resolve display value for existing UUID
  useEffect(() => {
    if (!value || !modelInfo?.appCode || !modelInfo?.modelCode) {
      setDisplayValue('');
      return;
    }
    let cancelled = false;
    apiClient
      .get(`/apps/${modelInfo.appCode}/models/${modelInfo.modelCode}/data/${value}`)
      .then(({ data }) => {
        if (cancelled) return;
        setDisplayValue(data?.[displayField] ?? data?.name ?? String(value));
      })
      .catch(() => {
        if (!cancelled) setDisplayValue(String(value));
      });
    return () => { cancelled = true; };
  }, [value, modelInfo, displayField]);

  if (!Comp || !modelInfo) {
    return <div className="flex-1 min-w-0 h-9 rounded-md border border-input bg-muted/30 animate-pulse" />;
  }

  return (
    <div className="flex-1 min-w-0">
      <Comp
        field={field}
        value={value ?? null}
        onChange={(v: any) => onChange(v ?? undefined)}
        mode="edit"
        {...{
          queryFn,
          fetchSchema,
          targetAppCode: modelInfo.appCode,
          targetModelCode: modelInfo.modelCode,
          targetModelName: modelInfo.name,
          displayValue,
          t,
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  User / Organization — wraps UserField / OrgField                   */
/* ------------------------------------------------------------------ */

function FilterSystemInput({
  field,
  value,
  onChange,
  table,
}: FilterSearchInputProps & { table: 'users' | 'orgs' }) {
  const [Comp, setComp] = useState<ComponentType<FieldComponentProps> | null>(null);
  const [displayValue, setDisplayValue] = useState<string>('');

  const fieldType = table === 'users' ? 'USER' : 'ORGANIZATION';

  // Lazy-load component
  useEffect(() => {
    let cancelled = false;
    loadComponent(fieldType).then((C) => {
      if (!cancelled) setComp(() => C);
    });
    return () => { cancelled = true; };
  }, [fieldType]);

  // Resolve display value for existing UUID
  useEffect(() => {
    if (!value) {
      setDisplayValue('');
      return;
    }
    let cancelled = false;
    apiClient
      .get(`/${table}/${value}`)
      .then(({ data }) => {
        if (cancelled) return;
        if (table === 'users') {
          setDisplayValue(data?.displayName || data?.username || String(value));
        } else {
          setDisplayValue(data?.name || String(value));
        }
      })
      .catch(() => {
        if (!cancelled) setDisplayValue(String(value));
      });
    return () => { cancelled = true; };
  }, [value, table]);

  if (!Comp) {
    return <div className="flex-1 min-w-0 h-9 rounded-md border border-input bg-muted/30 animate-pulse" />;
  }

  return (
    <div className="flex-1 min-w-0">
      <Comp
        field={field}
        value={value ?? null}
        onChange={(v: any) => onChange(v ?? undefined)}
        mode="edit"
        {...{ systemQueryFn, displayValue }}
      />
    </div>
  );
}
