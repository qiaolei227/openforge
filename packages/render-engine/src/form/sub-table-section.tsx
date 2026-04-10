'use client';

import { useCallback, useMemo } from 'react';
import type { Field, LayoutNode } from '@openforge/shared';
import { SubTableField, type ChildrenMeta } from '@openforge/ui';
import { useRenderContext, useServiceContext } from '../hooks';
import { FieldNode } from './field-node';
import { buildFieldExtraProps } from './field-extra-props';

interface SubTableSectionProps {
  node: LayoutNode;
}

function resolveEntityFields(
  node: LayoutNode,
  fields: Field[],
  fieldMap: Map<string, Field>,
  entityId: string | undefined,
  entity?: { fields?: Field[] },
): { childNodes: LayoutNode[]; resolvedFields: Field[] } {
  const layoutChildren = node.children ?? [];

  // 1. Try layout children with fieldMap lookup
  if (layoutChildren.length > 0) {
    const resolved = layoutChildren
      .map((child) => ({ child, field: fieldMap.get(child.props?.fieldId ?? '') }))
      .filter((r): r is { child: LayoutNode; field: Field } => r.field != null);

    if (resolved.length > 0) {
      return {
        childNodes: resolved.map((r) => r.child),
        resolvedFields: resolved.map((r) => r.field),
      };
    }
  }

  // 2. Try root fields array filtered by entityId
  if (entityId) {
    const entityFields = fields.filter(
      (f) => f.entityId === entityId && !f.isSystem && !f.deletedAt,
    );
    if (entityFields.length > 0) {
      return {
        childNodes: entityFields.map((f) => ({
          id: f.id,
          type: 'Field',
          props: { fieldId: f.id, span: 1 },
        })),
        resolvedFields: entityFields,
      };
    }
  }

  // 3. Try entity.fields (from entities API response)
  if (entity?.fields) {
    const entityFields = entity.fields.filter(
      (f) => !f.isSystem && !f.deletedAt,
    );
    if (entityFields.length > 0) {
      return {
        childNodes: entityFields.map((f) => ({
          id: f.id,
          type: 'Field',
          props: { fieldId: f.id, span: 1 },
        })),
        resolvedFields: entityFields,
      };
    }
  }

  return { childNodes: [], resolvedFields: [] };
}

export function SubTableSection({ node }: SubTableSectionProps) {
  const { mode, fields, entities, fieldMap, t } = useRenderContext();
  const services = useServiceContext();
  const { childrenData, onChildrenChange } = services;

  // Build extra props for row cells — inject queryFn/targetAppCode/etc
  // the same way FieldNode does for main-form fields.
  const buildRowExtraProps = useCallback(
    (field: Field, rowData: Record<string, any>) => buildFieldExtraProps(field, services, rowData),
    [services],
  );

  const entity = entities.find(
    (e) => e.id === node.props?.entityId || e.code === node.props?.entityCode,
  );
  const entityId = node.props?.entityId ?? entity?.id;
  const entityCode = node.props?.entityCode ?? entity?.code ?? '';
  const isOneToOne = node.props?.entityType === 'one_to_one';
  const cols = node.props?.cols ?? 4;
  const title = node.props?.title || entity?.name || entityCode;

  const { childNodes, resolvedFields } = useMemo(
    () => resolveEntityFields(node, fields, fieldMap, entityId, entity),
    [node, fields, fieldMap, entityId, entity],
  );

  if (isOneToOne) {
    return (
      <div className="rounded-lg border bg-background">
        <div className="border-b bg-muted/30 px-4 py-2.5">
          <h3 className="text-sm font-medium text-foreground">
            {title}
            <span className="ml-2 text-xs font-normal text-muted-foreground">(1:1)</span>
          </h3>
        </div>
        {childNodes.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            {title}
          </div>
        ) : (
          <div
            className="grid gap-4 p-4"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          >
            {childNodes.map((child, i) => (
              <FieldNode
                key={child.id ?? child.props?.fieldId}
                node={child}
                field={resolvedFields[i]}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 1:N — delegate to SubTableField (it renders its own header)
  const meta: ChildrenMeta = {
    entityId: entityId ?? '',
    entityName: title,
    entityCode,
    targetTableName: entity?.tableName ?? '',
    fkColumnName: '',
    isOneToOne: false,
    targetFields: resolvedFields,
  };

  const rows = childrenData?.[entityCode] ?? [];
  const handleChange = (newRows: Record<string, any>[]) => {
    onChildrenChange?.(entityCode, newRows);
  };
  const subTableMode = mode === 'preview' ? 'create' : (mode === 'view' ? 'view' : mode);

  return (
    <SubTableField
      meta={meta}
      rows={rows}
      onChange={handleChange}
      mode={subTableMode}
      disabled={mode === 'view'}
      t={t}
      buildFieldExtraProps={buildRowExtraProps}
    />
  );
}
