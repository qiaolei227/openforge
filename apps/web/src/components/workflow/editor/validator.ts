import type { WorkflowDefinitionFE } from '@/lib/api/workflow';

/**
 * Validate a workflow definition before publishing.
 * Returns a human-readable Chinese error message, or null if the definition is valid.
 *
 * Mirrors a subset of the backend validator so the user gets instant feedback.
 * Backend will reject invalid definitions too — this is purely UX.
 */
export function validateDefinition(def: WorkflowDefinitionFE): string | null {
  if (!def.nodes.length) return '画布为空';

  const starts = def.nodes.filter((n) => n.type === 'start');
  if (starts.length !== 1) return '必须有且仅有一个开始节点';

  const ends = def.nodes.filter((n) => n.type === 'end');
  if (!ends.length) return '必须至少有一个结束节点';

  const ids = new Set(def.nodes.map((n) => n.id));
  for (const e of def.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) {
      return `连线引用了不存在的节点: ${e.from} → ${e.to}`;
    }
  }

  const outgoing: Record<string, string[]> = {};
  const incoming: Record<string, string[]> = {};
  for (const e of def.edges) {
    (outgoing[e.from] ??= []).push(e.to);
    (incoming[e.to] ??= []).push(e.from);
  }

  for (const n of def.nodes) {
    if (n.type !== 'end' && !outgoing[n.id]?.length) {
      return `节点 "${n.name}" 缺少出口连线`;
    }
    if (n.type !== 'start' && !incoming[n.id]?.length) {
      return `节点 "${n.name}" 缺少入口连线`;
    }
    if (n.type === 'approve' && !(n.config as any)?.assigneeStrategy) {
      return `审批节点 "${n.name}" 未配置审批人策略`;
    }
    if (n.type === 'condition') {
      const branches = (n.config as any)?.branches ?? [];
      if (!branches.length) return `条件节点 "${n.name}" 没有分支`;
      if (branches.length !== (outgoing[n.id] ?? []).length) {
        return `条件节点 "${n.name}" 的分支数与连线数不匹配`;
      }
    }
  }

  return null;
}
