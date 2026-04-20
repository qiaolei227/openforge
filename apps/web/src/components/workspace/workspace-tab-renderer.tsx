'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import type { Field, SysView } from '@openforge/shared';
import type { EntityWithFields } from '@openforge/render-engine';
import RecordBrowser from '@/app/(authenticated)/apps/[appId]/models/[modelId]/record-browser';
import { RecordPage } from '@/components/workspace/record-page';
import { useTabStore, type Tab } from '@/stores/tab-store';
import { useCurrentApp } from '@/hooks/use-current-app';

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
  dataScope?: 'private' | 'shared' | 'distributed';
  app: { id: string; code: string; name: string };
  fields: Field[];
  entities?: EntityWithFields[];
  views?: SysView[];
}

/* ------------------------------------------------------------------ */
/*  Tab content                                                        */
/* ------------------------------------------------------------------ */

function TabContent({ tab, schema }: { tab: Tab; schema: ModelSchema }) {
  if (tab.type === 'list') {
    return (
      <RecordBrowser
        model={{
          id: schema.id,
          name: schema.name,
          code: schema.code,
          tableName: schema.tableName,
          isTree: schema.isTree,
          enableDataStatus: schema.enableDataStatus,
          dataScope: schema.dataScope,
          app: { code: schema.app.code },
        }}
        fields={schema.fields}
        entities={schema.entities}
        tabId={tab.id}
      />
    );
  }

  return (
    <RecordPage
      appCode={tab.appCode}
      modelCode={tab.modelCode}
      modelId={schema.id}
      modelName={schema.name}
      enableDataStatus={!!schema.enableDataStatus}
      fields={schema.fields}
      entities={schema.entities}
      views={schema.views}
      recordId={tab.type === 'detail' ? tab.recordId : undefined}
      tabId={tab.id}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Tab renderer — renders ALL tabs across ALL systems                 */
/* ------------------------------------------------------------------ */

export function WorkspaceTabRenderer() {
  const tErrors = useTranslations('errorCodes');
  const { appCode } = useCurrentApp();

  const allTabs = useTabStore((s) => s.tabs);
  const activeTab = useTabStore((s) => s.getActiveTabForApp(appCode ?? ''));

  /* ---------- Schema cache (global across systems) ---------- */
  const [schemaCache, setSchemaCache] = useState<Map<string, ModelSchema>>(new Map());
  const fetchingRef = useRef<Set<string>>(new Set());

  const fetchSchema = useCallback(
    async (ac: string, mc: string) => {
      const key = `${ac}/${mc}`;
      if (fetchingRef.current.has(key)) return;
      fetchingRef.current.add(key);
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
        // Silently fail — tab will show loading state
        console.error(`Failed to load schema for ${key}:`, getApiErrorMessage(err, tErrors, ''));
      } finally {
        fetchingRef.current.delete(key);
      }
    },
    [tErrors],
  );

  /* Fetch schemas for all tabs */
  useEffect(() => {
    for (const tab of allTabs) {
      const key = `${tab.appCode}/${tab.modelCode}`;
      if (!schemaCache.has(key)) {
        fetchSchema(tab.appCode, tab.modelCode);
      }
    }
  }, [allTabs, schemaCache, fetchSchema]);

  /* Update tab titles */
  useEffect(() => {
    for (const tab of allTabs) {
      const schema = schemaCache.get(`${tab.appCode}/${tab.modelCode}`);
      if (schema && tab.title === tab.modelCode) {
        useTabStore.getState().updateTitle(tab.id, schema.name);
      }
    }
  }, [allTabs, schemaCache]);

  if (allTabs.length === 0) return null;

  /* Active tab's schema loading — show spinner without unmounting other tabs */
  const activeSchemaKey = activeTab ? `${activeTab.appCode}/${activeTab.modelCode}` : '';
  const activeSchemaLoading = activeTab && !schemaCache.has(activeSchemaKey);

  /* ALWAYS render all tabs so component state survives system switches.
     Never return null when there are tabs — that would unmount everything. */
  return (
    <>
      {activeSchemaLoading && (
        <div className="flex justify-center p-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {allTabs.map((tab) => {
        const schema = schemaCache.get(`${tab.appCode}/${tab.modelCode}`);
        if (!schema) return null;
        const isVisible = activeTab?.id === tab.id && !activeSchemaLoading;
        return (
          <div key={tab.id} className={isVisible ? 'h-full' : 'hidden'}>
            <TabContent tab={tab} schema={schema} />
          </div>
        );
      })}
    </>
  );
}
