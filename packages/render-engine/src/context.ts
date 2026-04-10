import { createContext } from 'react';
import type { Field, SysEntity } from '@openforge/shared';
import type { ApiQueryFn, SystemQueryFn } from '@openforge/ui';

export type RenderMode = 'preview' | 'create' | 'edit' | 'view';

export interface EntityWithFields extends SysEntity {
  fields?: Field[];
}

export type TranslateFn = (key: string, values?: Record<string, any>) => string;

export interface RenderContextValue {
  mode: RenderMode;
  fields: Field[];
  entities: EntityWithFields[];
  fieldMap: Map<string, Field>;
  data: Record<string, any>;
  onChange: (columnName: string, value: any) => void;
  errors: Record<string, string>;
  t: TranslateFn;
}

export interface ServiceContextValue {
  queryFn?: ApiQueryFn;
  systemQueryFn?: SystemQueryFn;
  uploadFn?: (file: File) => Promise<{ id: string; originalName: string; url: string }>;
  fileData?: Record<string, any>;
  relationMeta?: Record<string, { appCode: string; modelCode: string; name: string }>;
  childrenData?: Record<string, Record<string, any>[]>;
  onChildrenChange?: (entityCode: string, rows: Record<string, any>[]) => void;
}

const noop = () => {};

export const RenderCtx = createContext<RenderContextValue>({
  mode: 'preview',
  fields: [],
  entities: [],
  fieldMap: new Map(),
  data: {},
  onChange: noop,
  errors: {},
  t: (key: string) => key,
});

export const ServiceCtx = createContext<ServiceContextValue>({});
