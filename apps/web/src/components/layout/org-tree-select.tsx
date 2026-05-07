'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildTreeRows, TreeConnector, type OrgTreeNode } from './org-tree';

interface OrgTreeSelectProps<T extends OrgTreeNode> {
  orgs: T[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  defaultOrgId: string | null;
  onDefaultOrgIdChange: (id: string | null) => void;
  emptyHint?: string;
  className?: string;
}

export function OrgTreeSelect<T extends OrgTreeNode>({
  orgs,
  selectedIds,
  onSelectedIdsChange,
  defaultOrgId,
  onDefaultOrgIdChange,
  emptyHint,
  className,
}: OrgTreeSelectProps<T>) {
  const t = useTranslations('user');
  const rows = useMemo(() => buildTreeRows(orgs), [orgs]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggle(org: OrgTreeNode) {
    if (org.isGroup) return;
    const nextSet = new Set(selectedSet);
    if (nextSet.has(org.id)) {
      nextSet.delete(org.id);
    } else {
      nextSet.add(org.id);
    }
    const next = Array.from(nextSet);
    onSelectedIdsChange(next);

    // Maintain invariant: defaultOrgId must be in the selected list.
    if (next.length === 0) {
      onDefaultOrgIdChange(null);
    } else if (!defaultOrgId || !nextSet.has(defaultOrgId)) {
      onDefaultOrgIdChange(next[0]);
    }
  }

  if (rows.length === 0) {
    return (
      <div className={cn('border border-input rounded-md p-3 bg-background text-xs text-muted-foreground', className)}>
        {emptyHint ?? t('noOrgsAvailable')}
      </div>
    );
  }

  return (
    <div className={cn('border border-input rounded-md bg-background max-h-56 overflow-y-auto', className)}>
      {rows.map(({ org, depth, slots }) => {
        const isGroup = !!org.isGroup;
        const isSelected = selectedSet.has(org.id);
        const isDefault = defaultOrgId === org.id;
        const isRoot = depth === 0;
        return (
          <div
            key={org.id}
            className={cn(
              'group flex items-stretch gap-2 px-2 py-1.5 text-sm transition-colors',
              isGroup ? 'bg-muted/20' : 'hover:bg-accent/50',
            )}
          >
            {slots.length > 0 && (
              <span className="flex self-stretch shrink-0" aria-hidden>
                {slots.map((slot, i) => (
                  <TreeConnector key={i} slot={slot} />
                ))}
              </span>
            )}
            <label
              className={cn(
                'flex-1 flex items-center gap-2 min-w-0 select-none',
                isGroup ? 'cursor-not-allowed' : 'cursor-pointer',
              )}
              title={isGroup ? t('groupNotSelectable') : undefined}
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={isGroup}
                onChange={() => toggle(org)}
                className="h-4 w-4 accent-primary rounded shrink-0 disabled:opacity-40"
              />
              <span
                className={cn(
                  'truncate',
                  isRoot && !isGroup && 'font-medium',
                  (isGroup || !isSelected) && 'text-muted-foreground',
                )}
              >
                {org.name}
              </span>
              {isGroup && (
                <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-700 ring-1 ring-slate-600/20 dark:bg-slate-500/10 dark:text-slate-300 px-1.5 py-0.5 text-[10px] font-medium tracking-wide shrink-0">
                  {t('nodeTypeGroup')}
                </span>
              )}
            </label>
            {!isGroup && (
              <button
                type="button"
                onClick={() => isSelected && onDefaultOrgIdChange(org.id)}
                disabled={!isSelected}
                title={
                  isDefault
                    ? t('currentDefaultOrg')
                    : isSelected
                      ? t('setAsDefaultOrg')
                      : t('selectFirstToSetDefault')
                }
                className={cn(
                  'shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors',
                  isDefault
                    ? 'text-amber-500'
                    : isSelected
                      ? 'text-muted-foreground/40 hover:text-amber-500 hover:bg-accent'
                      : 'text-muted-foreground/20 cursor-not-allowed',
                )}
                aria-pressed={isDefault}
              >
                <Star className={cn('w-3.5 h-3.5', isDefault && 'fill-current')} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
