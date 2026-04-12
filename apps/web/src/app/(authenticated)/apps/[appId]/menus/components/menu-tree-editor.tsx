'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Lock,
  ChevronRight,
  ChevronDown,
  Save,
  Folder,
  Link,
  LayoutGrid,
  Minus,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icon';
import type { AdminMenuNode } from '../page';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  tree: AdminMenuNode[];
  selected: AdminMenuNode | null;
  onSelect: (node: AdminMenuNode) => void;
  onDirty: (v: boolean) => void;
  onSaveReorder: (items: Array<{ id: string; parentId: string | null; sortOrder: number }>) => Promise<void>;
  saving: boolean;
  dirty: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Reorder two siblings in the tree (only within the same parent).
 */
function reorderSiblings(
  tree: AdminMenuNode[],
  activeId: string,
  overId: string,
): AdminMenuNode[] {
  function recurse(nodes: AdminMenuNode[]): AdminMenuNode[] {
    const idxA = nodes.findIndex((n) => n.id === activeId);
    const idxO = nodes.findIndex((n) => n.id === overId);
    if (idxA >= 0 && idxO >= 0) {
      const next = [...nodes];
      const [moved] = next.splice(idxA, 1);
      next.splice(idxO, 0, moved);
      return next.map((n, i) => ({ ...n, sortOrder: (i + 1) * 10 }));
    }
    return nodes.map((n) => ({ ...n, children: recurse(n.children) }));
  }
  return recurse(tree);
}

/**
 * Flatten the tree for the save API.
 */
function flattenForSave(
  nodes: AdminMenuNode[],
  parentId: string | null = null,
  out: Array<{ id: string; parentId: string | null; sortOrder: number }> = [],
): Array<{ id: string; parentId: string | null; sortOrder: number }> {
  for (const n of nodes) {
    out.push({ id: n.id, parentId, sortOrder: n.sortOrder });
    if (n.children?.length) flattenForSave(n.children, n.id, out);
  }
  return out;
}

/**
 * Return icon for a menu type when no custom icon is set.
 */
function DefaultTypeIcon({ type, className }: { type: AdminMenuNode['type']; className?: string }) {
  switch (type) {
    case 'group':
      return <Folder className={cn('w-4 h-4', className)} />;
    case 'model':
      return <LayoutGrid className={cn('w-4 h-4', className)} />;
    case 'link':
      return <Link className={cn('w-4 h-4', className)} />;
    case 'divider':
      return <Minus className={cn('w-4 h-4', className)} />;
    case 'page':
      return <FileText className={cn('w-4 h-4', className)} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  TreeNodeRow -- single draggable row                                */
/* ------------------------------------------------------------------ */

function TreeNodeRow({
  node,
  depth,
  expanded,
  selected,
  onToggleExpand,
  onSelect,
}: {
  node: AdminMenuNode;
  depth: number;
  expanded: boolean;
  selected: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
}) {
  const isCoded = node.source === 'coded';
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isDivider = node.type === 'divider';

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: node.id,
    disabled: isCoded,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const indentPx = depth * 20 + 8;

  if (isDivider) {
    return (
      <div
        ref={setNodeRef}
        style={{ ...style, paddingLeft: indentPx }}
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 cursor-pointer select-none',
          selected ? 'bg-primary/10' : 'hover:bg-muted/40',
        )}
        onClick={onSelect}
      >
        {!isCoded && (
          <span
            className="text-muted-foreground cursor-grab shrink-0"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}
        <Minus className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground flex-1">分割线</span>
        {isCoded && <Lock className="w-3 h-3 text-muted-foreground/60 shrink-0" />}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, paddingLeft: indentPx }}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none rounded-sm',
        selected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/40',
      )}
      onClick={onSelect}
    >
      {/* Drag handle -- only for non-coded nodes */}
      {!isCoded ? (
        <span
          className="text-muted-foreground cursor-grab shrink-0"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </span>
      ) : (
        <span className="w-3.5 shrink-0" />
      )}

      {/* Expand / collapse toggle */}
      {hasChildren ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>
      ) : (
        <span className="w-3.5 shrink-0" />
      )}

      {/* Icon */}
      <span className={cn('shrink-0', selected ? 'text-primary' : 'text-muted-foreground')}>
        {node.icon ? (
          <Icon name={node.icon} className="w-4 h-4" />
        ) : (
          <DefaultTypeIcon type={node.type} />
        )}
      </span>

      {/* Name */}
      <span
        className={cn(
          'flex-1 text-sm truncate',
          !node.visible && 'opacity-50',
        )}
      >
        {node.name}
        {!node.visible && (
          <span className="ml-1 text-xs text-muted-foreground">(隐藏)</span>
        )}
      </span>

      {/* Lock icon for coded */}
      {isCoded && <Lock className="w-3 h-3 text-muted-foreground/60 shrink-0" />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TreeNodes -- renders a sibling group with SortableContext           */
/* ------------------------------------------------------------------ */

function TreeNodes({
  nodes,
  depth,
  expanded,
  selected,
  onToggleExpand,
  onSelect,
}: {
  nodes: AdminMenuNode[];
  depth: number;
  expanded: Set<string>;
  selected: AdminMenuNode | null;
  onToggleExpand: (id: string) => void;
  onSelect: (node: AdminMenuNode) => void;
}) {
  return (
    <SortableContext
      items={nodes.map((n) => n.id)}
      strategy={verticalListSortingStrategy}
    >
      {nodes.map((node) => (
        <div key={node.id}>
          <TreeNodeRow
            node={node}
            depth={depth}
            expanded={expanded.has(node.id)}
            selected={selected?.id === node.id}
            onToggleExpand={() => onToggleExpand(node.id)}
            onSelect={() => onSelect(node)}
          />
          {/* Render children when expanded */}
          {(node.children?.length ?? 0) > 0 && expanded.has(node.id) && (
            <TreeNodes
              nodes={node.children}
              depth={depth + 1}
              expanded={expanded}
              selected={selected}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
            />
          )}
        </div>
      ))}
    </SortableContext>
  );
}

/* ------------------------------------------------------------------ */
/*  MenuTreeEditor (main export)                                       */
/* ------------------------------------------------------------------ */

export function MenuTreeEditor({
  tree,
  selected,
  onSelect,
  onDirty,
  onSaveReorder,
  saving,
  dirty,
}: Props) {
  // Local copy for pending drag changes
  const [localTree, setLocalTree] = useState<AdminMenuNode[]>(tree);

  // Expand all group-type root nodes by default
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    for (const node of tree) {
      if (node.type === 'group' || node.children?.length) ids.add(node.id);
    }
    return ids;
  });

  // Sync localTree when tree prop changes (after save + reload),
  // but only when NOT dirty (pending edits should survive in-memory)
  useEffect(() => {
    if (!dirty) {
      setLocalTree(tree);
      // Expand new group nodes
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const node of tree) {
          if (node.type === 'group' || node.children?.length) next.add(node.id);
        }
        return next;
      });
    }
  }, [tree, dirty]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleToggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const newTree = reorderSiblings(
        localTree,
        String(active.id),
        String(over.id),
      );
      setLocalTree(newTree);
      onDirty(true);
    },
    [localTree, onDirty],
  );

  const handleSave = useCallback(async () => {
    const items = flattenForSave(localTree);
    await onSaveReorder(items);
  }, [localTree, onSaveReorder]);

  return (
    <div className="flex flex-col border border-border rounded-lg overflow-hidden min-h-0">
      {/* Dirty state banner */}
      {dirty && (
        <div className="flex items-center justify-between px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900 shrink-0">
          <span className="text-xs text-amber-900 dark:text-amber-200">
            有未保存的调整 -- 拖拽只调整顺序，跨层级父子关系请在属性面板修改
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded text-xs disabled:opacity-50"
          >
            <Save className="w-3 h-3" />
            {saving ? '保存中...' : '保存调整'}
          </button>
        </div>
      )}

      {/* Tree content */}
      <div className="flex-1 overflow-auto p-2">
        {localTree.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            暂无菜单，点击右上角新建
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <TreeNodes
              nodes={localTree}
              depth={0}
              expanded={expanded}
              selected={selected}
              onToggleExpand={handleToggleExpand}
              onSelect={onSelect}
            />
          </DndContext>
        )}
      </div>

      {/* Footer: save button also accessible here when dirty */}
      {dirty && (
        <div className="shrink-0 border-t border-border px-3 py-2 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? '保存中...' : '保存调整'}
          </button>
        </div>
      )}
    </div>
  );
}
