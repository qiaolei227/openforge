'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useDroppable, useDndContext } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2, Plus, GripVertical, ChevronDown, ChevronRight } from 'lucide-react';
import type { Field, LayoutNode, SysEntity } from '@openforge/shared';
import { useCanvasStore } from './canvas-store';
import { generateId } from './designer-layout';
import { UnplacedFieldsBanner } from './unplaced-fields-banner';

/* ------------------------------------------------------------------ */
/*  Sortable Field Item                                                */
/* ------------------------------------------------------------------ */

interface SortableFieldProps {
  node: LayoutNode;
  fields: Field[];
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function SortableField({ node, fields, isSelected, onSelect }: SortableFieldProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id! });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: transition ?? 'transform 250ms ease, opacity 200ms ease',
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
    gridColumn: node.props?.span && node.props.span > 1 ? `span ${node.props.span}` : undefined,
  };

  const field = fields.find((f) => f.id === node.props?.fieldId);
  const label = field?.name ?? node.props?.fieldId ?? '?';
  // View-level required: null = inherit from model, true/false = override
  const viewRequired = node.props?.required;
  const isRequired = viewRequired !== null && viewRequired !== undefined ? viewRequired : field?.isRequired;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id!);
      }}
      className={`group rounded-md border-2 p-3 cursor-pointer ${
        isSelected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-dashed border-border hover:border-primary/40 hover:bg-muted/30'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 text-muted-foreground/50 hover:text-muted-foreground"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <span className="flex-1 text-xs font-medium text-foreground truncate">
          {label}
          {isRequired && <span className="text-red-500 ml-0.5">*</span>}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            useCanvasStore.getState().removeNode(node.id!);
          }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-950 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-red-600" />
        </button>
      </div>
      <div className="h-7 rounded bg-muted/50" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sortable Grid Section                                              */
/* ------------------------------------------------------------------ */

interface SortableGridProps {
  node: LayoutNode;
  fields: Field[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

function SortableGrid({ node, fields, selectedNodeId, onSelectNode }: SortableGridProps) {
  const t = useTranslations('designer');
  const isSelected = selectedNodeId === node.id;
  const cols = node.props?.cols ?? 4;
  const title = node.props?.title || t('untitledGrid');
  const collapsible = node.props?.collapsible ?? false;
  const [collapsed, setCollapsed] = useState(false);
  const fieldChildren = node.children ?? [];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // Droppable zone within this grid for fields
  const { setNodeRef: setFieldDropRef, isOver: isFieldOver } = useDroppable({
    id: `grid-drop-${node.id}`,
    data: { type: 'grid-drop-zone', gridId: node.id },
  });

  // Only highlight when dragging a field, not a grid
  const { active: dndActive } = useDndContext();
  const dragData = dndActive?.data.current as Record<string, any> | undefined;
  const showFieldDropFeedback = isFieldOver && dragData?.type === 'Field';

  const childIds = useMemo(
    () => fieldChildren.map((c) => c.id!).filter(Boolean),
    [fieldChildren],
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/grid mb-3 rounded-lg border-2 bg-background transition-all cursor-pointer ${
        isSelected ? 'border-primary shadow-sm' : 'border-border hover:border-primary/40 hover:shadow-sm'
      }`}
      onClick={(e) => { e.stopPropagation(); onSelectNode(node.id!); }}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between border-b bg-muted/50 px-3 py-2 rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          {/* Drag handle */}
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 text-muted-foreground hover:text-foreground">
            <GripVertical className="h-4 w-4" />
          </div>
          {/* Collapse toggle */}
          {collapsible && (
            <button
              onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
          <span className="text-sm font-medium text-foreground">{title}</span>
          <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {cols} {t('columns')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              useCanvasStore.getState().removeNode(node.id!);
            }}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-950 transition-colors opacity-0 group-hover/grid:opacity-100"
          >
            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-red-600" />
          </button>
        </div>
      </div>

      {/* Content area with CSS grid */}
      <div ref={setFieldDropRef} className={`transition-all ${collapsed && collapsible ? 'h-0 overflow-hidden p-0' : 'p-3'} ${showFieldDropFeedback ? 'bg-primary/5' : ''}`}>
        <SortableContext items={childIds} strategy={rectSortingStrategy}>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          >
            {fieldChildren.map((child) => (
              <SortableField
                key={child.id}
                node={child}
                fields={fields}
                isSelected={selectedNodeId === child.id}
                onSelect={(id) => onSelectNode(id)}
              />
            ))}
          </div>
        </SortableContext>

        {/* Empty state / drop hint */}
        {fieldChildren.length === 0 && (
          <div
            className={`flex items-center justify-center rounded-md border border-dashed py-8 text-xs text-muted-foreground transition-colors ${
              showFieldDropFeedback ? 'border-primary bg-primary/5' : 'border-border'
            }`}
          >
            {t('dropFieldsHere')}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Form Canvas                                                        */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Sortable SubTable Section                                          */
/* ------------------------------------------------------------------ */

interface SortableSubTableProps {
  node: LayoutNode;
  fields: Field[];
  entities: SysEntity[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

function SortableSubTable({ node, fields, entities, selectedNodeId, onSelectNode }: SortableSubTableProps) {
  const t = useTranslations('designer');
  const removeNode = useCanvasStore((s) => s.removeNode);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isSelected = selectedNodeId === node.id;
  const entity = entities.find((e) => e.id === node.props?.entityId || e.code === node.props?.entityCode);
  const entityName = node.props?.title || entity?.name || node.props?.entityCode || 'SubTable';
  const entityType = node.props?.entityType || entity?.entityType || 'one_to_many';
  const cols = node.props?.cols ?? 4;
  const collapsible = node.props?.collapsible ?? false;
  const [collapsed, setCollapsed] = useState(false);
  const fieldChildren = node.children ?? [];

  // Droppable zone for fields within this SubTable
  const { setNodeRef: setFieldDropRef, isOver: isFieldOver } = useDroppable({
    id: `subtable-drop-${node.id}`,
    data: { type: 'subtable-drop-zone', subtableId: node.id },
  });

  const { active: dndActive } = useDndContext();
  const dragData = dndActive?.data.current as Record<string, any> | undefined;
  const showFieldDropFeedback = isFieldOver && dragData?.type === 'Field';

  const childIds = useMemo(
    () => fieldChildren.map((c) => c.id!).filter(Boolean),
    [fieldChildren],
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/subtable relative mb-4 rounded-lg overflow-hidden border-2 bg-background transition-all cursor-pointer ${
        isSelected ? 'border-primary shadow-sm' : 'border-border hover:border-primary/40 hover:shadow-sm'
      }`}
      onClick={(e) => { e.stopPropagation(); onSelectNode(node.id!); }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b bg-orange-50 dark:bg-orange-950/20 px-3 py-2">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </button>
        {collapsible && (
          <button
            onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
        <span className="text-sm font-medium">{entityName}</span>
        <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
          {entityType === 'one_to_many' ? '1:N' : '1:1'}
        </span>
        {entityType === 'one_to_one' && (
          <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {cols} {t('columns')}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); removeNode(node.id!); }}
          className="ml-auto text-muted-foreground hover:text-destructive opacity-0 group-hover/subtable:opacity-100 transition-opacity"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content area */}
      <div
        ref={setFieldDropRef}
        className={`transition-all ${collapsed && collapsible ? 'h-0 overflow-hidden p-0' : 'p-3'} ${showFieldDropFeedback ? 'bg-primary/5' : ''}`}
      >
        {entityType === 'one_to_one' ? (
          /* 1:1 — Grid layout, same as SortableGrid */
          <>
            <SortableContext items={childIds} strategy={rectSortingStrategy}>
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                {fieldChildren.map((child) => (
                  <SortableField
                    key={child.id}
                    node={child}
                    fields={fields}
                    isSelected={selectedNodeId === child.id}
                    onSelect={(id) => { onSelectNode(id); }}
                  />
                ))}
              </div>
            </SortableContext>
            {fieldChildren.length === 0 && (
              <div className={`flex items-center justify-center rounded-md border border-dashed py-8 text-xs text-muted-foreground transition-colors ${
                showFieldDropFeedback ? 'border-primary bg-primary/5' : 'border-border'
              }`}>
                {t('dropFieldsHere')}
              </div>
            )}
          </>
        ) : (
          /* 1:N — Table layout */
          <>
            <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
              {fieldChildren.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="text-xs" style={{ tableLayout: 'fixed' }}>
                    <thead>
                      <tr className="bg-muted/30">
                        <th className="h-7 w-8 border-b px-1 text-center text-muted-foreground">#</th>
                        {fieldChildren.map((child) => {
                          const field = fields.find((f) => f.id === child.props?.fieldId);
                          const isChildSelected = selectedNodeId === child.id;
                          const colWidth = child.props?.width ?? 150;
                          return (
                            <th
                              key={child.id}
                              onClick={(e) => { e.stopPropagation(); onSelectNode(child.id!); }}
                              style={{ width: colWidth }}
                              className={`group/col h-7 border-b px-2 text-left font-medium whitespace-nowrap cursor-pointer transition-colors ${
                                isChildSelected
                                  ? 'text-primary bg-primary/10'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                              }`}
                            >
                              <span className="flex items-center gap-1">
                                <span className="truncate">{field?.name ?? child.props?.fieldId ?? '?'}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    useCanvasStore.getState().removeNode(child.id!);
                                  }}
                                  className="shrink-0 ml-auto opacity-0 group-hover/col:opacity-100 transition-opacity text-muted-foreground hover:text-red-600"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="h-7 border-b px-1 text-center text-muted-foreground">1</td>
                        {fieldChildren.map((child) => (
                          <td key={child.id} style={{ width: child.props?.width ?? 150 }} className="h-7 border-b px-2">
                            <div className="h-5 rounded bg-muted/40" />
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={`flex items-center justify-center rounded-md border border-dashed py-8 text-xs text-muted-foreground transition-colors ${
                  showFieldDropFeedback ? 'border-primary bg-primary/5' : 'border-border'
                }`}>
                  {t('dropFieldsHere')}
                </div>
              )}
            </SortableContext>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Form Canvas                                                        */
/* ------------------------------------------------------------------ */

interface FormCanvasProps {
  fields: Field[];
  entities: SysEntity[];
}

export function FormCanvas({ fields, entities }: FormCanvasProps) {
  const t = useTranslations('designer');
  const layout = useCanvasStore((s) => s.layout);
  const addNode = useCanvasStore((s) => s.addNode);
  const addNodes = useCanvasStore((s) => s.addNodes);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const selectNode = useCanvasStore((s) => s.selectNode);

  const gridIds = useMemo(
    () => layout.children.map((c) => c.id!).filter(Boolean),
    [layout.children],
  );

  // Bottom drop zone for new grids
  const { setNodeRef: setBottomDropRef, isOver: isBottomOver } = useDroppable({
    id: 'canvas-bottom-drop',
    data: { type: 'canvas-bottom' },
  });

  // Detect drag type for conditional feedback
  const { active } = useDndContext();
  const activeData = active?.data.current as Record<string, any> | undefined;
  const isDraggingTopLevel = activeData?.type === 'Grid' || activeData?.type === 'SubTable';
  const bottomActive = isBottomOver && isDraggingTopLevel;

  return (
    <div
      className="min-h-full p-6"
      onClick={() => selectNode(null)}
    >
      <UnplacedFieldsBanner
        fields={fields}
        layout={layout}
        onAddAll={(fieldIds) => {
          const lastGrid = layout.children.filter((n) => n.type === 'Grid').pop();
          if (lastGrid?.id) {
            const baseIndex = lastGrid.children?.length ?? 0;
            addNodes(fieldIds.map((fieldId, i) => ({
              parentId: lastGrid.id!,
              node: { id: generateId(), type: 'Field', props: { fieldId, span: 1 } },
              index: baseIndex + i,
            })));
          } else {
            addNode(null, {
              id: generateId(),
              type: 'Grid',
              props: { title: '', cols: 4 },
              children: fieldIds.map((fieldId) => ({
                id: generateId(),
                type: 'Field',
                props: { fieldId, span: 1 },
              })),
            }, layout.children.length);
          }
        }}
      />
      <SortableContext items={gridIds} strategy={verticalListSortingStrategy}>
        {layout.children.map((node) =>
          node.type === 'SubTable' ? (
            <SortableSubTable key={node.id} node={node} fields={fields} entities={entities} selectedNodeId={selectedNodeId} onSelectNode={selectNode} />
          ) : (
            <SortableGrid
              key={node.id}
              node={node}
              fields={fields}
              selectedNodeId={selectedNodeId}
              onSelectNode={selectNode}
            />
          ),
        )}
      </SortableContext>

      {/* Empty canvas state */}
      {layout.children.length === 0 && (
        <div
          ref={setBottomDropRef}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-20 transition-colors ${
            bottomActive ? 'border-primary bg-primary/5' : 'border-border'
          }`}
        >
          <Plus className="mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t('dragGridHere')}</p>
        </div>
      )}

      {/* Bottom drop zone for adding grids (shown when grids exist) */}
      {layout.children.length > 0 && (
        <div
          ref={setBottomDropRef}
          className={`mt-3 flex items-center justify-center rounded-lg border-2 border-dashed py-8 transition-colors ${
            bottomActive ? 'border-primary bg-primary/5' : 'border-border/50'
          }`}
        >
          <Plus className="mr-1.5 h-4 w-4 text-muted-foreground/50" />
          <span className="text-xs text-muted-foreground/50">{t('dragGridHere')}</span>
        </div>
      )}
    </div>
  );
}
