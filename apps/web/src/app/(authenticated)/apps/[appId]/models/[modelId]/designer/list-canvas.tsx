'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useDroppable, useDndContext } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import type { Field, LayoutNode } from '@openforge/shared';
import { useCanvasStore } from './canvas-store';
import { generateId } from './designer-layout';

import { UnplacedFieldsBanner } from './unplaced-fields-banner';

/* ------------------------------------------------------------------ */
/*  Sortable Column Header                                             */
/* ------------------------------------------------------------------ */

interface SortableColumnHeaderProps {
  node: LayoutNode;
  fields: Field[];
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function SortableColumnHeader({ node, fields, isSelected, onSelect }: SortableColumnHeaderProps) {
  const field = fields.find((f) => f.id === node.props?.fieldId);
  const label = node.props?.label || field?.name || '?';
  const width = node.props?.width ?? 150;

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
    width: `${width}px`,
    minWidth: `${width}px`,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id!);
      }}
      className={`group/col relative h-9 cursor-pointer select-none border-b border-r bg-muted/50 px-3 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted ${
        isSelected ? 'border-l-2 border-l-primary bg-primary/5' : ''
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical className="h-3 w-3 text-muted-foreground/50" />
        </span>
        <span className="flex-1 truncate">{label}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            useCanvasStore.getState().removeNode(node.id!);
          }}
          className="shrink-0 opacity-0 group-hover/col:opacity-100 hover:text-red-600 transition-all"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </th>
  );
}

/* ------------------------------------------------------------------ */
/*  Mock Table Cell                                                    */
/* ------------------------------------------------------------------ */

interface MockCellProps {
  node: LayoutNode;
  fields: Field[];
}

function MockCell({ node }: MockCellProps) {
  const width = node.props?.width ?? 150;

  return (
    <td
      className="h-9 border-b border-r px-3"
      style={{ width: `${width}px`, minWidth: `${width}px` }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  List Canvas                                                        */
/* ------------------------------------------------------------------ */

interface ListCanvasProps {
  fields: Field[];
}

export function ListCanvas({ fields }: ListCanvasProps) {
  const t = useTranslations('designer');
  const layout = useCanvasStore((s) => s.layout);
  const addNodes = useCanvasStore((s) => s.addNodes);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const selectNode = useCanvasStore((s) => s.selectNode);

  const columns = layout.children;
  const columnIds = useMemo(
    () => columns.map((c) => c.id!).filter(Boolean),
    [columns],
  );

  // Whole table is the drop zone for new columns
  const { setNodeRef: setEndDropRef, isOver: isEndOver } = useDroppable({
    id: 'column-end-drop',
    data: { type: 'column-end' },
  });

  // Only highlight when dragging a column from panel
  const { active: dndActive } = useDndContext();
  const dragData = dndActive?.data.current as Record<string, any> | undefined;
  const showDropFeedback = isEndOver && dragData?.type === 'Column' && dragData?.isNew;

  const mockRows = [0, 1, 2];

  return (
    <div className="min-h-full p-6" onClick={() => selectNode(null)}>
      <UnplacedFieldsBanner
        fields={fields}
        layout={layout}
        onAddAll={(fieldIds) => {
          const baseIndex = layout.children.length;
          addNodes(fieldIds.map((fieldId, i) => {
            const field = fields.find((f) => f.id === fieldId);
            return {
              parentId: null,
              node: { id: generateId(), type: 'Column', props: { fieldId, label: field?.name ?? '' } },
              index: baseIndex + i,
            };
          }));
        }}
      />
      <div ref={setEndDropRef} className={`overflow-x-auto rounded-lg border bg-background mt-3 transition-colors ${showDropFeedback ? 'border-primary bg-primary/5' : ''}`}>
        {columns.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
            {t('dragColumnsHere')}
          </div>
        ) : (
        <table className="border-collapse">
          <thead>
            <tr>
              {/* Fixed: checkbox column */}
              <th className="h-9 w-7 min-w-[28px] border-b border-r bg-muted/50 px-2 text-center">
                <div className="flex items-center justify-center">
                  <div className="h-3.5 w-3.5 rounded border border-muted-foreground/40" />
                </div>
              </th>
              {/* Fixed: row number */}
              <th className="h-9 w-8 min-w-[32px] border-b border-r bg-muted/50 px-2 text-center text-[10px] font-medium text-muted-foreground">
                #
              </th>
              {/* Dynamic sortable columns */}
              <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
                {columns.map((col) => (
                  <SortableColumnHeader
                    key={col.id}
                    node={col}
                    fields={fields}
                    isSelected={selectedNodeId === col.id}
                    onSelect={(id) => selectNode(id)}
                  />
                ))}
              </SortableContext>
            </tr>
          </thead>
          <tbody>
            {
              mockRows.map((rowIdx) => (
                <tr key={rowIdx} className="hover:bg-muted/30">
                  {/* Checkbox */}
                  <td className="h-9 border-b border-r px-2 text-center">
                    <div className="flex items-center justify-center">
                      <div className="h-3.5 w-3.5 rounded border border-muted-foreground/20" />
                    </div>
                  </td>
                  {/* Row number */}
                  <td className="h-9 border-b border-r px-2 text-center text-[10px] text-muted-foreground">
                    {rowIdx + 1}
                  </td>
                  {/* Dynamic columns */}
                  {columns.map((col) => (
                    <MockCell
                      key={col.id}
                      node={col}
                      fields={fields}
                    />
                  ))}
                </tr>
              ))
            }
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}
