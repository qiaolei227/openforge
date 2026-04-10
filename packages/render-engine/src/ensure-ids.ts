import type { LayoutConfig, LayoutNode } from '@openforge/shared';

let counter = 0;
function generateId(): string {
  return `node-${Date.now()}-${++counter}`;
}

export function ensureNodeIds(config: LayoutConfig): LayoutConfig {
  return { ...config, children: config.children.map(addId) };
}

function addId(node: LayoutNode): LayoutNode {
  return {
    ...node,
    id: node.id || generateId(),
    children: node.children?.map(addId),
  };
}
