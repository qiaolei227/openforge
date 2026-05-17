'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { workflowInstanceApi } from '@/lib/api/workflow';
import { useToastStore } from '@/stores/toast-store';
import { getApiErrorMessage } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  onDone: () => void;
}

/**
 * Confirm-only dialog — withdraw a running workflow instance.
 * Only available to the submitter while no node has yet approved (caller enforces).
 */
export function WithdrawDialog({
  open,
  onOpenChange,
  instanceId,
  onDone,
}: Props) {
  const tDialog = useTranslations('workflow.dialog');
  const tActions = useTranslations('workflow.actions');
  const tErrors = useTranslations('errorCodes');
  const tCommon = useTranslations('common');
  const showToast = useToastStore((s) => s.show);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setSubmitting(false);
  }, [open]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await workflowInstanceApi.withdraw(instanceId);
      showToast(tActions('operationSuccess'), 'success');
      onOpenChange(false);
      onDone();
    } catch (err) {
      showToast(
        getApiErrorMessage(err, tErrors, tActions('operationFailed')),
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tDialog('withdrawTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {tDialog('withdrawConfirm')}
        </p>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 border border-input bg-background hover:bg-accent disabled:opacity-50"
          >
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium h-9 px-4 bg-destructive text-white shadow hover:bg-destructive/90 disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {tDialog('confirm')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
