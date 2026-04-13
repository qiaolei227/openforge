'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { Loader2, FileText } from 'lucide-react';
import type { Field, SysView } from '@openforge/shared';
import type { EntityWithFields } from '@openforge/render-engine';
import RecordBrowser from '@/app/(authenticated)/apps/[appId]/models/[modelId]/record-browser';
import { RecordPage } from '@/components/workspace/record-page';
import { useTabStore } from '@/stores/tab-store';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ModelSchema {
  id: string;
  name: string;
  code: string;
  tableName: string;
  isTree?: boolean;
  enableDataStatus?: boolean;
  app: { id: string; code: string; name: string };
  fields: Field[];
  entities?: EntityWithFields[];
  views?: SysView[];
}

/**
 * Workspace runtime — list + CRUD for a single model, driven by tab store.
 *
 * URL: /workspace/:appCode/:modelCode
 *
 * On mount the page auto-opens a list tab for the URL model. The active tab
 * determines what is rendered:
 * - list   → RecordBrowser (table with toolbar/filter)
 * - detail → RecordPage (form, existing record)
 * - create → RecordPage (form, new record)
 *
 * When the active tab points to a different model the schema is re-fetched.
 */
export default function WorkspaceModelPage() {
  const { appCode, modelCode } = useParams<{
    appCode: string;
    modelCode: string;
  }>();
  const tErrors = useTranslations('errorCodes');

  const activeTab = useTabStore((s) => s.getActiveTab());
  const openListTab = useTabStore((s) => s.openListTab);

  /* ---------- Schema cache keyed by appCode/modelCode ---------- */
  const [schemaCache, setSchemaCache] = useState<Map<string, ModelSchema>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef<string | null>(null);

  /** Determine which model we need the schema for */
  const targetAppCode = activeTab?.appCode ?? appCode;
  const targetModelCode = activeTab?.modelCode ?? modelCode;
  const schemaKey = `${targetAppCode}/${targetModelCode}`;
  const schema = schemaCache.get(schemaKey) ?? null;

  /* ---------- Fetch schema when needed ---------- */
  const fetchSchema = useCallback(
    async (ac: string, mc: string) => {
      const key = `${ac}/${mc}`;
      if (fetchingRef.current === key) return; // already fetching
      fetchingRef.current = key;
      setError(null);
      setLoading(true);
      try {
        const { data } = await apiClient.get<ModelSchema>(
          `/apps/${ac}/models/${mc}/data/schema`,
        );
        setSchemaCache((prev) => {
          const next = new Map(prev);
          next.set(key, data);
          return next;
        });
      } catch (err: unknown) {
        setError(getApiErrorMessage(err, tErrors, '加载失败'));
      } finally {
        setLoading(false);
        fetchingRef.current = null;
      }
    },
    [tErrors],
  );

  // Fetch schema for the current target model if not already cached
  useEffect(() => {
    if (!schemaCache.has(schemaKey)) {
      fetchSchema(targetAppCode, targetModelCode);
    }
  }, [schemaKey, targetAppCode, targetModelCode, schemaCache, fetchSchema]);

  /* ---------- Auto-open list tab when arriving via URL ---------- */
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    // On first mount, open a list tab for the URL model (uses schema name if available)
    const cached = schemaCache.get(`${appCode}/${modelCode}`);
    openListTab({
      appCode,
      modelCode,
      modelName: cached?.name ?? modelCode,
    });
  }, [appCode, modelCode, openListTab, schemaCache]);

  // Once schema loads, update tab title if it was a placeholder
  useEffect(() => {
    if (!schema) return;
    const { tabs, activeTabId } = useTabStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (
      tab &&
      tab.type === 'list' &&
      tab.appCode === appCode &&
      tab.modelCode === modelCode &&
      tab.title === modelCode // was placeholder
    ) {
      useTabStore.getState().updateTitle(tab.id, schema.name);
    }
  }, [schema, appCode, modelCode]);

  /* ---------- Error state ---------- */
  if (error) {
    return <div className="p-8 text-muted-foreground">{error}</div>;
  }

  /* ---------- Loading state ---------- */
  if (loading && !schema) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* ---------- No active tab — placeholder ---------- */
  if (!activeTab) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center min-h-[40vh] gap-3 text-muted-foreground">
        <FileText className="w-8 h-8" />
        <p className="text-sm">请从左侧菜单选择一个模块</p>
      </div>
    );
  }

  /* ---------- Schema not yet loaded for this tab ---------- */
  if (!schema) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* ---------- Render based on active tab type ---------- */
  if (activeTab.type === 'list') {
    return (
      <RecordBrowser
        model={{
          id: schema.id,
          name: schema.name,
          code: schema.code,
          tableName: schema.tableName,
          isTree: schema.isTree,
          enableDataStatus: schema.enableDataStatus,
          app: { code: schema.app.code },
        }}
        fields={schema.fields}
        tabId={activeTab.id}
      />
    );
  }

  if (activeTab.type === 'detail') {
    return (
      <RecordPage
        appCode={activeTab.appCode}
        modelCode={activeTab.modelCode}
        modelId={schema.id}
        modelName={schema.name}
        enableDataStatus={!!schema.enableDataStatus}
        fields={schema.fields}
        entities={schema.entities}
        views={schema.views}
        recordId={activeTab.recordId}
        tabId={activeTab.id}
      />
    );
  }

  if (activeTab.type === 'create') {
    return (
      <RecordPage
        appCode={activeTab.appCode}
        modelCode={activeTab.modelCode}
        modelId={schema.id}
        modelName={schema.name}
        enableDataStatus={!!schema.enableDataStatus}
        fields={schema.fields}
        entities={schema.entities}
        views={schema.views}
        tabId={activeTab.id}
      />
    );
  }

  return null;
}
