'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useToastStore } from '@/stores/toast-store';
import { getApiErrorMessage } from '@/lib/utils';
import {
  workflowApi,
  type Workflow,
  type WorkflowDefinitionFE,
} from '@/lib/api/workflow';
import { WorkflowEditorCanvas } from '@/components/workflow/editor/canvas';

const SEED_DEFINITION: WorkflowDefinitionFE = {
  nodes: [
    {
      id: 'start-1',
      type: 'start',
      name: '开始',
      position: { x: 100, y: 180 },
      config: {},
    },
    {
      id: 'end-1',
      type: 'end',
      name: '结束',
      position: { x: 520, y: 180 },
      config: {},
    },
  ],
  edges: [{ id: 'e-start-end', from: 'start-1', to: 'end-1' }],
};

export default function WorkflowEditorPage() {
  const params = useParams<{
    appId: string;
    modelId: string;
    workflowId: string;
  }>();
  const router = useRouter();
  const toast = useToastStore((s) => s.show);
  const tErrors = useTranslations('errorCodes');

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.workflowId) return;
    let cancelled = false;
    workflowApi
      .get(params.workflowId)
      .then((wf) => {
        if (!cancelled) setWorkflow(wf);
      })
      .catch((e: any) => {
        if (!cancelled) toast(getApiErrorMessage(e, tErrors, '加载失败'), 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.workflowId]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="h-screen flex items-center justify-center text-sm text-muted-foreground">
        流程不存在
      </div>
    );
  }

  const initialDefinition: WorkflowDefinitionFE =
    workflow.currentVersion?.definition ?? SEED_DEFINITION;

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              router.push(
                `/apps/${params.appId}/models/${params.modelId}?tab=workflow`,
              )
            }
            title="返回"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{workflow.name}</div>
            <div className="text-xs text-muted-foreground">
              {workflow.currentVersion
                ? `当前版本 v${workflow.currentVersion.versionNo}`
                : '尚未发布版本'}
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ReactFlowProvider>
          <WorkflowEditorCanvas
            workflowId={params.workflowId}
            initialDefinition={initialDefinition}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
