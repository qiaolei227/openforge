'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { FilterGroup } from '@openforge/shared';

export interface FilterPreset {
  id: string;
  name: string;
  filter: FilterGroup;
}

interface FilterPresetsProps {
  presets: FilterPreset[];
  currentFilter: FilterGroup;
  onLoad: (filter: FilterGroup) => void;
  onSave: (preset: FilterPreset) => void;
  onDelete: (presetId: string) => void;
}

/**
 * Inline "Save current filter" button — opens a name input popover.
 * Preset tabs are rendered directly in RecordBrowser's tab row.
 */
export function FilterPresets({ currentFilter, onSave }: FilterPresetsProps) {
  const t = useTranslations('workspace');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const handleSave = useCallback(() => {
    if (!name.trim()) return;
    onSave({
      id: crypto.randomUUID(),
      name: name.trim(),
      filter: currentFilter,
    });
    setName('');
    setOpen(false);
  }, [name, currentFilter, onSave]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-md border border-dashed border-input text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title={t('filterPresets.saveCurrent')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
        {t('filterPresets.saveCurrent')}
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="text"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') { setOpen(false); setName(''); }
        }}
        placeholder={t('filterPresets.namePlaceholder')}
        className="h-7 w-32 rounded-md border border-input bg-background px-2 text-xs"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={!name.trim()}
        className="h-7 rounded-md bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {t('filterPresets.save')}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setName(''); }}
        className="h-7 rounded-md border border-input bg-background px-2 text-xs hover:bg-muted"
      >
        {t('columnSettings.cancel')}
      </button>
    </div>
  );
}
