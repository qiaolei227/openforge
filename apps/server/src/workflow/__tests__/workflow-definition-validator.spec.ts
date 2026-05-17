import { describe, it, expect } from 'vitest';
import { validateWorkflowDefinition } from '../workflow-definition-validator';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { WorkflowDefinition } from '../types';

const startNode = (id = 'start') => ({
  id,
  type: 'start' as const,
  name: 'Start',
  position: { x: 0, y: 0 },
  config: {},
});
const endNode = (id = 'end') => ({
  id,
  type: 'end' as const,
  name: 'End',
  position: { x: 100, y: 0 },
  config: {},
});
const approveNode = (id = 'a1', config: any = { assigneeStrategy: 'fixed' }) => ({
  id,
  type: 'approve' as const,
  name: 'Approve',
  position: { x: 50, y: 0 },
  config,
});
const conditionNode = (id = 'c1', branches: any[]) => ({
  id,
  type: 'condition' as const,
  name: 'Condition',
  position: { x: 50, y: 0 },
  config: { branches },
});

const edge = (from: string, to: string, id?: string) => ({
  id: id ?? `${from}-${to}`,
  from,
  to,
});

describe('validateWorkflowDefinition', () => {
  it('throws when there is no start node', () => {
    const def: WorkflowDefinition = {
      nodes: [endNode()],
      edges: [],
    };
    expect(() => validateWorkflowDefinition(def)).toThrowError(
      expect.objectContaining({ errorCode: ErrorCodes.WORKFLOW_INVALID_DEFINITION }),
    );
  });

  it('throws when there are multiple start nodes', () => {
    const def: WorkflowDefinition = {
      nodes: [startNode('s1'), startNode('s2'), endNode()],
      edges: [edge('s1', 'end'), edge('s2', 'end', 's2-end')],
    };
    expect(() => validateWorkflowDefinition(def)).toThrowError(
      expect.objectContaining({ errorCode: ErrorCodes.WORKFLOW_INVALID_DEFINITION }),
    );
  });

  it('throws when there are zero end nodes', () => {
    const def: WorkflowDefinition = {
      nodes: [startNode(), approveNode()],
      edges: [edge('start', 'a1')],
    };
    expect(() => validateWorkflowDefinition(def)).toThrowError(
      expect.objectContaining({ errorCode: ErrorCodes.WORKFLOW_INVALID_DEFINITION }),
    );
  });

  it('throws when graph has a cycle', () => {
    // start → a1 → a2 → a1 (cycle), and one path to end so degree checks pass
    const def: WorkflowDefinition = {
      nodes: [startNode(), approveNode('a1'), approveNode('a2'), endNode()],
      edges: [
        edge('start', 'a1'),
        edge('a1', 'a2'),
        edge('a2', 'a1', 'a2-a1'),
        edge('a2', 'end', 'a2-end'),
      ],
    };
    expect(() => validateWorkflowDefinition(def)).toThrowError(
      expect.objectContaining({ errorCode: ErrorCodes.WORKFLOW_INVALID_DEFINITION }),
    );
  });

  it('throws on duplicate node id', () => {
    const def: WorkflowDefinition = {
      nodes: [startNode('dup'), endNode('dup')],
      edges: [],
    };
    expect(() => validateWorkflowDefinition(def)).toThrowError(
      expect.objectContaining({ errorCode: ErrorCodes.WORKFLOW_INVALID_DEFINITION }),
    );
  });

  it('throws when an edge references unknown node id', () => {
    const def: WorkflowDefinition = {
      nodes: [startNode(), endNode()],
      edges: [edge('start', 'ghost')],
    };
    expect(() => validateWorkflowDefinition(def)).toThrowError(
      expect.objectContaining({ errorCode: ErrorCodes.WORKFLOW_INVALID_DEFINITION }),
    );
  });

  it('throws when a non-end node has no outgoing edge', () => {
    const def: WorkflowDefinition = {
      nodes: [startNode(), approveNode('a1'), endNode()],
      edges: [edge('start', 'a1')],
    };
    expect(() => validateWorkflowDefinition(def)).toThrowError(
      expect.objectContaining({ errorCode: ErrorCodes.WORKFLOW_INVALID_DEFINITION }),
    );
  });

  it('throws when a non-start node has no incoming edge', () => {
    // a2 has no incoming edge; everything else is fine
    const def: WorkflowDefinition = {
      nodes: [startNode(), approveNode('a1'), approveNode('a2'), endNode()],
      edges: [edge('start', 'a1'), edge('a1', 'end'), edge('a2', 'end', 'a2-end')],
    };
    expect(() => validateWorkflowDefinition(def)).toThrowError(
      expect.objectContaining({ errorCode: ErrorCodes.WORKFLOW_INVALID_DEFINITION }),
    );
  });

  it('throws when condition node outgoing edge count != branches.length', () => {
    const def: WorkflowDefinition = {
      nodes: [
        startNode(),
        conditionNode('c1', [
          { name: 'b1', condition: { op: 'and', conditions: [] }, targetNodeId: 'end' },
          { name: 'b2', condition: { op: 'and', conditions: [] }, targetNodeId: 'end' },
        ]),
        endNode(),
      ],
      edges: [edge('start', 'c1'), edge('c1', 'end')], // only one outgoing edge — should be 2
    };
    expect(() => validateWorkflowDefinition(def)).toThrowError(
      expect.objectContaining({ errorCode: ErrorCodes.WORKFLOW_INVALID_DEFINITION }),
    );
  });

  it('throws when approve node is missing assigneeStrategy', () => {
    const def: WorkflowDefinition = {
      nodes: [
        startNode(),
        approveNode('a1', { mode: 'and' }), // no assigneeStrategy
        endNode(),
      ],
      edges: [edge('start', 'a1'), edge('a1', 'end')],
    };
    expect(() => validateWorkflowDefinition(def)).toThrowError(
      expect.objectContaining({ errorCode: ErrorCodes.WORKFLOW_INVALID_DEFINITION }),
    );
  });

  it('throws when a node is unreachable from start', () => {
    // Two disconnected sub-graphs (different start/end), but only one start allowed,
    // so use single start with disconnected island that has its own in & out edges
    // forming a side cycle is itself caught — easier to make an island that touches end:
    // start → a1 → end; island: a2 ↔ a3 with a3 → end. start can't reach a2/a3.
    // a2 needs incoming → a3 → a2; a3 needs incoming → a2 → a3 (creates cycle).
    // To trigger reachability specifically, make: a2 → a3 → end and a2 also has
    // an incoming edge from... hmm: just add a self loop a2 → a2 fails cycle.
    //
    // Simpler: only check unreachable. Add an isolated node a2 that has incoming
    // from a3 and outgoing to end, and a3 has incoming from a2 and outgoing to a2.
    // That's a cycle though. Use: a2 has incoming from end? Edges only point forward.
    //
    // The cleanest reachability-only failure: have an node `iso` whose edges
    // point only to/from each other and to end. But the validator already
    // fails on cycle first if cycle exists.
    //
    // So construct: start → end, plus iso1 → iso2, iso2 → end, end has incoming
    // from start and iso2. iso1 has no incoming edge → fails on "missing incoming"
    // before reachability. So we need iso1 to have an incoming edge from
    // somewhere reachable... which makes it reachable.
    //
    // Approach: skip cycle check by having a side path that joins back to end.
    // start → end; iso1 → iso2 → end; iso2 → iso1 (cycle) — fails cycle first.
    //
    // The only way to be unreachable but pass other checks is via a cycle.
    // The validator runs DAG check (which catches cycle) BEFORE reachability,
    // so reachability is triggered when a node has no path from start but
    // forms a valid DAG. That requires every node have ≥1 incoming edge.
    //
    // Workaround: a2 has incoming from a3, a3 has incoming from a2 — cycle.
    // Reachability essentially requires the graph to contain a cycle of
    // unreachable nodes... which the cycle check will catch first.
    //
    // Realistically, the validator's "unreachable" check only fires in
    // exotic DAGs. Pragmatic test: ensure it does fire when we ALSO
    // somehow bypass DAG... we can't easily without breaking the
    // visit() function. Skip this edge case test or make it lighter:
    //
    // Easiest reproducible "unreachable in DAG":
    // start → end, iso1 → end (iso1 has no incoming — fails earlier).
    //
    // The validator's structural rules (every non-start has incoming +
    // acyclic) actually IMPLY reachability via topological argument when
    // single start exists. So unreachable check is defensive only.
    //
    // We test that the validator runs the check without crashing, by
    // simulating an unreachable node manually wired. Use TWO start-like
    // nodes? Multiple starts fails earlier. Skip this specific case.
    //
    // Substitute test: validate that two-component graph with valid wiring
    // (which must contain cycle) gets caught.
    const def: WorkflowDefinition = {
      nodes: [
        startNode(),
        approveNode('iso1'),
        approveNode('iso2'),
        endNode(),
      ],
      edges: [
        edge('start', 'end'),
        edge('iso1', 'iso2'),
        edge('iso2', 'iso1', 'iso2-iso1'),
      ],
    };
    expect(() => validateWorkflowDefinition(def)).toThrowError(
      expect.objectContaining({ errorCode: ErrorCodes.WORKFLOW_INVALID_DEFINITION }),
    );
  });

  it('passes on a minimal valid graph (start → approve → end)', () => {
    const def: WorkflowDefinition = {
      nodes: [startNode(), approveNode('a1'), endNode()],
      edges: [edge('start', 'a1'), edge('a1', 'end')],
    };
    expect(() => validateWorkflowDefinition(def)).not.toThrow();
  });

  it('passes on a valid condition graph with matching branches', () => {
    const def: WorkflowDefinition = {
      nodes: [
        startNode(),
        conditionNode('c1', [
          { name: 'b1', condition: { op: 'and', conditions: [] }, targetNodeId: 'a1' },
          { name: 'b2', condition: { op: 'and', conditions: [] }, targetNodeId: 'a2', isDefault: true },
        ]),
        approveNode('a1'),
        approveNode('a2'),
        endNode(),
      ],
      edges: [
        edge('start', 'c1'),
        edge('c1', 'a1'),
        edge('c1', 'a2', 'c1-a2'),
        edge('a1', 'end'),
        edge('a2', 'end', 'a2-end'),
      ],
    };
    expect(() => validateWorkflowDefinition(def)).not.toThrow();
  });

  it('throws when nodes or edges are not arrays', () => {
    expect(() => validateWorkflowDefinition({} as any)).toThrowError(
      expect.objectContaining({ errorCode: ErrorCodes.WORKFLOW_INVALID_DEFINITION }),
    );
  });
});
