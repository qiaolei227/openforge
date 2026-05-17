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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  workflowTaskApi,
  type WorkflowUserSearchItem,
} from '@/lib/api/workflow';
import { useToastStore } from '@/stores/toast-store';
import { getApiErrorMessage } from '@/lib/utils';
import { UserPicker } from './user-picker';

interface Props {
  open: boolean;
  /** 'before' = 前加签 (the new approver acts before the current one);
   *  'after'  = 后加签 (the new approver acts after the current one). */
  position: 'before' | 'after';
  onOpenChange: (open: boolean) => void;
  taskId: string;
  onDone: () => void;
}

export function AddSignerDialog({
  open,
  position,
  onOpenChange,
  taskId,
  onDone,
}: Props) {
  const tDialog = useTranslations('workflow.dialog');
  const tActions = useTranslations('workflow.actions');
  const tErrors = useTranslations('errorCodes');
  const tCommon = useTranslations('common');
  const showToast = useToastStore((s) => s.show);

  const [user, setUser] = useState<WorkflowUserSearchItem | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setUser(null);
      setComment('');
      setSubmitting(false);
    }
  }, [open]);

  const title =
    position === 'before'
      ? tDialog('addBeforeTitle')
      : tDialog('addAfterTitle');

  const canSubmit = user != null && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await workflowTaskApi.addSigner(
        taskId,
        position,
        user!.id,
        comment.trim() || undefined,
      );
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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-signer-user">
              {tDialog('userLabel')} <span className="text-destructive">*</span>
            </Label>
            <UserPicker
              id="add-signer-user"
              value={user}
              onChange={setUser}
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-signer-comment">
              {tDialog('commentOptional')}
            </Label>
            <Textarea
              id="add-signer-comment"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              disabled={submitting}
            />
          </div>
        </div>
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
            disabled={!canSubmit}
            className="inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium h-9 px-4 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {tDialog('confirm')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
