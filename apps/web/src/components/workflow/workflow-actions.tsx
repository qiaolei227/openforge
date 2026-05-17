'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { workflowInstanceApi } from '@/lib/api/workflow';
import { getApiErrorMessage } from '@/lib/utils';
import { ApproveDialog } from './dialogs/approve-dialog';
import { RejectDialog } from './dialogs/reject-dialog';
import { TransferDialog } from './dialogs/transfer-dialog';
import { AddSignerDialog } from './dialogs/add-signer-dialog';
import { ReturnDialog } from './dialogs/return-dialog';
import { WithdrawDialog } from './dialogs/withdraw-dialog';

interface Props {
  instance: any;
  onAction: () => void;
}

type AllowedActions = {
  approve?: boolean;
  reject?: boolean;
  transfer?: boolean;
  addBefore?: boolean;
  addAfter?: boolean;
  returnPrev?: boolean;
  returnStart?: boolean;
};

/**
 * Action buttons that surface inside the form-page workflow section.
 *
 * Two role tracks (a user may be both):
 * - **Approver**: current user has a `pending` task whose `nodeType === 'approve'`.
 *   Buttons: Approve / Reject / Transfer / AddSigner(before|after) / Return(prev|start).
 *   Each action's visibility honors the node-config's `allowedActions` flags
 *   (defaults to true when the flag is undefined).
 *
 * - **Submitter**: current user started the instance and the instance is still
 *   `running`. Buttons: Withdraw (only while no node has yet approved) / Urge.
 */
export function WorkflowActions({ instance, onAction }: Props) {
  const tActions = useTranslations('workflow.actions');
  const tErrors = useTranslations('errorCodes');
  const showToast = useToastStore((s) => s.show);
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;

  const myPendingTask = useMemo(() => {
    if (!userId) return null;
    return (instance?.tasks ?? []).find(
      (t: any) =>
        t.assigneeUserId === userId &&
        t.status === 'pending' &&
        t.nodeType === 'approve',
    );
  }, [instance?.tasks, userId]);

  const def = instance?.workflowVersion?.definition;
  const node =
    myPendingTask && def && Array.isArray(def.nodes)
      ? def.nodes.find((n: any) => n.id === myPendingTask.nodeId)
      : null;
  const allowed: AllowedActions = node?.config?.allowedActions ?? {};

  const isRunning = instance?.status === 'running';
  const isSubmitter = userId === instance?.startedBy && isRunning;
  const hasAnyApproved = (instance?.tasks ?? []).some(
    (t: any) => t.status === 'approved',
  );
  const canWithdraw = isSubmitter && !hasAnyApproved;
  const canUrge = isSubmitter;

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [addSignerOpen, setAddSignerOpen] = useState<'before' | 'after' | null>(
    null,
  );
  const [returnOpen, setReturnOpen] = useState<'prev' | 'start' | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [urging, setUrging] = useState(false);

  const handleUrge = async () => {
    if (urging) return;
    setUrging(true);
    try {
      await workflowInstanceApi.urge(instance.id);
      showToast(tActions('urgeSent'), 'success');
    } catch (err) {
      showToast(
        getApiErrorMessage(err, tErrors, tActions('operationFailed')),
        'error',
      );
    } finally {
      setUrging(false);
    }
  };

  // If neither approver nor submitter on a running instance, render nothing.
  if (!myPendingTask && !isSubmitter) return null;

  const btnBase =
    'inline-flex items-center justify-center rounded-md h-8 px-3 text-xs font-medium disabled:opacity-50 disabled:pointer-events-none transition-colors';
  const btnPrimary = `${btnBase} bg-primary text-primary-foreground shadow hover:bg-primary/90`;
  const btnDanger = `${btnBase} bg-destructive text-white shadow hover:bg-destructive/90`;
  const btnOutline = `${btnBase} border border-input bg-background hover:bg-accent hover:text-accent-foreground`;
  const btnGhost = `${btnBase} hover:bg-muted hover:text-foreground`;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {myPendingTask && (
        <>
          {allowed.approve !== false && (
            <button
              type="button"
              className={btnPrimary}
              onClick={() => setApproveOpen(true)}
            >
              {tActions('approve')}
            </button>
          )}
          {allowed.reject !== false && (
            <button
              type="button"
              className={btnDanger}
              onClick={() => setRejectOpen(true)}
            >
              {tActions('reject')}
            </button>
          )}
          {allowed.transfer !== false && (
            <button
              type="button"
              className={btnOutline}
              onClick={() => setTransferOpen(true)}
            >
              {tActions('transfer')}
            </button>
          )}
          {allowed.addBefore !== false && (
            <button
              type="button"
              className={btnOutline}
              onClick={() => setAddSignerOpen('before')}
            >
              {tActions('addBefore')}
            </button>
          )}
          {allowed.addAfter !== false && (
            <button
              type="button"
              className={btnOutline}
              onClick={() => setAddSignerOpen('after')}
            >
              {tActions('addAfter')}
            </button>
          )}
          {allowed.returnPrev !== false && (
            <button
              type="button"
              className={btnOutline}
              onClick={() => setReturnOpen('prev')}
            >
              {tActions('returnPrev')}
            </button>
          )}
          {allowed.returnStart !== false && (
            <button
              type="button"
              className={btnOutline}
              onClick={() => setReturnOpen('start')}
            >
              {tActions('returnStart')}
            </button>
          )}
        </>
      )}
      {canWithdraw && (
        <button
          type="button"
          className={btnOutline}
          onClick={() => setWithdrawOpen(true)}
        >
          {tActions('withdraw')}
        </button>
      )}
      {canUrge && (
        <button
          type="button"
          className={btnGhost}
          onClick={handleUrge}
          disabled={urging}
        >
          {tActions('urge')}
        </button>
      )}

      {myPendingTask && (
        <>
          <ApproveDialog
            open={approveOpen}
            onOpenChange={setApproveOpen}
            taskId={myPendingTask.id}
            onDone={onAction}
          />
          <RejectDialog
            open={rejectOpen}
            onOpenChange={setRejectOpen}
            taskId={myPendingTask.id}
            onDone={onAction}
          />
          <TransferDialog
            open={transferOpen}
            onOpenChange={setTransferOpen}
            taskId={myPendingTask.id}
            onDone={onAction}
          />
          <AddSignerDialog
            open={addSignerOpen !== null}
            position={addSignerOpen ?? 'before'}
            onOpenChange={(o) => !o && setAddSignerOpen(null)}
            taskId={myPendingTask.id}
            onDone={onAction}
          />
          <ReturnDialog
            open={returnOpen !== null}
            mode={returnOpen ?? 'prev'}
            onOpenChange={(o) => !o && setReturnOpen(null)}
            taskId={myPendingTask.id}
            onDone={onAction}
          />
        </>
      )}
      {isSubmitter && (
        <WithdrawDialog
          open={withdrawOpen}
          onOpenChange={setWithdrawOpen}
          instanceId={instance.id}
          onDone={onAction}
        />
      )}
    </div>
  );
}
