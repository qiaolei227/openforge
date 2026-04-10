'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { TreeSelectProps } from './tree-view-types';

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

interface InternalNode {
  id: string;
  parentId: string | null;
  label: string;
  children: InternalNode[];
}

function buildTree(nodes: TreeSelectProps['nodes'], excludeId?: string): InternalNode[] {
  // Collect IDs to exclude (the excludeId and all its descendants)
  const excludeIds = new Set<string>();
  if (excludeId) {
    excludeIds.add(excludeId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of nodes) {
        if (n.parentId && excludeIds.has(n.parentId) && !excludeIds.has(n.id)) {
          excludeIds.add(n.id);
          changed = true;
        }
      }
    }
  }

  const filtered = nodes.filter((n) => !excludeIds.has(n.id));
  const byParent = new Map<string | null, typeof filtered>();
  for (const n of filtered) {
    const key = n.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(n);
  }
  function build(parentId: string | null): InternalNode[] {
    return (byParent.get(parentId) ?? []).map((n) => ({ ...n, children: build(n.id) }));
  }
  return build(null);
}

function TreeOption({ node, depth, selectedId, onSelect, expandedIds, onToggle }: {
  node: InternalNode; depth: number; selectedId: string | null;
  onSelect: (id: string) => void; expandedIds: Set<string>; onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  return (
    <>
      <div
        className={`flex items-center px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent ${node.id === selectedId ? 'bg-accent' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <span className="mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center" onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}>
            <ChevronRightIcon className={`transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
          </span>
        ) : <span className="mr-1 w-4 shrink-0" />}
        <span className="text-sm truncate">{node.label}</span>
      </div>
      {hasChildren && isExpanded && node.children.map((child) => (
        <TreeOption key={child.id} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} expandedIds={expandedIds} onToggle={onToggle} />
      ))}
    </>
  );
}

export function TreeSelect({ value, onChange, nodes, excludeId, placeholder, disabled }: TreeSelectProps) {
  const [open, setOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => buildTree(nodes, excludeId), [nodes, excludeId]);
  const selectedLabel = useMemo(() => nodes.find((n) => n.id === value)?.label, [nodes, value]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const handleSelect = useCallback((id: string) => {
    onChange(id);
    setOpen(false);
  }, [onChange]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm disabled:opacity-50"
        onClick={() => setOpen(!open)}
      >
        <span className={`truncate ${selectedLabel ? '' : 'text-muted-foreground'}`}>
          {selectedLabel ?? placeholder ?? '...'}
        </span>
        <span className="flex items-center gap-1">
          {value && !disabled && (
            <span className="cursor-pointer hover:text-destructive" onClick={(e) => { e.stopPropagation(); onChange(null); }}>
              <XIcon />
            </span>
          )}
          <ChevronDownIcon />
        </span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md max-h-60 overflow-auto">
          {tree.length === 0 && <div className="px-2 py-4 text-center text-sm text-muted-foreground">-</div>}
          {tree.map((node) => (
            <TreeOption key={node.id} node={node} depth={0} selectedId={value} onSelect={handleSelect} expandedIds={expandedIds} onToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  );
}
