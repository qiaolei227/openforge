import type { Field } from '@openforge/shared';
import type { ServiceContextValue } from '../context';

/**
 * Build the field-type-specific extra props (queryFn, targetAppCode, uploadFn, ...)
 * for a given field + current row/form data.
 *
 * Used by both FieldNode (main-form fields) and SubTableSection (1:N row cells)
 * so the two code paths stay in sync.
 */
export function buildFieldExtraProps(
  field: Field,
  services: ServiceContextValue,
  data: Record<string, any>,
): Record<string, any> {
  const extraProps: Record<string, any> = {};
  const columnName = field.columnName;

  if (field.fieldType === 'REFERENCE' && services.queryFn) {
    extraProps.queryFn = services.queryFn;
    const meta = services.relationMeta?.[columnName];
    if (meta) {
      extraProps.targetAppCode = meta.appCode;
      extraProps.targetModelCode = meta.modelCode;
      extraProps.targetModelName = meta.name;
    }
    extraProps.displayValue = data[`${columnName}__display`];
    if (services.fetchSchema) extraProps.fetchSchema = services.fetchSchema;
  }

  if (field.fieldType === 'MULTI_REFERENCE' && services.queryFn) {
    extraProps.queryFn = services.queryFn;
    const meta = services.relationMeta?.[columnName];
    if (meta) {
      extraProps.targetAppCode = meta.appCode;
      extraProps.targetModelCode = meta.modelCode;
      extraProps.targetModelName = meta.name;
    }
    extraProps.targetDisplayField = field.options?.targetDisplayField ?? 'name';
    const m2mData = data[`${columnName}__m2m`];
    if (m2mData) extraProps.value = m2mData;
    if (services.fetchSchema) extraProps.fetchSchema = services.fetchSchema;
  }

  if ((field.fieldType === 'USER' || field.fieldType === 'ORGANIZATION') && services.systemQueryFn) {
    extraProps.systemQueryFn = services.systemQueryFn;
    extraProps.displayValue = data[`${columnName}__display`];
  }

  if ((field.fieldType === 'FILE' || field.fieldType === 'IMAGE') && services.uploadFn) {
    extraProps.uploadFn = services.uploadFn;
    const filesData = services.fileData?.[`${columnName}__files`];
    if (filesData) extraProps.files = filesData;
  }

  if (services.t) {
    extraProps.t = services.t;
  }

  return extraProps;
}
