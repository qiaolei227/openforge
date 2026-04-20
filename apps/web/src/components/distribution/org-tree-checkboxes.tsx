'use client';

import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

export interface OrgNode {
  id: string;
  name: string;
  parentId: string | null;
  code: string;
}

export type OrgCheckState = 'unchecked' | 'checked' | 'indeterminate';

interface TreeNode extends OrgNode {
  children: TreeNode[];
}

interface Props {
  orgs: OrgNode[];
  rootOrgIds: Set<string>;
  statePerOrg: Record<string, OrgCheckState>;
  countPerOrg: Record<string, { allocated: number; total: number }>;
  onToggle: (orgId: string) => void;
}

function buildTree(flat: OrgNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  flat.forEach((o) => byId.set(o.id, { ...o, children: [] }));
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortByName = (arr: TreeNode[]) => arr.sort((a, b) => a.name.localeCompare(b.name));
  sortByName(roots);
  function walk(ns: TreeNode[]) {
    for (const n of ns) {
      sortByName(n.children);
      walk(n.children);
    }
  }
  walk(roots);
  return roots;
}

export function OrgTreeCheckboxes({ orgs, rootOrgIds, statePerOrg, countPerOrg, onToggle }: Props) {
  const t = useTranslations('distribute');
  const tree = useMemo(() => buildTree(orgs), [orgs]);
  return (
    <div className="text-sm max-h-[340px] overflow-y-auto border rounded-md bg-background">
      {tree.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          depth={0}
          rootOrgIds={rootOrgIds}
          statePerOrg={statePerOrg}
          countPerOrg={countPerOrg}
          onToggle={onToggle}
          t={t}
        />
      ))}
    </div>
  );
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  rootOrgIds: Set<string>;
  statePerOrg: Record<string, OrgCheckState>;
  countPerOrg: Record<string, { allocated: number; total: number }>;
  onToggle: (orgId: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, values?: Record<string, string | number>) => string;
}

function TreeRow({ node, depth, rootOrgIds, statePerOrg, countPerOrg, onToggle, t }: TreeRowProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isRoot = rootOrgIds.has(node.id);
  const state: OrgCheckState = statePerOrg[node.id] ?? 'unchecked';
  const count = countPerOrg[node.id];
  const totalN = count?.total ?? 0;
  return (
    <>
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 pr-2 hover:bg-accent/40 transition-colors',
          isRoot && 'opacity-60',
        )}
        style={{ paddingLeft: `calc(0.5rem + ${depth * 1.25}rem)` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="p-0.5 hover:bg-accent rounded"
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronRight
              className={cn('w-3.5 h-3.5 transition-transform', expanded && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <Checkbox
          checked={state === 'checked'}
          indeterminate={state === 'indeterminate'}
          disabled={isRoot}
          onCheckedChange={() => {
            if (!isRoot) onToggle(node.id);
          }}
        />
        <span className="flex-1 flex items-center gap-1.5 min-w-0">
          <span className="truncate">{node.name}</span>
          {isRoot && (
            <Badge
              variant="secondary"
              className="h-[18px] px-1.5 text-[10px] font-medium tracking-wider uppercase shrink-0"
            >
              {t('group')}
            </Badge>
          )}
        </span>
        {!isRoot && count && count.allocated > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">
            {t('allocatedCount', { allocated: count.allocated, total: totalN })}
          </span>
        )}
      </div>
      {hasChildren && expanded && node.children.map((c: TreeNode) => (
        <TreeRow
          key={c.id}
          node={c}
          depth={depth + 1}
          rootOrgIds={rootOrgIds}
          statePerOrg={statePerOrg}
          countPerOrg={countPerOrg}
          onToggle={onToggle}
          t={t}
        />
      ))}
    </>
  );
}
