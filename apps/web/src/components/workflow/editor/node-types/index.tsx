'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Play,
  CheckCircle2,
  MessageSquare,
  GitBranch,
  GitFork,
  GitMerge,
  Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Custom node renderers for the workflow editor canvas.
 *
 * Each node has source / target Handles for edge connections. Styling uses
 * Tailwind utility classes with dark-mode variants. Icons are monochrome
 * lucide-react per project rules.
 */

const baseClasses =
  'px-3 py-2 rounded-md border-2 bg-card text-foreground text-xs min-w-[110px] text-center shadow-sm';

function StartNode(_props: NodeProps) {
  return (
    <div className={cn(baseClasses, 'border-green-500 bg-green-50 dark:bg-green-900/30')}>
      <div className="flex items-center justify-center gap-1.5 font-medium">
        <Play className="h-3 w-3" />
        开始
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function EndNode(_props: NodeProps) {
  return (
    <div className={cn(baseClasses, 'border-green-700 bg-green-100 dark:bg-green-900/50')}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center justify-center gap-1.5 font-medium">
        <Square className="h-3 w-3" />
        结束
      </div>
    </div>
  );
}

function ApproveNode({ data }: NodeProps) {
  const name = ((data as any)?.name ?? '审批') as string;
  return (
    <div className={cn(baseClasses, 'border-blue-500 bg-blue-50 dark:bg-blue-900/30')}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center justify-center gap-1.5 font-medium">
        <CheckCircle2 className="h-3 w-3" />
        <span className="truncate max-w-[120px]" title={name}>
          {name}
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function CcNode({ data }: NodeProps) {
  const name = ((data as any)?.name ?? '抄送') as string;
  return (
    <div
      className={cn(
        baseClasses,
        'border-orange-500 border-dashed bg-orange-50 dark:bg-orange-900/30',
      )}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center justify-center gap-1.5 font-medium">
        <MessageSquare className="h-3 w-3" />
        <span className="truncate max-w-[120px]" title={name}>
          {name}
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ConditionNode({ data }: NodeProps) {
  const name = ((data as any)?.name ?? '条件') as string;
  return (
    <div className={cn(baseClasses, 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30')}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center justify-center gap-1.5 font-medium">
        <GitBranch className="h-3 w-3" />
        <span className="truncate max-w-[120px]" title={name}>
          {name}
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ParallelForkNode(_props: NodeProps) {
  return (
    <div className={cn(baseClasses, 'border-purple-500 bg-purple-50 dark:bg-purple-900/30')}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center justify-center gap-1.5 font-medium">
        <GitFork className="h-3 w-3" />
        并行分
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ParallelJoinNode(_props: NodeProps) {
  return (
    <div className={cn(baseClasses, 'border-purple-700 bg-purple-50 dark:bg-purple-900/30')}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center justify-center gap-1.5 font-medium">
        <GitMerge className="h-3 w-3" />
        并行合
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const nodeTypes = {
  start: StartNode,
  end: EndNode,
  approve: ApproveNode,
  cc: CcNode,
  condition: ConditionNode,
  'parallel-fork': ParallelForkNode,
  'parallel-join': ParallelJoinNode,
};
