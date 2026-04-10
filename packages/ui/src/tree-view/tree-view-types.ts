import type { ReactNode } from 'react';

export interface TreeNode {
  id: string;
  parent_id: string | null;
  __hasChildren: boolean;
  [key: string]: any;
}

export interface TreeColumn {
  key: string;
  label: string;
  width?: number;
  render?: (value: any, node: TreeNode) => ReactNode;
}

export interface TreeViewProps {
  nodes: TreeNode[];
  columns: TreeColumn[];
  loading: boolean;
  expandedIds: Set<string>;
  onExpand: (id: string) => void;
  onCollapse: (id: string) => void;
  onRowClick?: (node: TreeNode) => void;
  selectedIds?: Set<string>;
  onSelect?: (id: string) => void;
  onSelectAll?: () => void;
  t: (key: string, values?: Record<string, any>) => string;
}

export interface TreeSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  nodes: Array<{ id: string; parentId: string | null; label: string }>;
  excludeId?: string;
  placeholder?: string;
  disabled?: boolean;
}
