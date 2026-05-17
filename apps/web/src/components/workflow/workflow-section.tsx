'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { workflowInstanceApi } from '@/lib/api/workflow';
import { useAuthStore } from '@/stores/auth-store';
import { WorkflowTimeline } from './workflow-timeline';
import { WorkflowActions } from './workflow-actions';
import { WorkflowLogs } from './workflow-logs';

interface WorkflowSectionProps {
  recordId: string;
  /**
   * Called by the parent (record-page) when the workflow section needs the
   * surrounding record to be refreshed — e.g. after Approve/Reject the engine
   * may have advanced `data_status` on the underlying record.
   */
  onRecordChange?: () => void;
  /**
   * Called whenever the instance is (re)loaded so the form can derive
   * `readonlyColumns` from the active approver node's `fieldPermissions`.
   * Pass `null` when there's no instance or no active task for the user.
   */
  onReadonlyColumnsChange?: (columns: string[]) => void;
}

/**
 * Form-page workflow section.
 *
 * Always probes `GET /workflow-instances/by-record/:recordId` once mounted; if
 * the record was never submitted, the endpoint returns `null` and this whole
 * component renders nothing. Otherwise it renders the timeline, actions, and
 * the collapsible log.
 *
 * Field-level readonly state for the active approver flows out via
 * `onReadonlyColumnsChange` — the parent unions it with any other readonly
 * sources (distribution policy, data-status) before handing to RenderProvider.
 */
export function WorkflowSection({
  recordId,
  onRecordChange,
  onReadonlyColumnsChange,
}: WorkflowSectionProps) {
  const tSection = useTranslations('workflow.section');

  const userId = useAuthStore((s) => s.user?.id);

  const [instance, setInstance] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const inst = await workflowInstanceApi.getByRecord(recordId);
      setInstance(inst);
    } catch {
      // Probe failure is non-fatal — pretend the record has no workflow.
      setInstance(null);
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    load();
  }, [load]);

  // Derive readonly columns from the active approver node's fieldPermissions.
  const readonlyColumns = useMemo(() => {
    if (!instance || instance.status !== 'running' || !userId) return [];
    const def = instance.workflowVersion?.definition;
    if (!def || !Array.isArray(def.nodes)) return [];
    const task = (instance.tasks ?? []).find(
      (t: any) =>
        t.assigneeUserId === userId &&
        t.status === 'pending' &&
        t.nodeType === 'approve',
    );
    if (!task) return [];
    const node = def.nodes.find((n: any) => n.id === task.nodeId);
    const fp = node?.config?.fieldPermissions;
    if (!fp || typeof fp !== 'object') return [];
    return Object.entries(fp)
      .filter(([, v]) => v === 'readonly')
      .map(([k]) => k);
  }, [instance, userId]);

  // Push readonly columns up to the parent whenever they change.
  useEffect(() => {
    onReadonlyColumnsChange?.(readonlyColumns);
  }, [readonlyColumns, onReadonlyColumnsChange]);

  const handleAction = useCallback(() => {
    load();
    onRecordChange?.();
  }, [load, onRecordChange]);

  if (loading) {
    return (
      <div className="mt-6 flex justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No instance — gracefully render nothing so unsubmitted records stay clean.
  if (!instance) return null;

  return (
    <section className="mt-6 mx-6 mb-6 rounded-md border bg-card p-4 space-y-4">
      <h3 className="text-base font-semibold">{tSection('title')}</h3>
      <WorkflowTimeline instance={instance} />
      <WorkflowActions instance={instance} onAction={handleAction} />
      <WorkflowLogs instance={instance} />
    </section>
  );
}
