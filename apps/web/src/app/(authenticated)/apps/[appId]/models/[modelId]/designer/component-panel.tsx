'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useDraggable } from '@dnd-kit/core';

import type { Field, LayoutNode, SysEntity } from '@openforge/shared';
import { useCanvasStore } from './canvas-store';
import { fieldTypeBadgeClass } from './field-type-styles';

/* ------------------------------------------------------------------ */
/*  Helper: single-pass layout walk to collect placed IDs              */
/* ------------------------------------------------------------------ */

function collectPlacedIds(nodes: LayoutNode[]): {
  fieldIds: Set<string>;
  entityIds: Set<string>;
  entityFieldIds: Set<string>;
} {
  const fieldIds = new Set<string>();
  const entityIds = new Set<string>();
  const entityFieldIds = new Set<string>();

  function walk(list: LayoutNode[]) {
    for (const node of list) {
      if ((node.type === 'Field' || node.type === 'Column') && node.props?.fieldId) {
        fieldIds.add(node.props.fieldId);
      }
      if (node.type === 'SubTable') {
        if (node.props?.entityId) entityIds.add(node.props.entityId);
        for (const child of node.children ?? []) {
          if (child.type === 'Field' && child.props?.fieldId) {
            entityFieldIds.add(child.props.fieldId);
          }
        }
      }
      if (node.children) walk(node.children);
    }
  }
  walk(nodes);
  return { fieldIds, entityIds, entityFieldIds };
}

/* ------------------------------------------------------------------ */
/*  Draggable Items                                                    */
/* ------------------------------------------------------------------ */

function DraggableGridItem() {
  const t = useTranslations('designer');
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'new-grid',
    data: { type: 'Grid', isNew: true },
  });

  const style = isDragging ? { opacity: 0.4 } : undefined;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className="flex cursor-grab items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-sm hover:border-primary/50 hover:bg-muted/50 transition-colors active:cursor-grabbing"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="text-muted-foreground"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18" />
        <path d="M3 15h18" />
        <path d="M9 3v18" />
        <path d="M15 3v18" />
      </svg>
      <span>{t('grid')}</span>
    </div>
  );
}

interface DraggableFieldItemProps {
  field: Field;
  dragIdPrefix: string;
  nodeType: 'Field' | 'Column';
}

function DraggableFieldItem({ field, dragIdPrefix, nodeType }: DraggableFieldItemProps) {
  const tFields = useTranslations('fields');
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${dragIdPrefix}-${field.id}`,
    data: {
      type: nodeType,
      fieldId: field.id,
      fieldType: field.fieldType,
      columnName: field.columnName,
      name: field.name,
      isNew: true,
    },
  });

  const style = isDragging ? { opacity: 0.4 } : undefined;

  const badgeClass = fieldTypeBadgeClass[field.fieldType] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className="flex cursor-grab items-center gap-2 rounded-md border border-transparent bg-background px-3 py-1.5 text-sm hover:border-border hover:bg-muted/50 transition-colors active:cursor-grabbing"
    >
      <span className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight ${badgeClass}`}>
        {tFields(`type${field.fieldType}`)}
      </span>
      <span className="truncate">{field.name}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Draggable Entity Item (SubTable)                                   */
/* ------------------------------------------------------------------ */

interface DraggableEntityItemProps {
  entity: SysEntity;
}

function DraggableEntityItem({ entity }: DraggableEntityItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `new-subtable-${entity.id}`,
    data: {
      type: 'SubTable',
      entityId: entity.id,
      entityCode: entity.code,
      entityType: entity.entityType,
      name: entity.name,
      isNew: true,
    },
  });

  const style = isDragging ? { opacity: 0.4 } : undefined;

  const badgeClass = entity.entityType === 'one_to_many'
    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-400'
    : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-400';

  const badgeLabel = entity.entityType === 'one_to_many' ? '1:N' : '1:1';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className="flex cursor-grab items-center gap-2 rounded-md border border-transparent bg-background px-3 py-1.5 text-sm hover:border-border hover:bg-muted/50 transition-colors active:cursor-grabbing"
    >
      <span className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight ${badgeClass}`}>
        {badgeLabel}
      </span>
      <span className="truncate">{entity.name}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component Panel                                                    */
/* ------------------------------------------------------------------ */

interface ComponentPanelProps {
  fields: Field[];
  entities: SysEntity[];
  viewType: 'form' | 'list';
}

export function ComponentPanel({ fields, entities, viewType }: ComponentPanelProps) {
  const t = useTranslations('designer');
  const layout = useCanvasStore((s) => s.layout);

  const { fieldIds: placedFieldIds, entityIds: placedEntityIds, entityFieldIds: placedEntityFieldIds } = useMemo(
    () => collectPlacedIds(layout.children),
    [layout],
  );

  const availableFields = useMemo(
    () => fields.filter((f) => !f.isSystem && !f.deletedAt && !f.entityId && !placedFieldIds.has(f.id)),
    [fields, placedFieldIds],
  );

  const availableEntities = useMemo(
    () => entities.filter((e) => !placedEntityIds.has(e.id)),
    [entities, placedEntityIds],
  );

  const hasPlacedFields = placedFieldIds.size > 0;

  const placedEntities = useMemo(
    () => entities.filter((e) => placedEntityIds.has(e.id)),
    [entities, placedEntityIds],
  );

  if (viewType === 'form') {
    return (
      <div className="flex-1 p-3">
        {/* Layout Components */}
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('layoutComponents')}
        </h3>
        <div className="mb-4 space-y-1">
          <DraggableGridItem />
        </div>

        {/* Model Entities (sub tables) — below layout, above fields */}
        {availableEntities.length > 0 && (
          <>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('modelEntities')}
            </h3>
            <div className="mb-4 space-y-0.5">
              {availableEntities.map((entity) => (
                <DraggableEntityItem
                  key={entity.id}
                  entity={entity}
                />
              ))}
            </div>
          </>
        )}

        {/* Model Fields */}
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('modelFields')}
        </h3>
        <div className="space-y-0.5">
          {availableFields.map((field) => (
            <DraggableFieldItem
              key={field.id}
              field={field}
              dragIdPrefix="new-field"
              nodeType="Field"
            />
          ))}
          {availableFields.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">{t('allFieldsPlaced')}</p>
          )}
        </div>

        {hasPlacedFields && availableFields.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground/70">{t('placedFieldsHidden')}</p>
        )}

        {/* Entity Field Groups — for entities already on canvas */}
        {placedEntities.map((entity) => {
          const entityFieldsAll = fields.filter((f) => f.entityId === entity.id && !f.isSystem && !f.deletedAt);
          const unplacedEntityFields = entityFieldsAll.filter((f) => !placedEntityFieldIds.has(f.id));

          return (
            <div key={entity.id} className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('entityFieldsGroup', { name: entity.name })}
              </h3>
              <div className="space-y-0.5">
                {unplacedEntityFields.map((field) => (
                  <DraggableFieldItem
                    key={field.id}
                    field={field}
                    dragIdPrefix={`new-entity-field-${entity.id}`}
                    nodeType="Field"
                  />
                ))}
                {unplacedEntityFields.length === 0 && (
                  <p className="py-2 text-xs text-muted-foreground">{t('allEntityFieldsPlaced')}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // List view
  return (
    <div className="flex-1 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('availableFields')}
      </h3>
      <div className="space-y-0.5">
        {availableFields.map((field) => (
          <DraggableFieldItem
            key={field.id}
            field={field}
            dragIdPrefix="new-column"
            nodeType="Column"
          />
        ))}
        {availableFields.length === 0 && (
          <p className="py-2 text-xs text-muted-foreground">{t('allFieldsPlaced')}</p>
        )}
      </div>

      {hasPlacedFields && availableFields.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground/70">{t('placedFieldsHidden')}</p>
      )}
    </div>
  );
}
