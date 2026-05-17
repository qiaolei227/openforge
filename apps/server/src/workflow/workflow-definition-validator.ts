import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { WorkflowDefinition } from './types';

/**
 * Validate a workflow definition (nodes + edges) for structural correctness.
 *
 * Rules:
 * - nodes/edges must be arrays
 * - exactly one start node
 * - at least one end node
 * - no duplicate node ids
 * - edges reference known nodes
 * - non-end nodes have at least one outgoing edge
 * - non-start nodes have at least one incoming edge
 * - condition nodes: outgoing edge count must equal branches.length
 * - approve nodes: must have assigneeStrategy
 * - graph is a DAG (no cycles)
 * - all nodes reachable from start
 */
export function validateWorkflowDefinition(def: WorkflowDefinition): void {
  if (!Array.isArray(def?.nodes) || !Array.isArray(def?.edges))
    throw new BusinessException(
      400,
      ErrorCodes.WORKFLOW_INVALID_DEFINITION,
      'nodes/edges must be arrays',
    );

  const nodes = def.nodes;
  const ids = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id))
      throw new BusinessException(
        400,
        ErrorCodes.WORKFLOW_INVALID_DEFINITION,
        `Duplicate node id: ${n.id}`,
      );
    ids.add(n.id);
  }

  const starts = nodes.filter((n) => n.type === 'start');
  if (starts.length !== 1)
    throw new BusinessException(
      400,
      ErrorCodes.WORKFLOW_INVALID_DEFINITION,
      'Must have exactly one start node',
    );
  const ends = nodes.filter((n) => n.type === 'end');
  if (ends.length === 0)
    throw new BusinessException(
      400,
      ErrorCodes.WORKFLOW_INVALID_DEFINITION,
      'Must have at least one end node',
    );

  const outgoing: Record<string, string[]> = {};
  const incoming: Record<string, string[]> = {};
  for (const e of def.edges) {
    if (!ids.has(e.from) || !ids.has(e.to))
      throw new BusinessException(
        400,
        ErrorCodes.WORKFLOW_INVALID_DEFINITION,
        `Edge references unknown node: ${e.from} -> ${e.to}`,
      );
    (outgoing[e.from] ??= []).push(e.to);
    (incoming[e.to] ??= []).push(e.from);
  }

  for (const n of nodes) {
    if (n.type !== 'end' && !outgoing[n.id]?.length)
      throw new BusinessException(
        400,
        ErrorCodes.WORKFLOW_INVALID_DEFINITION,
        `Node ${n.id} missing outgoing edge`,
      );
    if (n.type !== 'start' && !incoming[n.id]?.length)
      throw new BusinessException(
        400,
        ErrorCodes.WORKFLOW_INVALID_DEFINITION,
        `Node ${n.id} missing incoming edge`,
      );

    if (n.type === 'condition') {
      const branches = (n.config as any)?.branches as
        | Array<{ targetNodeId: string }>
        | undefined;
      if (!branches?.length)
        throw new BusinessException(
          400,
          ErrorCodes.WORKFLOW_INVALID_DEFINITION,
          `condition node ${n.id} has no branches`,
        );
      if (branches.length !== (outgoing[n.id]?.length || 0))
        throw new BusinessException(
          400,
          ErrorCodes.WORKFLOW_INVALID_DEFINITION,
          `condition node ${n.id} edge count != branches.length`,
        );
    }
    if (n.type === 'approve' && !(n.config as any)?.assigneeStrategy)
      throw new BusinessException(
        400,
        ErrorCodes.WORKFLOW_INVALID_DEFINITION,
        `approve node ${n.id} missing assigneeStrategy`,
      );
  }

  // DAG check (iterative DFS to avoid recursion limits on deep graphs)
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color: Record<string, number> = {};
  for (const n of nodes) color[n.id] = WHITE;

  const visit = (root: string) => {
    type Frame = { id: string; iter: number };
    const stack: Frame[] = [{ id: root, iter: 0 }];
    color[root] = GRAY;
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const children = outgoing[frame.id] ?? [];
      if (frame.iter >= children.length) {
        color[frame.id] = BLACK;
        stack.pop();
        continue;
      }
      const nxt = children[frame.iter++];
      if (color[nxt] === GRAY)
        throw new BusinessException(
          400,
          ErrorCodes.WORKFLOW_INVALID_DEFINITION,
          `Cycle detected at ${nxt}`,
        );
      if (color[nxt] === WHITE) {
        color[nxt] = GRAY;
        stack.push({ id: nxt, iter: 0 });
      }
    }
  };

  visit(starts[0].id);

  // Reachability: any node still WHITE was not visited from start.
  // Note: with single-start + every-non-start-has-incoming + DAG, a node
  // can still be unreachable when it sits in a cycle disconnected from
  // start — but the cycle check already throws above. This is a
  // defensive backstop.
  for (const n of nodes) {
    if (color[n.id] === WHITE)
      throw new BusinessException(
        400,
        ErrorCodes.WORKFLOW_INVALID_DEFINITION,
        `Unreachable node: ${n.id}`,
      );
  }
}
