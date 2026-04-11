'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import type { Field } from '@openforge/shared';
import RecordBrowser from '@/app/(authenticated)/apps/[appId]/models/[modelId]/record-browser';

interface ModelSchema {
  id: string;
  name: string;
  code: string;
  tableName: string;
  isTree?: boolean;
  app: { id: string; code: string; name: string };
  fields: Field[];
}

/**
 * Workspace runtime — list + CRUD for a single model.
 *
 * URL: /workspace/:appCode/:modelCode
 *
 * Business users navigate here from the sidebar menu tree. All data API calls
 * are gated by menu:model:* permissions automatically. This page loads the model
 * schema via GET /api/apps/:appCode/models/:modelCode/data/schema (also gated by
 * menu:model:* view) and delegates fully to the shared RecordBrowser component.
 *
 * Drawer-based UX (FormDrawer) is accepted as P2.1 tech debt — polish to
 * page-based forms is deferred.
 */
export default function WorkspaceModelPage() {
  const { appCode, modelCode } = useParams<{
    appCode: string;
    modelCode: string;
  }>();
  const tErrors = useTranslations('errorCodes');
  const [schema, setSchema] = useState<ModelSchema | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get<ModelSchema>(
          `/api/apps/${appCode}/models/${modelCode}/data/schema`,
        );
        if (!cancelled) setSchema(data);
      } catch (err: unknown) {
        if (!cancelled) setError(getApiErrorMessage(err, tErrors, '加载失败'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appCode, modelCode, tErrors]);

  if (error) {
    return <div className="p-8 text-muted-foreground">{error}</div>;
  }

  if (!schema) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <RecordBrowser
      model={{
        id: schema.id,
        name: schema.name,
        code: schema.code,
        tableName: schema.tableName,
        isTree: schema.isTree,
        app: { code: schema.app.code },
      }}
      fields={schema.fields}
    />
  );
}
