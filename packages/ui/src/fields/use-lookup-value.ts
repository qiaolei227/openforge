import { useReferenceRecord } from '@openforge/render-engine';

/**
 * Subscribe to the form's reference-record cache and return the value of
 * `targetFieldColumnName` from the record currently selected into `sourceFieldName`.
 *
 * Returns null when the source field is not selected, or the target column
 * is not present in the cached record.
 */
export function useLookupValue(
  sourceFieldName: string,
  targetFieldColumnName: string,
): any {
  const record = useReferenceRecord(sourceFieldName);
  if (!record) return null;
  return record[targetFieldColumnName] ?? null;
}
