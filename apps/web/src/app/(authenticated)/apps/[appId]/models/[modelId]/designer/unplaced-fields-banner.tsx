'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Info, X } from 'lucide-react';
import type { Field, LayoutNode, LayoutConfig } from '@openforge/shared';

interface UnplacedFieldsBannerProps {
  fields: Field[];
  layout: LayoutConfig;
  onAddAll: (unplacedFieldIds: string[]) => void;
}

/** Collect all fieldIds referenced in the layout tree */
function collectPlacedFieldIds(nodes: LayoutNode[]): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (node.props?.fieldId) ids.add(node.props.fieldId);
    if (node.children) {
      for (const id of collectPlacedFieldIds(node.children)) {
        ids.add(id);
      }
    }
  }
  return ids;
}

export function UnplacedFieldsBanner({ fields, layout, onAddAll }: UnplacedFieldsBannerProps) {
  const t = useTranslations('designer');
  const [dismissed, setDismissed] = useState(false);

  const placedIds = useMemo(() => collectPlacedFieldIds(layout.children), [layout]);

  const unplacedFields = useMemo(
    () =>
      fields.filter(
        (f) => !f.isSystem && !f.deletedAt && !f.entityId && !placedIds.has(f.id),
      ),
    [fields, placedIds],
  );

  if (dismissed || unplacedFields.length === 0) return null;

  return (
    <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-4 flex items-center justify-between border-b border-blue-200 bg-blue-50 px-6 py-2.5 text-sm shadow-sm dark:border-blue-900 dark:bg-blue-950/95">
      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
        <Info className="h-4 w-4 shrink-0" />
        <span>{t('unplacedFields', { count: unplacedFields.length })}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onAddAll(unplacedFields.map((f) => f.id))}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
        >
          {t('addAllFields')}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="flex h-5 w-5 items-center justify-center rounded text-blue-400 hover:text-blue-600 dark:hover:text-blue-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
