'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SysView, LayoutConfig } from '@openforge/shared';

interface CreateViewDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; type: 'form' | 'list'; layout: LayoutConfig }) => Promise<void>;
  views: SysView[];
  /** Pre-fill the type when opened from empty state card */
  defaultType?: 'form' | 'list';
}

export function CreateViewDialog({
  open,
  onClose,
  onSubmit,
  views,
  defaultType,
}: CreateViewDialogProps) {
  const t = useTranslations('designer');
  const tc = useTranslations('common');

  const [type, setType] = useState<'form' | 'list'>(defaultType ?? 'form');
  const [name, setName] = useState('');
  const [basedOn, setBasedOn] = useState<string>('__blank__');
  const [submitting, setSubmitting] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setType(defaultType ?? 'form');
      setName('');
      setBasedOn('__blank__');
      setSubmitting(false);
    }
  }, [open, defaultType]);

  // Filter views by current type for "based on" dropdown
  const sameTypeViews = views.filter((v) => v.type === type);

  const emptyLayout = (viewType: 'form' | 'list'): LayoutConfig => ({
    type: viewType === 'form' ? 'Form' : 'List',
    children: [],
  });

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      let layout: LayoutConfig;
      if (basedOn && basedOn !== '__blank__') {
        const sourceView = views.find((v) => v.id === basedOn);
        layout = sourceView
          ? JSON.parse(JSON.stringify(sourceView.layout))
          : emptyLayout(type);
      } else {
        layout = emptyLayout(type);
      }
      await onSubmit({ name: name.trim(), type, layout });
      onClose();
    } catch {
      // Error handled by parent
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('newView')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* View Type */}
          <div className="space-y-2">
            <Label>{t('viewType')}</Label>
            <div className="flex gap-2">
              <button
                onClick={() => { setType('form'); setBasedOn('__blank__'); }}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  type === 'form'
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                }`}
              >
                {t('formView')}
              </button>
              <button
                onClick={() => { setType('list'); setBasedOn('__blank__'); }}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  type === 'list'
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                }`}
              >
                {t('listView')}
              </button>
            </div>
          </div>

          {/* View Name */}
          <div className="space-y-2">
            <Label>{t('viewName')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('viewNamePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
          </div>

          {/* Based On */}
          {sameTypeViews.length > 0 && (
            <div className="space-y-2">
              <Label>{t('basedOn')}</Label>
              <Select value={basedOn} onValueChange={(val) => setBasedOn(val as string)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('basedOnEmpty')}>
                    {basedOn === '__blank__' ? t('basedOnEmpty') : sameTypeViews.find((v) => v.id === basedOn)?.name ?? t('basedOnEmpty')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__blank__">{t('basedOnEmpty')}</SelectItem>
                  {sameTypeViews.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {tc('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || submitting}>
            {submitting ? tc('processing') : tc('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
