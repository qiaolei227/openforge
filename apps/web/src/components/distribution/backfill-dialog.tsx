'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToastStore } from '@/stores/toast-store';
import {
  getDistributionPolicy,
  syncMaster,
  SYNC_PHRASES,
  type DistributionPolicyItem,
} from '@/lib/api/distribution';

interface Props {
  open: boolean;
  onClose: () => void;
  appCode: string;
  modelCode: string;
  recordId: string;
  modelId: string;
}

const PHRASE = SYNC_PHRASES.backfill;

export function BackfillDialog({
  open,
  onClose,
  appCode,
  modelCode,
  recordId,
  modelId,
}: Props) {
  const t = useTranslations('distribute');
  const showToast = useToastStore((s) => s.show);
  const [fields, setFields] = useState<DistributionPolicyItem[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [phrase, setPhrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setPicked(new Set());
    setPhrase('');
    // Backfill shows ALL policy items (not filtered by editable)
    getDistributionPolicy(modelId)
      .then((all) => setFields(all))
      .finally(() => setLoading(false));
  }, [open, modelId]);

  async function submit() {
    setSubmitting(true);
    try {
      const cols = fields.filter((f) => picked.has(f.fieldId)).map((f) => f.columnName);
      const res = await syncMaster(appCode, modelCode, recordId, {
        action: 'backfill',
        fieldColumns: cols,
        confirmationPhrase: phrase,
      });
      showToast(t('syncDone', { affected: res.affected, fieldCount: res.fieldCount }), 'success');
      onClose();
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? t('operationFailed'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('backfillTitle')}</DialogTitle>
          <DialogDescription>{t('backfillDesc')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : fields.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">{t('noEditableFields')}</div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
            {fields.map((f) => (
              <label
                key={f.fieldId}
                className="flex items-center gap-2 text-sm cursor-pointer py-1 px-1 hover:bg-accent/40 rounded"
              >
                <Checkbox
                  checked={picked.has(f.fieldId)}
                  onCheckedChange={(v) => {
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (v) next.add(f.fieldId);
                      else next.delete(f.fieldId);
                      return next;
                    });
                  }}
                />
                <span>{f.fieldName}</span>
                <span className="text-xs text-muted-foreground font-mono">{f.columnName}</span>
              </label>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm block">
            {t('typeToConfirm', { phrase: PHRASE })}
          </label>
          <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || phrase !== PHRASE || picked.size === 0}
            variant="destructive"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            {t('execute')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
