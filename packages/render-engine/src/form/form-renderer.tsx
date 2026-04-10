'use client';

import { useMemo } from 'react';
import type { LayoutConfig, LayoutNode } from '@openforge/shared';
import { GridSection } from './grid-section';
import { SubTableSection } from './sub-table-section';
import { FieldNode } from './field-node';

interface FormRendererProps {
  layout: LayoutConfig;
  className?: string;
}

function groupNodes(children: LayoutNode[]) {
  const groups: Array<{ type: 'grid' | 'subtable' | 'virtual-grid'; nodes: LayoutNode[] }> = [];

  for (const node of children) {
    if (node.type === 'Grid') {
      groups.push({ type: 'grid', nodes: [node] });
    } else if (node.type === 'SubTable') {
      groups.push({ type: 'subtable', nodes: [node] });
    } else {
      const last = groups[groups.length - 1];
      if (last?.type === 'virtual-grid') {
        last.nodes.push(node);
      } else {
        groups.push({ type: 'virtual-grid', nodes: [node] });
      }
    }
  }

  return groups;
}

export function FormRenderer({ layout, className }: FormRendererProps) {
  const groups = useMemo(() => groupNodes(layout.children), [layout.children]);

  return (
    <div className={className ?? 'mx-auto max-w-4xl space-y-6 p-8'}>
      {groups.map((group, gi) => {
        if (group.type === 'grid') {
          return <GridSection key={group.nodes[0].id ?? gi} node={group.nodes[0]} />;
        }
        if (group.type === 'subtable') {
          return <SubTableSection key={group.nodes[0].id ?? gi} node={group.nodes[0]} />;
        }
        return (
          <div key={`vg-${gi}`} className="rounded-lg border bg-background">
            <div
              className="grid gap-4 p-4"
              style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
            >
              {group.nodes.map((child) => (
                <FieldNode key={child.id ?? child.props?.fieldId} node={child} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
