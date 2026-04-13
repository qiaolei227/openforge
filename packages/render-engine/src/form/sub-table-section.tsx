'use client';

import { useCallback, useMemo } from 'react';
import type { Field, LayoutNode } from '@openforge/shared';
import { SubTableField, type ChildrenMeta } from '@openforge/ui';
import { useRenderContext, useServiceContext } from '../hooks';
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
): Field[] {
  const layoutChildren = node.children ?? [];

  // 1. Try layout children with fieldMap lookup
  if (layoutChildren.length > 0) {
    const resolved = layoutChildren
      .map((child) => fieldMap.get(child.props?.fieldId ?? ''))
      .filter((f): f is Field => f != null);

    if (resolved.length > 0) return resolved;
  }

  // 2. Try root fields array filtered by entityId
  if (entityId) {
    const entityFields = fields.filter(
      (f) => f.entityId === entityId && !f.isSystem && !f.deletedAt,
    );
    if (entityFields.length > 0) return entityFields;
  }

  // 3. Try entity.fields (from entities API response)
  if (entity?.fields) {
    const entityFields = entity.fields.filter(
      (f) => !f.isSystem && !f.deletedAt,
    );
    if (entityFields.length > 0) return entityFields;
  }

  return [];
}

/**
 * SubTableSection — renders both 1:1 and 1:N entities.
 *
 * Both modes delegate to SubTableField which manages data through
 * childrenData/onChildrenChange, ensuring entity field values never
 * leak into the main record's formData.
 */
export function SubTableSection({ node }: SubTableSectionProps) {
  const { mode, fields, entities, fieldMap, t } = useRenderContext();
  const services = useServiceContext();
  const { childrenData, onChildrenChange } = services;

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
  const title = node.props?.title || entity?.name || entityCode;

  const resolvedFields = useMemo(
    () => resolveEntityFields(node, fields, fieldMap, entityId, entity),
    [node, fields, fieldMap, entityId, entity],
  );

  const meta: ChildrenMeta = {
    entityId: entityId ?? '',
    entityName: title,
    entityCode,
    targetTableName: entity?.tableName ?? '',
    fkColumnName: '',
    isOneToOne,
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
