'use client';

import { useMemo, useState, useCallback } from 'react';
import type { TreeViewProps, TreeNode, TreeColumn } from './tree-view-types';

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function Loader2Icon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  isExpanded: boolean;
  isLoading: boolean;
  columns: TreeColumn[];
  onToggle: () => void;
  onClick?: () => void;
  isSelected: boolean;
  onSelect?: () => void;
  showCheckbox: boolean;
}

function TreeRow({ node, depth, isExpanded, isLoading, columns, onToggle, onClick, isSelected, onSelect, showCheckbox }: TreeRowProps) {
  return (
    <tr className={`border-b last:border-b-0 hover:bg-muted/30${onClick ? ' cursor-pointer' : ''}`} onClick={onClick}>
      {showCheckbox && (
        <td className="w-10 px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={isSelected} onChange={onSelect} className="h-4 w-4 rounded border-gray-300" />
        </td>
      )}
      {columns.map((col, colIdx) => (
        <td key={col.key} className="px-3 py-2 text-sm">
          <div className="flex items-center" style={colIdx === 0 ? { paddingLeft: `${depth * 24}px` } : undefined}>
            {colIdx === 0 && (
              <span className="mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
                {isLoading ? <Loader2Icon /> : node.__hasChildren ? (
                  <ChevronRightIcon className={`transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
                ) : <span className="w-4" />}
              </span>
            )}
            <span className="truncate">{col.render ? col.render(node[col.key], node) : (node[col.key] ?? '')}</span>
          </div>
        </td>
      ))}
    </tr>
  );
}

export function TreeView({ nodes, columns, loading, expandedIds, onExpand, onCollapse, onRowClick, selectedIds, onSelect, onSelectAll, t }: TreeViewProps) {
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const handleToggle = useCallback((node: TreeNode) => {
    if (expandedIds.has(node.id)) {
      onCollapse(node.id);
    } else {
      setLoadingIds((prev) => new Set(prev).add(node.id));
      onExpand(node.id);
      setTimeout(() => setLoadingIds((prev) => { const n = new Set(prev); n.delete(node.id); return n; }), 2000);
    }
  }, [expandedIds, onExpand, onCollapse]);

  const visibleRows = useMemo(() => {
    const rows: Array<{ node: TreeNode; depth: number }> = [];
    const byParent = new Map<string | 'root', TreeNode[]>();
    for (const n of nodes) {
      const key = n.parent_id ?? 'root';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(n);
    }
    function walk(parentKey: string | 'root', depth: number) {
      for (const child of byParent.get(parentKey) ?? []) {
        rows.push({ node: child, depth });
        if (expandedIds.has(child.id)) walk(child.id, depth + 1);
      }
    }
    walk('root', 0);
    return rows;
  }, [nodes, expandedIds]);

  const showCheckbox = !!onSelect;

  if (loading && nodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2Icon /><span className="ml-2 text-sm text-muted-foreground">{t('common.loading')}</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {showCheckbox && (
              <th className="w-10 px-2 py-2 text-center">
                <input type="checkbox" checked={selectedIds ? selectedIds.size > 0 && selectedIds.size === visibleRows.length : false} onChange={onSelectAll} className="h-4 w-4 rounded border-gray-300" />
              </th>
            )}
            {columns.map((col) => (
              <th key={col.key} className="px-3 py-2 text-left font-medium text-muted-foreground" style={col.width ? { width: col.width } : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map(({ node, depth }) => (
            <TreeRow key={node.id} node={node} depth={depth} isExpanded={expandedIds.has(node.id)} isLoading={loadingIds.has(node.id)} columns={columns} onToggle={() => handleToggle(node)} onClick={onRowClick ? () => onRowClick(node) : undefined} isSelected={selectedIds?.has(node.id) ?? false} onSelect={() => onSelect?.(node.id)} showCheckbox={showCheckbox} />
          ))}
          {visibleRows.length === 0 && (
            <tr><td colSpan={columns.length + (showCheckbox ? 1 : 0)} className="px-4 py-8 text-center text-muted-foreground">{t('common.noData')}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
