import { cn } from '@/lib/utils';

export type TreeSlot = 'vertical' | 'empty' | 'tee' | 'ell';

export interface OrgTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  isGroup?: boolean;
}

export interface OrgRow<T extends OrgTreeNode> {
  org: T;
  depth: number;
  slots: TreeSlot[]; // length === depth
}

export function buildTreeRows<T extends OrgTreeNode>(orgs: T[]): OrgRow<T>[] {
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const byParent = new Map<string | null, T[]>();
  for (const o of orgs) {
    const key = o.parentId && byId.has(o.parentId) ? o.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(o);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const rows: OrgRow<T>[] = [];
  function walk(parentId: string | null, ancestorHasNext: boolean[]) {
    const children = byParent.get(parentId) ?? [];
    children.forEach((child, idx) => {
      const isLast = idx === children.length - 1;
      const depth = ancestorHasNext.length + (parentId === null ? 0 : 1);
      const slots: TreeSlot[] = [];
      if (parentId !== null) {
        for (const hasNext of ancestorHasNext) {
          slots.push(hasNext ? 'vertical' : 'empty');
        }
        slots.push(isLast ? 'ell' : 'tee');
      }
      rows.push({ org: child, depth, slots });
      walk(child.id, parentId === null ? [] : [...ancestorHasNext, !isLast]);
    });
  }
  walk(null, []);
  return rows;
}

export function TreeConnector({ slot, className }: { slot: TreeSlot; className?: string }) {
  return (
    <span className={cn('relative w-4 shrink-0 self-stretch', className)}>
      {slot === 'vertical' && (
        <span className="absolute left-[7px] top-0 bottom-0 border-l border-border/70" />
      )}
      {slot === 'tee' && (
        <>
          <span className="absolute left-[7px] top-0 bottom-0 border-l border-border/70" />
          <span className="absolute left-[7px] top-1/2 w-[9px] border-t border-border/70" />
        </>
      )}
      {slot === 'ell' && (
        <>
          <span className="absolute left-[7px] top-0 h-1/2 border-l border-border/70" />
          <span className="absolute left-[7px] top-1/2 w-[9px] border-t border-border/70" />
        </>
      )}
    </span>
  );
}
