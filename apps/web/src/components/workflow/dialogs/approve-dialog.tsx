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
import { workflowTaskApi } from '@/lib/api/workflow';
import { useToastStore } from '@/stores/toast-store';
import { getApiErrorMessage } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  onDone: () => void;
}

export function ApproveDialog({ open, onOpenChange, taskId, onDone }: Props) {
  const tDialog = useTranslations('workflow.dialog');
  const tActions = useTranslations('workflow.actions');
  const tErrors = useTranslations('errorCodes');
  const tCommon = useTranslations('common');
  const showToast = useToastStore((s) => s.show);

  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setComment('');
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await workflowTaskApi.approve(taskId, comment.trim() || undefined);
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
          <DialogTitle>{tDialog('approveTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="approve-comment">{tDialog('commentOptional')}</Label>
          <Textarea
            id="approve-comment"
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            autoFocus
            disabled={submitting}
          />
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
            disabled={submitting}
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
