import { create } from 'zustand';
import type { LayoutConfig, LayoutNode } from '@openforge/shared';

/* ------------------------------------------------------------------ */
/*  Helper Functions                                                    */
/* ------------------------------------------------------------------ */

/** Recursive search for a node by id */
export function findNode(layout: LayoutConfig, nodeId: string): LayoutNode | null {
  function search(nodes: LayoutNode[]): LayoutNode | null {
    for (const node of nodes) {
      if (node.id === nodeId) return node;
      if (node.children) {
        const found = search(node.children);
        if (found) return found;
      }
    }
    return null;
  }
  return search(layout.children);
}

/** Find the parent of a node and its index in the parent's children */
export function findParent(
  layout: LayoutConfig,
  nodeId: string,
): { parent: LayoutNode | null; index: number } {
  // Check top-level children first
  for (let i = 0; i < layout.children.length; i++) {
    if (layout.children[i].id === nodeId) {
      return { parent: null, index: i };
    }
  }

  function search(nodes: LayoutNode[]): { parent: LayoutNode; index: number } | null {
    for (const node of nodes) {
      if (node.children) {
        for (let i = 0; i < node.children.length; i++) {
          if (node.children[i].id === nodeId) {
            return { parent: node, index: i };
          }
        }
        const found = search(node.children);
        if (found) return found;
      }
    }
    return null;
  }

  const result = search(layout.children);
  return result ?? { parent: null, index: -1 };
}

/** Deep clone layout via JSON serialization */
export function cloneLayout(layout: LayoutConfig): LayoutConfig {
  return JSON.parse(JSON.stringify(layout));
}

/* ------------------------------------------------------------------ */
/*  State & Actions                                                    */
/* ------------------------------------------------------------------ */

const MAX_HISTORY = 50;

interface CanvasState {
  // View being edited
  viewId: string | null;
  viewType: 'form' | 'list';
  layout: LayoutConfig;

  // Selection
  selectedNodeId: string | null;

  // Dirty tracking
  isDirty: boolean;

  // Undo/Redo
  history: LayoutConfig[];
  historyIndex: number;
}

interface CanvasActions {
  /** Load a view, reset history */
  setView: (viewId: string, viewType: 'form' | 'list', layout: LayoutConfig) => void;

  /** Select a node for the property panel */
  selectNode: (id: string | null) => void;

  /** Add a node to parent's children (or root if parentId is null) */
  addNode: (parentId: string | null, node: LayoutNode, index: number) => void;

  /** Add multiple nodes in a single layout clone (batch version of addNode) */
  addNodes: (ops: Array<{ parentId: string | null; node: LayoutNode; index: number }>) => void;

  /** Remove a node from tree */
  removeNode: (nodeId: string) => void;

  /** Move a node to a new parent at a new index */
  moveNode: (nodeId: string, newParentId: string | null, newIndex: number) => void;

  /** Merge props into a node */
  updateNodeProps: (nodeId: string, props: Record<string, any>) => void;

  /** Navigate history backward */
  undo: () => void;

  /** Navigate history forward */
  redo: () => void;

  /** After save, clear dirty flag */
  markClean: () => void;
}

/** Push current layout onto history, truncating any future states.
 *  state.layout is immutable (replaced on every set()), so no clone needed here. */
function pushHistory(state: CanvasState): Partial<CanvasState> {
  const pastHistory = state.history.slice(0, state.historyIndex + 1);
  const newHistory = [...pastHistory, state.layout];

  // Limit history size
  if (newHistory.length > MAX_HISTORY) {
    newHistory.shift();
  }

  return {
    history: newHistory,
    historyIndex: newHistory.length - 1,
    isDirty: true,
  };
}

/** Remove a node by id from a tree, returning the updated nodes and the removed node (if found). */
function removeNodeFromTree(
  nodes: LayoutNode[],
  nodeId: string,
): { nodes: LayoutNode[]; removed: LayoutNode | null } {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === nodeId) {
      const removed = nodes.splice(i, 1)[0];
      return { nodes, removed };
    }
    if (nodes[i].children) {
      const result = removeNodeFromTree(nodes[i].children!, nodeId);
      if (result.removed) return result;
    }
  }
  return { nodes, removed: null };
}

const emptyLayout: LayoutConfig = { type: 'Form', children: [] };

export const useCanvasStore = create<CanvasState & CanvasActions>((set, get) => ({
  // Initial state
  viewId: null,
  viewType: 'form',
  layout: emptyLayout,
  selectedNodeId: null,
  isDirty: false,
  history: [],
  historyIndex: -1,

  setView: (viewId, viewType, layout) => {
    const cloned = cloneLayout(layout);
    set({
      viewId,
      viewType,
      layout: cloned,
      selectedNodeId: null,
      isDirty: false,
      history: [cloneLayout(cloned)],
      historyIndex: 0,
    });
  },

  selectNode: (id) => {
    set({ selectedNodeId: id });
  },

  addNode: (parentId, node, index) => {
    const state = get();
    const historyUpdate = pushHistory(state);
    const newLayout = cloneLayout(state.layout);

    if (parentId === null) {
      // Add to root children
      const safeIndex = Math.min(Math.max(0, index), newLayout.children.length);
      newLayout.children.splice(safeIndex, 0, node);
    } else {
      const parent = findNode(newLayout, parentId);
      if (parent) {
        if (!parent.children) parent.children = [];
        const safeIndex = Math.min(Math.max(0, index), parent.children.length);
        parent.children.splice(safeIndex, 0, node);
      }
    }

    set({
      layout: newLayout,
      ...historyUpdate,
    });
  },

  addNodes: (ops) => {
    if (ops.length === 0) return;
    const state = get();
    const historyUpdate = pushHistory(state);
    const newLayout = cloneLayout(state.layout);

    for (const { parentId, node, index } of ops) {
      if (parentId === null) {
        const safeIndex = Math.min(Math.max(0, index), newLayout.children.length);
        newLayout.children.splice(safeIndex, 0, node);
      } else {
        const parent = findNode(newLayout, parentId);
        if (parent) {
          if (!parent.children) parent.children = [];
          const safeIndex = Math.min(Math.max(0, index), parent.children.length);
          parent.children.splice(safeIndex, 0, node);
        }
      }
    }

    set({
      layout: newLayout,
      ...historyUpdate,
    });
  },

  removeNode: (nodeId) => {
    const state = get();
    const historyUpdate = pushHistory(state);
    const newLayout = cloneLayout(state.layout);

    removeNodeFromTree(newLayout.children, nodeId);

    // Deselect if the removed node was selected
    const selectedNodeId = state.selectedNodeId === nodeId ? null : state.selectedNodeId;

    set({
      layout: newLayout,
      selectedNodeId,
      ...historyUpdate,
    });
  },

  moveNode: (nodeId, newParentId, newIndex) => {
    const state = get();
    const historyUpdate = pushHistory(state);
    const newLayout = cloneLayout(state.layout);

    // First, find and remove the node from its current position
    const { removed: movedNode } = removeNodeFromTree(newLayout.children, nodeId);

    if (!movedNode) return; // Node not found, bail

    // Then insert at new position
    if (newParentId === null) {
      const safeIndex = Math.min(Math.max(0, newIndex), newLayout.children.length);
      newLayout.children.splice(safeIndex, 0, movedNode);
    } else {
      const newParent = findNode(newLayout, newParentId);
      if (newParent) {
        if (!newParent.children) newParent.children = [];
        const safeIndex = Math.min(Math.max(0, newIndex), newParent.children.length);
        newParent.children.splice(safeIndex, 0, movedNode);
      }
    }

    set({
      layout: newLayout,
      ...historyUpdate,
    });
  },

  updateNodeProps: (nodeId, props) => {
    const state = get();
    const historyUpdate = pushHistory(state);
    const newLayout = cloneLayout(state.layout);

    const node = findNode(newLayout, nodeId);
    if (node) {
      node.props = { ...node.props, ...props };
    }

    set({
      layout: newLayout,
      ...historyUpdate,
    });
  },

  undo: () => {
    const { historyIndex, history } = get();
    if (historyIndex <= 0) return;

    const newIndex = historyIndex - 1;
    set({
      layout: cloneLayout(history[newIndex]),
      historyIndex: newIndex,
      isDirty: true,
      selectedNodeId: null,
    });
  },

  redo: () => {
    const { historyIndex, history } = get();
    if (historyIndex >= history.length - 1) return;

    const newIndex = historyIndex + 1;
    set({
      layout: cloneLayout(history[newIndex]),
      historyIndex: newIndex,
      isDirty: true,
      selectedNodeId: null,
    });
  },

  markClean: () => {
    set({ isDirty: false });
  },
}));
