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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { workflowApi } from '@/lib/api/workflow';
import { getApiErrorMessage } from '@/lib/utils';
import { useToastStore } from '@/stores/toast-store';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appCode: string;
  modelCode: string;
  onCreated: () => void;
}

export function CreateWorkflowDialog({
  open,
  onOpenChange,
  appCode,
  modelCode,
  onCreated,
}: Props) {
  const t = useTranslations('workflow');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errorCodes');
  const showToast = useToastStore((s) => s.show);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await workflowApi.create(appCode, modelCode, {
        name: trimmed,
        description: description.trim() || undefined,
      });
      showToast(tCommon('operationSuccess'), 'success');
      onCreated();
    } catch (err) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('list.createTitle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wf-name">
              {t('fields.name')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="wf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={100}
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wf-desc">{t('fields.description')}</Label>
            <Textarea
              id="wf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
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
              type="submit"
              disabled={submitting || !name.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium h-9 px-4 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {tCommon('create')}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
