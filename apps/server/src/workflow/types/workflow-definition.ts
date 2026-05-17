import {
  ApproveNodeConfig,
  CcNodeConfig,
  ConditionNodeConfig,
  ParallelForkConfig,
  ParallelJoinConfig,
} from './node-config';

export type NodeType =
  | 'start'
  | 'approve'
  | 'cc'
  | 'condition'
  | 'parallel-fork'
  | 'parallel-join'
  | 'end';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  position: { x: number; y: number };
  config:
    | ApproveNodeConfig
    | CcNodeConfig
    | ConditionNodeConfig
    | ParallelForkConfig
    | ParallelJoinConfig
    | Record<string, never>;
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
