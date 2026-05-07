'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, ChevronDown, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOrgStore } from '@/stores/org-store';
import { useTabStore } from '@/stores/tab-store';
import { cn } from '@/lib/utils';
import { buildTreeRows, TreeConnector } from './org-tree';

export function OrgSwitcher() {
  const t = useTranslations('orgSwitcher');
  const accessibleOrgs = useOrgStore((s) => s.accessibleOrgs);
  const currentOrgId = useOrgStore((s) => s.currentOrgId);
  const setCurrentOrg = useOrgStore((s) => s.setCurrentOrg);
  const tabs = useTabStore((s) => s.tabs);
  const [pendingOrgId, setPendingOrgId] = useState<string | null>(null);

  const rows = useMemo(() => buildTreeRows(accessibleOrgs), [accessibleOrgs]);
  const current = accessibleOrgs.find((o) => o.id === currentOrgId) ?? null;
  const dirtyTabs = tabs.filter((tab) => tab.dirty);

  if (accessibleOrgs.length < 2) return null;

  function handleSelect(orgId: string) {
    if (orgId === currentOrgId) return;
    if (dirtyTabs.length > 0) {
      setPendingOrgId(orgId);
    } else {
      setCurrentOrg(orgId);
    }
  }

  function confirmSwitch() {
    if (pendingOrgId) setCurrentOrg(pendingOrgId);
    setPendingOrgId(null);
  }

  const displayedDirtyTitles = dirtyTabs.slice(0, 3).map((tab) => tab.title);
  const extraDirty = Math.max(0, dirtyTabs.length - displayedDirtyTitles.length);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md hover:bg-accent transition-colors">
          <Building2 className="w-4 h-4 opacity-80 shrink-0" />
          <span className="truncate max-w-[140px]">
            {current?.name ?? t('select')}
          </span>
          {current?.parentId === null && (
            <Badge
              variant="secondary"
              className="h-[18px] px-1.5 text-[10px] font-medium tracking-wider uppercase"
            >
              {t('group')}
            </Badge>
          )}
          <ChevronDown className="w-4 h-4 opacity-60 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t('title')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {rows.map(({ org, depth, slots }) => {
              const isRoot = depth === 0;
              const isGroupNode = !!org.isGroup;
              const isCurrent = org.id === currentOrgId;
              const connectorSlots = slots.length > 0 && (
                <span className="flex self-stretch shrink-0" aria-hidden>
                  {slots.map((slot, i) => (
                    <TreeConnector key={i} slot={slot} />
                  ))}
                </span>
              );
              if (isGroupNode) {
                return (
                  <div
                    key={org.id}
                    className="flex items-stretch gap-2 pl-1.5 py-1.5 text-sm cursor-default select-none"
                    title={t('nodeTypeGroupHint')}
                  >
                    {connectorSlots}
                    <span className="flex-1 flex items-center gap-2 min-w-0">
                      <span className="truncate text-muted-foreground/80 italic">{org.name}</span>
                      <Badge
                        variant="secondary"
                        className="h-[18px] px-1.5 text-[10px] font-medium tracking-wide shrink-0"
                      >
                        {t('nodeTypeGroup')}
                      </Badge>
                    </span>
                  </div>
                );
              }
              return (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => handleSelect(org.id)}
                  className={cn(
                    'flex items-stretch gap-2 pl-1.5 py-1.5',
                    isRoot && 'mt-0.5 first:mt-0',
                  )}
                >
                  {connectorSlots}
                  <span className="flex-1 flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        'truncate',
                        isRoot && 'font-semibold',
                        !isRoot && 'text-muted-foreground',
                        isCurrent && 'text-foreground font-medium',
                      )}
                    >
                      {org.name}
                    </span>
                    {isRoot && (
                      <Badge
                        variant="secondary"
                        className="h-[18px] px-1.5 text-[10px] font-medium tracking-wider uppercase shrink-0"
                      >
                        {t('group')}
                      </Badge>
                    )}
                  </span>
                  {isCurrent && <Check className="w-3.5 h-3.5 text-primary shrink-0 self-center" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={pendingOrgId !== null}
        onOpenChange={(open) => { if (!open) setPendingOrgId(null); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('confirmDirtyTitle')}</DialogTitle>
            <DialogDescription>
              {t('confirmDirtyDesc', { count: dirtyTabs.length })}
            </DialogDescription>
          </DialogHeader>
          {displayedDirtyTitles.length > 0 && (
            <ul className="text-sm space-y-1 pl-4 list-disc text-muted-foreground">
              {displayedDirtyTitles.map((title, i) => (
                <li key={i} className="truncate">{title}</li>
              ))}
              {extraDirty > 0 && (
                <li className="list-none">{t('moreDirty', { count: extraDirty })}</li>
              )}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingOrgId(null)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmSwitch}>
              {t('confirmSwitch')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
