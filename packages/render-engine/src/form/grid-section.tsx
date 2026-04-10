'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { LayoutNode } from '@openforge/shared';
import { FieldNode } from './field-node';

interface GridSectionProps {
  node: LayoutNode;
}

export function GridSection({ node }: GridSectionProps) {
  const cols = node.props?.cols ?? 4;
  const title = node.props?.title;
  const collapsible = node.props?.collapsible ?? false;
  const [collapsed, setCollapsed] = useState(false);
  const children = node.children ?? [];

  return (
    <div className="rounded-lg border bg-background">
      {(title || collapsible) && (
        <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
          {collapsible && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
          {title && (
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
          )}
        </div>
      )}
      {!(collapsed && collapsible) && (
        <div
          className="grid gap-4 p-4"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {children.map((child) => (
            <FieldNode key={child.id ?? child.props?.fieldId} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}
