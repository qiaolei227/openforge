'use client';

import { createContext, useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import type { Field, LayoutNode, SysView, SysEntity } from '@openforge/shared';

/* ------------------------------------------------------------------ */
/*  Designer-specific selection context (not the runtime RenderCtx)    */
/* ------------------------------------------------------------------ */

interface DesignerContextValue {
  mode: 'design';
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

export const DesignerContext = createContext<DesignerContextValue>({
  mode: 'design',
  selectedNodeId: null,
  onSelectNode: () => {},
});
import { useCanvasStore } from './canvas-store';
import { DesignerToolbar } from './designer-toolbar';
import { ComponentPanel } from './component-panel';
import { FormCanvas } from './form-canvas';
import { ListCanvas } from './list-canvas';
import { PropertyPanel } from './property-panel';
import { PreviewMode } from './preview-mode';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export const generateId = () =>
  'node-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

/**
 * Custom collision detection:
 * - New items dragged from panel → pointerWithin (precise enter/leave)
 * - Existing items being reordered → closestCenter (smooth sort animation)
 */
const customCollision: CollisionDetection = (args) => {
  const activeData = args.active.data.current as Record<string, any> | undefined;
  if (activeData?.isNew) {
    return pointerWithin(args);
  }
  return closestCenter(args);
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DesignerLayoutProps {
  appId: string;
  modelId: string;
  appName: string;
  modelName: string;
  fields: Field[];
  entities: SysEntity[];
  views: SysView[];
}

/**
 * Compute the insert index for a top-level drop (Grid or SubTable).
 * Returns null when the drop target is invalid.
 */
function getTopLevelInsertIndex(
  layout: { children: LayoutNode[] },
  overData: Record<string, any> | undefined,
  overId: string,
): number | null {
  if (overData?.type !== 'canvas-bottom' && !layout.children.some((c) => c.id === overId)) {
    return null;
  }
  if (overData?.type === 'canvas-bottom') return layout.children.length;
  const idx = layout.children.findIndex((c) => c.id === overId);
  return idx >= 0 ? idx : layout.children.length;
}

/**
 * Resolve which container (Grid or SubTable) a field was dropped into and at what index.
 */
function resolveFieldDropTarget(
  layout: { children: LayoutNode[] },
  overData: Record<string, any> | undefined,
  overId: string,
): { parentId: string; index: number } | null {
  if (overData?.type === 'grid-drop-zone') {
    const parentId = overData.gridId as string;
    const parent = layout.children.find((c) => c.id === parentId);
    return { parentId, index: parent?.children?.length ?? 0 };
  }
  if (overData?.type === 'subtable-drop-zone') {
    const parentId = overData.subtableId as string;
    const parent = layout.children.find((c) => c.id === parentId);
    return { parentId, index: parent?.children?.length ?? 0 };
  }
  for (const container of layout.children) {
    if (container.children) {
      const childIdx = container.children.findIndex((c) => c.id === overId);
      if (childIdx >= 0) {
        return { parentId: container.id!, index: childIdx };
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Form DragEnd Handler                                               */
/* ------------------------------------------------------------------ */

function handleFormDragEnd(
  event: DragEndEvent,
  layout: { children: LayoutNode[] },
  addNode: (parentId: string | null, node: LayoutNode, index: number) => void,
  moveNode: (nodeId: string, newParentId: string | null, newIndex: number) => void,
  selectNode: (id: string | null) => void,
  fields: Field[],
  entities: SysEntity[],
) {
  const { active, over } = event;
  if (!over) return;

  const activeData = active.data.current as Record<string, any> | undefined;
  const overData = over.data.current as Record<string, any> | undefined;
  const activeId = String(active.id);
  const overId = String(over.id);

  if (!activeData) return;

  // ── Case 1: New Grid from panel — only on canvas drop zones ──
  if (activeData.type === 'Grid' && activeData.isNew) {
    const index = getTopLevelInsertIndex(layout, overData, overId);
    if (index === null) return;

    const newGrid: LayoutNode = {
      id: generateId(),
      type: 'Grid',
      props: { title: '', cols: 4, collapsible: false },
      children: [],
    };

    addNode(null, newGrid, index);
    selectNode(newGrid.id!);
    return;
  }

  // ── Case 1b: New SubTable from panel — drop on canvas (same level as Grid) ──
  if (activeData.type === 'SubTable' && activeData.isNew) {
    const index = getTopLevelInsertIndex(layout, overData, overId);
    if (index === null) return;

    // Find entity fields and auto-populate as children
    const entityFields = fields.filter(
      (f) => f.entityId === activeData.entityId && !f.isSystem && !f.deletedAt,
    );

    const newSubTable: LayoutNode = {
      id: generateId(),
      type: 'SubTable',
      props: {
        entityId: activeData.entityId,
        entityCode: activeData.entityCode,
        entityType: activeData.entityType,
        title: activeData.name,
        cols: 4,
        collapsible: false,
      },
      children: entityFields.map((f) => ({
        id: generateId(),
        type: 'Field',
        props: { fieldId: f.id, span: 1, required: null },
      })),
    };

    addNode(null, newSubTable, index);
    selectNode(newSubTable.id!);
    return;
  }

  // ── Case 2: New Field from panel — on grid/subtable drop zones or existing fields ──
  if (activeData.type === 'Field' && activeData.isNew) {
    const target = resolveFieldDropTarget(layout, overData, overId);
    if (!target) return;

    // Validate: entity fields can only go into their own SubTable
    const field = fields.find((f) => f.id === activeData.fieldId);
    if (field?.entityId) {
      const targetNode = layout.children.find((c) => c.id === target.parentId);
      if (targetNode?.type !== 'SubTable' || targetNode.props?.entityId !== field.entityId) {
        return;
      }
    }

    const newField: LayoutNode = {
      id: generateId(),
      type: 'Field',
      props: { fieldId: activeData.fieldId, span: 1 },
    };
    addNode(target.parentId, newField, target.index);
    selectNode(newField.id!);
    return;
  }

  // ── Case 3: Reorder Grid or SubTable (top-level nodes) ──
  const isTopLevel = layout.children.some((c) => c.id === activeId);
  if (isTopLevel) {
    if (activeId === overId) return;

    let newIndex = layout.children.length;
    if (overData?.type === 'canvas-bottom') {
      newIndex = layout.children.length;
    } else {
      const overIdx = layout.children.findIndex((c) => c.id === overId);
      if (overIdx >= 0) newIndex = overIdx;
    }

    moveNode(activeId, null, newIndex);
    return;
  }

  // ── Case 4: Reorder/move Field within Grid or SubTable ──
  const target = resolveFieldDropTarget(layout, overData, overId);
  if (target) {
    moveNode(activeId, target.parentId, target.index);
  }
}

/* ------------------------------------------------------------------ */
/*  List DragEnd Handler                                               */
/* ------------------------------------------------------------------ */

function handleListDragEnd(
  event: DragEndEvent,
  columns: LayoutNode[],
  addNode: (parentId: string | null, node: LayoutNode, index: number) => void,
  moveNode: (nodeId: string, newParentId: string | null, newIndex: number) => void,
  selectNode: (id: string | null) => void,
  fields: Field[],
) {
  const { active, over } = event;
  if (!over) return;

  const activeData = active.data.current as Record<string, any> | undefined;
  const activeId = String(active.id);
  const overId = String(over.id);
  const overData = over.data.current as Record<string, any> | undefined;

  if (!activeData) return;

  // ── New Column from panel ──
  if (activeData.type === 'Column' && activeData.isNew) {
    const field = fields.find((f) => f.id === activeData.fieldId);
    const newColumn: LayoutNode = {
      id: generateId(),
      type: 'Column',
      props: {
        fieldId: activeData.fieldId,
        label: field?.name ?? '',
        width: 150,
        align: 'left',
        fixed: null,
      },
    };

    let index = columns.length;
    if (overData?.type === 'column-end') {
      index = columns.length;
    } else {
      const overIdx = columns.findIndex((c) => c.id === overId);
      if (overIdx >= 0) index = overIdx;
    }

    addNode(null, newColumn, index);
    selectNode(newColumn.id!);
    return;
  }

  // ── Reorder columns ──
  if (activeId === overId) return;

  let newIndex = columns.length;
  if (overData?.type === 'column-end') {
    newIndex = columns.length;
  } else {
    const overIdx = columns.findIndex((c) => c.id === overId);
    if (overIdx >= 0) newIndex = overIdx;
  }

  moveNode(activeId, null, newIndex);
}

/* ------------------------------------------------------------------ */
/*  Designer Layout                                                    */
/* ------------------------------------------------------------------ */

export function DesignerLayout({
  appId,
  modelId,
  appName,
  modelName,
  fields,
  entities,
  views,
}: DesignerLayoutProps) {
  const [previewMode, setPreviewMode] = useState(false);

  const viewType = useCanvasStore((s) => s.viewType);
  const layout = useCanvasStore((s) => s.layout);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const addNode = useCanvasStore((s) => s.addNode);
  const moveNode = useCanvasStore((s) => s.moveNode);

  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const tDesigner = useTranslations('designer');

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current as any;
      if (data?.isNew) {
        if (data.type === 'Grid') {
          setActiveDragLabel(tDesigner('grid'));
        } else if (data.type === 'Field' || data.type === 'Column') {
          const field = fields.find((f) => f.id === data.fieldId);
          setActiveDragLabel(field?.name ?? data.type);
        } else if (data.type === 'SubTable') {
          setActiveDragLabel(data.name ?? 'SubTable');
        } else {
          setActiveDragLabel(data.type ?? '');
        }
      } else {
        const activeId = String(event.active.id);
        const currentLayout = useCanvasStore.getState().layout;
        const topLevel = currentLayout.children.find((c) => c.id === activeId);
        if (topLevel) {
          setActiveDragLabel(topLevel.props?.title || tDesigner('untitledGrid'));
        } else {
          for (const container of currentLayout.children) {
            const child = container.children?.find((c) => c.id === activeId);
            if (child) {
              const field = fields.find((f) => f.id === child.props?.fieldId);
              setActiveDragLabel(field?.name ?? '');
              break;
            }
          }
        }
      }
    },
    [fields, tDesigner],
  );

  const renderContextValue = useMemo(
    () => ({
      mode: 'design' as const,
      selectedNodeId,
      onSelectNode: selectNode,
    }),
    [selectedNodeId, selectNode],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const layout = useCanvasStore.getState().layout;
      if (viewType === 'form') {
        handleFormDragEnd(event, layout, addNode, moveNode, selectNode, fields, entities);
      } else {
        handleListDragEnd(event, layout.children, addNode, moveNode, selectNode, fields);
      }
    },
    [viewType, addNode, moveNode, selectNode, fields, entities],
  );

  const handleTogglePreview = useCallback(() => {
    setPreviewMode((prev) => !prev);
  }, []);

  return (
    <div className="flex flex-col w-full overflow-hidden" style={{ height: 'calc(100vh - 8.5rem)' }}>
      {/* Toolbar */}
      <DesignerToolbar
        appId={appId}
        modelId={modelId}
        appName={appName}
        modelName={modelName}
        previewMode={previewMode}
        onTogglePreview={handleTogglePreview}
      />

      {previewMode ? (
        /* Preview: full-width runtime rendering */
        <div className="flex-1 overflow-hidden">
          <PreviewMode layout={layout} viewType={viewType} fields={fields} entities={entities} />
        </div>
      ) : (
        /* Design: 3-panel layout wrapped in DndContext */
        <DndContext
          sensors={sensors}
          collisionDetection={customCollision}
          onDragStart={handleDragStart}
          onDragEnd={(event) => { setActiveDragLabel(null); handleDragEnd(event); }}
        >
          <div className="flex flex-1 overflow-hidden w-full">
            {/* Left Panel */}
            <div className="flex w-[240px] flex-col border-r bg-background overflow-y-auto overflow-x-hidden">
              <ComponentPanel fields={fields} entities={entities} viewType={viewType} />
            </div>

            {/* Center Canvas */}
            <div className="flex-1 w-0 overflow-y-auto overflow-x-hidden bg-muted/30">
              <DesignerContext.Provider value={renderContextValue}>
                {viewType === 'form' ? (
                  <FormCanvas fields={fields} entities={entities} />
                ) : (
                  <ListCanvas fields={fields} />
                )}
              </DesignerContext.Provider>
            </div>

            {/* Right Panel */}
            <div className="w-[280px] border-l bg-background overflow-y-auto">
              <PropertyPanel fields={fields} />
            </div>
          </div>

          {/* Drag overlay — renders in portal, not clipped by overflow */}
          <DragOverlay dropAnimation={null}>
            {activeDragLabel && (
              <div className="rounded-md border bg-background px-3 py-2 text-sm shadow-lg">
                {activeDragLabel}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
