'use client';

import { useCallback, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import { Send, Plus, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { workflowApi, type WorkflowDefinitionFE } from '@/lib/api/workflow';
import { useToastStore } from '@/stores/toast-store';
import { getApiErrorMessage } from '@/lib/utils';
import { nodeTypes } from './node-types';
import { NodeConfigPanel } from './node-config-panel';
import { validateDefinition } from './validator';

interface Props {
  workflowId: string;
  initialDefinition: WorkflowDefinitionFE;
}

type AddableType = 'approve' | 'cc' | 'condition' | 'parallel-fork' | 'parallel-join';

const DEFAULT_NAMES: Record<AddableType, string> = {
  approve: '审批',
  cc: '抄送',
  condition: '条件',
  'parallel-fork': '并行分',
  'parallel-join': '并行合',
};

function defaultConfigForType(type: AddableType): Record<string, any> {
  switch (type) {
    case 'approve':
      return {
        assigneeStrategy: 'fixed',
        assigneeConfig: { userIds: [] },
        mode: 'and',
        onEmpty: 'pass',
        autoSkipDuplicates: true,
        autoSkipSubmitter: true,
        allowedActions: {
          approve: true,
          reject: true,
          transfer: true,
          addBefore: true,
          addAfter: true,
          returnPrev: true,
          returnStart: true,
        },
      };
    case 'cc':
      return {
        assigneeStrategy: 'fixed',
        assigneeConfig: { userIds: [] },
        dedupAcrossInstance: true,
      };
    case 'condition':
      return { branches: [] };
    case 'parallel-join':
      return { joinMode: 'and' };
    case 'parallel-fork':
    default:
      return {};
  }
}

/** Generate a short unique id for new nodes / edges. */
function genId(prefix: string): string {
  // crypto.randomUUID is available in modern browsers; first 8 chars are plenty for in-memory uniqueness.
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${uuid.slice(0, 8)}`;
}

export function WorkflowEditorCanvas({ workflowId, initialDefinition }: Props) {
  const toast = useToastStore((s) => s.show);
  const tErrors = useTranslations('errorCodes');

  // Convert WorkflowDefinitionFE → react-flow Node[] / Edge[]
  const [nodes, setNodes] = useState<Node[]>(() =>
    initialDefinition.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: { label: n.name, config: n.config ?? {}, name: n.name },
    })),
  );
  const [edges, setEdges] = useState<Edge[]>(() =>
    initialDefinition.edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.label,
    })),
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback(
    (conn: Connection) =>
      setEdges((eds) => addEdge({ ...conn, id: genId('e') }, eds)),
    [],
  );

  const addNodeOfType = (type: AddableType) => {
    const id = genId(type);
    const name = DEFAULT_NAMES[type];
    const node: Node = {
      id,
      type,
      position: {
        x: 250 + Math.random() * 200,
        y: 200 + Math.random() * 200,
      },
      data: {
        label: name,
        name,
        config: defaultConfigForType(type),
      },
    };
    setNodes((nds) => [...nds, node]);
  };

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const updateSelectedNodeConfig = (newConfig: any, newName?: string) => {
    if (!selectedNodeId) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                config: newConfig,
                name: newName ?? (n.data as any).name,
                label: newName ?? (n.data as any).label,
              },
            }
          : n,
      ),
    );
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) =>
      eds.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
      ),
    );
    setSelectedNodeId(null);
  };

  const buildDefinition = (): WorkflowDefinitionFE => ({
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type as any,
      name: ((n.data as any).name ?? n.type) as string,
      position: n.position,
      config: ((n.data as any).config ?? {}) as Record<string, any>,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      from: e.source,
      to: e.target,
      label:
        typeof e.label === 'string' || typeof e.label === 'undefined'
          ? (e.label as string | undefined)
          : undefined,
    })),
  });

  const onSave = async () => {
    // Force any in-flight input (still focused, not yet blurred) to commit
    // before we snapshot the definition. Each Draft* input commits onBlur.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.tagName !== 'BODY') {
      active.blur();
      // Wait a tick so the resulting setState flushes into nodes/edges.
      await new Promise((r) => setTimeout(r, 0));
    }
    const def = buildDefinition();
    const err = validateDefinition(def);
    if (err) {
      toast(err, 'error');
      return;
    }
    setSaving(true);
    try {
      await workflowApi.publishVersion(workflowId, def);
      toast('已发布新版本', 'success');
    } catch (e: any) {
      toast(getApiErrorMessage(e, tErrors, '保存失败'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="flex h-full">
      <div className="flex-1 relative">
        {/* Left toolbar — node palette */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 bg-card border rounded-md p-2 shadow-sm">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 mb-0.5">
            添加节点
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => addNodeOfType('approve')}
            className="justify-start w-28"
          >
            <Plus className="mr-1 h-3 w-3" />
            审批
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => addNodeOfType('cc')}
            className="justify-start w-28"
          >
            <Plus className="mr-1 h-3 w-3" />
            抄送
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => addNodeOfType('condition')}
            className="justify-start w-28"
          >
            <Plus className="mr-1 h-3 w-3" />
            条件
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => addNodeOfType('parallel-fork')}
            className="justify-start w-28"
          >
            <Plus className="mr-1 h-3 w-3" />
            并行分
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => addNodeOfType('parallel-join')}
            className="justify-start w-28"
          >
            <Plus className="mr-1 h-3 w-3" />
            并行合
          </Button>
        </div>

        {/* Top-right — save / publish */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1 h-4 w-4" />
            )}
            {saving ? '发布中...' : '发布新版本'}
          </Button>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelectedNodeId(null)}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>

      {selectedNode && (
        <div className="w-80 border-l bg-background overflow-y-auto shrink-0">
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={(config, name) => updateSelectedNodeConfig(config, name)}
            onDelete={deleteSelectedNode}
          />
        </div>
      )}
    </div>
  );
}
