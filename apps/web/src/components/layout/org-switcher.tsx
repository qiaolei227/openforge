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
import { useOrgStore, type Org } from '@/stores/org-store';
import { useTabStore } from '@/stores/tab-store';
import { cn } from '@/lib/utils';

function computeDepthMap(orgs: Org[]): Map<string, number> {
  const map = new Map<string, number>();
  const byId = new Map(orgs.map((o) => [o.id, o]));
  for (const o of orgs) {
    let depth = 0;
    let cur: Org | undefined = o;
    const guard = new Set<string>();
    while (cur?.parentId) {
      if (guard.has(cur.id)) break; // cycle safety
      guard.add(cur.id);
      const parent = byId.get(cur.parentId);
      if (!parent) break;
      depth++;
      cur = parent;
    }
    map.set(o.id, depth);
  }
  return map;
}

function sortForTreeDisplay(orgs: Org[]): Org[] {
  const byParent = new Map<string | null, Org[]>();
  for (const o of orgs) {
    const key = o.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(o);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  const result: Org[] = [];
  function walk(parentId: string | null) {
    const children = byParent.get(parentId) ?? [];
    for (const c of children) {
      result.push(c);
      walk(c.id);
    }
  }
  walk(null);
  // Include any orphans (parentId points to something not in accessibleOrgs)
  for (const o of orgs) {
    if (!result.includes(o)) result.push(o);
  }
  return result;
}

export function OrgSwitcher() {
  const t = useTranslations('orgSwitcher');
  const accessibleOrgs = useOrgStore((s) => s.accessibleOrgs);
  const currentOrgId = useOrgStore((s) => s.currentOrgId);
  const setCurrentOrg = useOrgStore((s) => s.setCurrentOrg);
  const tabs = useTabStore((s) => s.tabs);
  const [pendingOrgId, setPendingOrgId] = useState<string | null>(null);

  const ordered = useMemo(() => sortForTreeDisplay(accessibleOrgs), [accessibleOrgs]);
  const depthMap = useMemo(() => computeDepthMap(accessibleOrgs), [accessibleOrgs]);
  const current = accessibleOrgs.find((o) => o.id === currentOrgId) ?? null;
  const dirtyTabs = tabs.filter((tab) => tab.dirty);

  if (accessibleOrgs.length < 2) return null;

  function onSelect(orgId: string) {
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
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t('title')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ordered.map((org) => {
              const depth = depthMap.get(org.id) ?? 0;
              const isRoot = org.parentId === null;
              const isCurrent = org.id === currentOrgId;
              return (
                <DropdownMenuItem
                  key={org.id}
                  onSelect={(e) => { e.preventDefault(); onSelect(org.id); }}
                  style={{ paddingLeft: `calc(0.5rem + ${depth * 1}rem)` }}
                  className={cn('flex items-center gap-2')}
                >
                  <span className="flex-1 flex items-center gap-2 min-w-0">
                    <span className="truncate">{org.name}</span>
                    {isRoot && (
                      <Badge
                        variant="secondary"
                        className="h-[18px] px-1.5 text-[10px] font-medium tracking-wider uppercase shrink-0"
                      >
                        {t('group')}
                      </Badge>
                    )}
                  </span>
                  {isCurrent && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
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
