'use client';

import * as LucideIcons from 'lucide-react';
import { RefreshCw, List } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { SysAction } from '@openforge/shared';
import { cn } from '@/lib/utils';
import { SplitButton, MenuButton } from './split-button';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface ActionToolbarProps {
  actions: SysAction[];
  selectedRecords: Array<Record<string, any>>;
  enableDataStatus: boolean;
  position: 'list' | 'detail';
  currentRecord?: Record<string, any>;
  currentUserId?: string;
  onAction: (actionCode: string, records: Array<Record<string, any>>) => void;
  onRefresh?: () => void;
  /** Navigate back to list view (rendered as icon button next to refresh) */
  onNavigateToList?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Icon resolution                                                     */
/* ------------------------------------------------------------------ */

/**
 * Convert kebab-case lucide icon name (e.g. "trash-2") to PascalCase
 * component name (e.g. "Trash2"), then look it up in lucide-react exports.
 */
function resolveIcon(iconName: string | null, className?: string): React.ReactNode | null {
  if (!iconName) return null;
  const pascalName = iconName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const IconComp = (LucideIcons as Record<string, any>)[pascalName];
  if (!IconComp) return null;
  return <IconComp className={cn('w-4 h-4', className)} />;
}

/* ------------------------------------------------------------------ */
/*  Enable logic                                                        */
/* ------------------------------------------------------------------ */

/** Hardcoded data_status → allowed action codes mapping (matches data-status.service.ts TRANSITIONS) */
const STATUS_ACTION_MAP: Record<string, string[]> = {
  draft:     ['submit'],
  reaudit:   ['submit'],
  submitted: ['withdraw', 'approve'],
  approved:  ['unapprove'],
};

const DATA_STATUS_ACTIONS = new Set(['submit', 'withdraw', 'approve', 'unapprove']);

function isActionEnabled(
  action: SysAction,
  selectedRecords: Array<Record<string, any>>,
  position: 'list' | 'detail',
  currentRecord?: Record<string, any>,
  currentUserId?: string,
): boolean {
  // create is always enabled
  if (action.code === 'create') return true;

  // Determine the effective record set
  const records =
    position === 'detail' && currentRecord ? [currentRecord] : selectedRecords;

  // Other actions need at least one record
  if (records.length === 0) return false;

  // Edit: only allowed when all selected are draft/reaudit (single-record operation)
  if (action.code === 'edit') {
    const hasNonDraft = records.some((r) => {
      const status = r['data_status'];
      return status && status !== 'draft' && status !== 'reaudit';
    });
    if (hasNonDraft) return false;
  }

  // Delete/archive: at least one draft/reaudit record
  if (['delete', 'archive'].includes(action.code)) {
    const hasDraft = records.some((r) => {
      const status = r['data_status'];
      return !status || status === 'draft' || status === 'reaudit';
    });
    if (!hasDraft) return false;
  }

  // Data status actions (submit/approve/withdraw/unapprove):
  // enabled when at least one record matches the status→action mapping
  // (further filtering like withdraw's submitter check happens at execution time)
  if (DATA_STATUS_ACTIONS.has(action.code)) {
    const hasMatch = records.some((r) => {
      const status = r['data_status'] as string;
      return status && STATUS_ACTION_MAP[status]?.includes(action.code);
    });
    if (!hasMatch) return false;
  }

  return true;
}

/* ------------------------------------------------------------------ */
/*  Single action button                                                */
/* ------------------------------------------------------------------ */

interface ActionButtonProps {
  action: SysAction;
  enabled: boolean;
  isPrimary: boolean;
  isDestructive: boolean;
  onAction: (actionCode: string) => void;
  selectedRecords: Array<Record<string, any>>;
  position: 'list' | 'detail';
  currentRecord?: Record<string, any>;
  currentUserId?: string;
}

function ActionButton({ action, enabled, isPrimary, isDestructive, onAction, selectedRecords, position, currentRecord, currentUserId }: ActionButtonProps) {
  const icon = resolveIcon(action.icon);
  const variant: 'default' | 'destructive' = isDestructive ? 'destructive' : 'default';

  if (action.displayType === 'split' && action.children?.length) {
    return (
      <SplitButton
        label={action.name}
        icon={icon}
        onClick={() => onAction(action.code)}
        disabled={!enabled}
        variant={variant}
        items={action.children.map((child) => ({
          label: child.name,
          icon: resolveIcon(child.icon) ?? undefined,
          onClick: () => onAction(child.code),
          disabled: !isActionEnabled(child, selectedRecords, position, currentRecord, currentUserId),
        }))}
      />
    );
  }

  if (action.displayType === 'menu' && action.children?.length) {
    return (
      <MenuButton
        label={action.name}
        icon={icon}
        disabled={!enabled}
        variant={variant}
        items={action.children.map((child) => ({
          label: child.name,
          icon: resolveIcon(child.icon) ?? undefined,
          onClick: () => onAction(child.code),
          disabled: !isActionEnabled(child, selectedRecords, position, currentRecord, currentUserId),
        }))}
      />
    );
  }

  // Default: plain button
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={() => onAction(action.code)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isPrimary &&
          'bg-primary text-primary-foreground border-primary hover:bg-primary/90',
        !isPrimary &&
          isDestructive &&
          'text-destructive border-destructive/30 hover:bg-destructive/10',
        !isPrimary &&
          !isDestructive &&
          'border-border hover:bg-accent hover:text-accent-foreground',
        !enabled && 'opacity-40 cursor-not-allowed pointer-events-none',
      )}
    >
      {icon && <span className="w-4 h-4 flex-shrink-0">{icon}</span>}
      {action.name}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  ActionToolbar                                                       */
/* ------------------------------------------------------------------ */

export function ActionToolbar({
  actions,
  selectedRecords,
  enableDataStatus,
  position,
  currentRecord,
  currentUserId,
  onAction,
  onRefresh,
  onNavigateToList,
}: ActionToolbarProps) {
  const t = useTranslations('workspace');

  // Filter by position
  const visibleActions = actions.filter(
    (a) => a.position === position || a.position === 'both',
  );

  const handleAction = (actionCode: string) => {
    const records =
      position === 'detail' && currentRecord ? [currentRecord] : selectedRecords;
    onAction(actionCode, records);
  };

  const renderAction = (action: SysAction) => {
    const enabled = isActionEnabled(
      action,
      selectedRecords,
      position,
      currentRecord,
      currentUserId,
    );
    const isPrimary = action.code === 'create';
    const isDestructive = action.code === 'delete';

    return (
      <ActionButton
        key={action.id}
        action={action}
        enabled={enabled}
        isPrimary={isPrimary}
        isDestructive={isDestructive}
        onAction={handleAction}
        selectedRecords={selectedRecords}
        position={position}
        currentRecord={currentRecord}
        currentUserId={currentUserId}
      />
    );
  };

  if (visibleActions.length === 0 && !onRefresh && !onNavigateToList) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {visibleActions.map(renderAction)}

      {/* Spacer pushes refresh button to the right */}
      <div className="flex-1" />

      {/* Back to list */}
      {onNavigateToList && (
        <button
          type="button"
          onClick={onNavigateToList}
          title={t('backToList')}
          className={cn(
            'inline-flex items-center justify-center w-8 h-8 rounded-md border border-border',
            'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          aria-label={t('backToList')}
        >
          <List className="w-4 h-4" />
        </button>
      )}

      {/* Refresh */}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          title={t('refresh')}
          className={cn(
            'inline-flex items-center justify-center w-8 h-8 rounded-md border border-border',
            'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          aria-label={t('refresh')}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
