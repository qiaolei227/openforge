'use client';

import { useState, useMemo, useCallback, useEffect, type ComponentType } from 'react';
import type { Field, FieldType } from '@openforge/shared';
import { DEFAULT_COLUMN_WIDTH } from '@openforge/render-engine';
import type { SubTableProps } from './sub-table-types';
import type { FieldComponentProps } from './field-props';
import { getFieldComponent } from './index';

/* ── Inline Icons (monochrome stroke SVG per CLAUDE.md) ── */

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}

function Trash2Icon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

/* ── Component cache ── */
const componentCache = new Map<string, ComponentType<FieldComponentProps>>();

/* ── Editable Cell ── */

interface EditableCellProps {
  field: Field;
  value: any;
  onChange: (value: any) => void;
  disabled: boolean;
  extraProps?: Record<string, any>;
}

function EditableCell({ field, value, onChange, disabled, extraProps }: EditableCellProps) {
  const [Component, setComponent] = useState<ComponentType<FieldComponentProps> | null>(
    () => componentCache.get(field.fieldType) ?? null,
  );

  useEffect(() => {
    if (Component) return;
    const loader = getFieldComponent(field.fieldType as FieldType);
    if (!loader) return;
    loader().then((mod) => {
      componentCache.set(field.fieldType, mod.default);
      setComponent(() => mod.default);
    });
  }, [field.fieldType, Component]);

  if (!Component) return <span className="text-muted-foreground text-sm">...</span>;

  return (
    <Component
      field={field}
      value={value}
      onChange={onChange}
      disabled={disabled}
      mode={disabled ? 'view' : 'edit'}
      {...extraProps}
    />
  );
}

/* ── SubTable Component ── */

export function SubTableField({ meta, rows, onChange, mode, disabled, t, buildFieldExtraProps }: SubTableProps) {
  const isEditable = mode !== 'view' && !disabled;
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // Filter visible fields: exclude system, FK, virtual, auto-number
  const visibleFields = useMemo(() => {
    return meta.targetFields.filter(
      (f) =>
        !f.isSystem &&
        !f.deletedAt &&
        f.columnName !== meta.fkColumnName &&
        f.fieldType !== 'AUTO_NUMBER',
    );
  }, [meta.targetFields, meta.fkColumnName]);

  const handleCellChange = useCallback(
    (rowIndex: number, columnName: string, value: any) => {
      const newRows = [...rows];
      newRows[rowIndex] = { ...newRows[rowIndex], [columnName]: value };
      onChange(newRows);
    },
    [rows, onChange],
  );

  const handleAddRow = useCallback(() => {
    const emptyRow: Record<string, any> = {};
    for (const f of visibleFields) {
      emptyRow[f.columnName] = f.defaultValue ?? null;
    }
    onChange([...rows, emptyRow]);
  }, [rows, onChange, visibleFields]);

  const handleDeleteRows = useCallback(
    (indices: number[]) => {
      const newRows = rows.filter((_, i) => !indices.includes(i));
      onChange(newRows);
    },
    [rows, onChange],
  );

  // ONE_TO_ONE mode: single record form — always present, no add/remove
  if (meta.isOneToOne) {
    // Auto-initialize empty row if none exists
    const record = rows[0] ?? (() => {
      const emptyRow: Record<string, any> = {};
      for (const f of visibleFields) {
        emptyRow[f.columnName] = f.defaultValue ?? null;
      }
      // Defer the onChange to avoid updating state during render
      setTimeout(() => onChange([emptyRow]), 0);
      return emptyRow;
    })();

    return (
      <div className="rounded-lg border bg-background">
        <div className="border-b bg-muted/30 px-4 py-2.5">
          <h3 className="text-sm font-medium text-foreground">{meta.entityName}</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4">
          {visibleFields.map((field) => {
            const fullWidth = field.fieldType === 'RICHTEXT' || field.fieldType === 'TEXT';
            return (
              <div key={field.id} className={fullWidth ? 'col-span-2' : ''}>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {field.name}
                  {field.isRequired && <span className="ml-0.5 text-destructive">*</span>}
                </label>
                <EditableCell
                  field={field}
                  value={record[field.columnName]}
                  onChange={(val) => handleCellChange(0, field.columnName, val)}
                  disabled={!isEditable}
                  extraProps={buildFieldExtraProps?.(field, record)}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // SubTable mode: inject entityContext for REFERENCE fields
  const buildCellExtraProps = useCallback(
    (field: Field, row: Record<string, any>, rowIndex: number) => {
      const base = buildFieldExtraProps?.(field, row) ?? {};
      if (field.fieldType === 'REFERENCE') {
        base.entityContext = {
          existingIds: [],
          /**
           * Receives ALL selected records as partial row data.
           * Assigns sequentially starting from the current row:
           * fills existing rows in order, appends new rows only
           * when past the end.
           */
          onBatchAddRows: (mappedRows: Record<string, any>[]) => {
            const updated = [...rows];
            const newRows: Record<string, any>[] = [];

            for (let i = 0; i < mappedRows.length; i++) {
              const targetIdx = rowIndex + i;
              if (targetIdx < updated.length) {
                updated[targetIdx] = { ...updated[targetIdx], ...mappedRows[i] };
              } else {
                newRows.push(mappedRows[i]);
              }
            }

            onChange([...updated, ...newRows]);
          },
        };
      }
      return base;
    },
    [buildFieldExtraProps, rows, onChange],
  );

  // SubTable mode: editable grid
  const toggleRow = (index: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedRows.size === rows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(rows.map((_, i) => i)));
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h4 className="text-sm font-medium">
          {meta.entityName}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {t('subTable.rowCount', { count: rows.length })}
          </span>
        </h4>
        <div className="flex items-center gap-2">
          {isEditable && (
            <button
              type="button"
              className={`inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-xs ${
                selectedRows.size > 0
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-muted-foreground cursor-not-allowed opacity-50'
              }`}
              disabled={selectedRows.size === 0}
              onClick={() => {
                handleDeleteRows([...selectedRows]);
                setSelectedRows(new Set());
              }}
            >
              <Trash2Icon />
              {t('subTable.deleteSelected')}
            </button>
          )}
          {isEditable && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-accent"
              onClick={handleAddRow}
            >
              <PlusIcon />
              {t('subTable.addRow')}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="max-h-[480px] overflow-auto">
        <table className="w-auto table-fixed text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              {isEditable && (
                <th className="border-b bg-muted px-2 py-2 text-center" style={{ width: 40, minWidth: 40, maxWidth: 40 }}>
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selectedRows.size === rows.length}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </th>
              )}
              <th className="border-b bg-muted px-2 py-2 text-center text-muted-foreground" style={{ width: 40, minWidth: 40, maxWidth: 40 }}>#</th>
              {visibleFields.map((field) => {
                const colW = DEFAULT_COLUMN_WIDTH[field.fieldType as FieldType] ?? 150;
                return (
                  <th
                    key={field.id}
                    className="border-b bg-muted px-3 py-2 text-left font-medium text-muted-foreground truncate"
                    style={{ width: colW, minWidth: colW, maxWidth: colW }}
                  >
                    {field.name}
                    {field.isRequired && <span className="ml-0.5 text-destructive">*</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={row.id ?? `new-${rowIndex}`}
                className="border-b last:border-b-0 hover:bg-muted/30"
              >
                {isEditable && (
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(rowIndex)}
                      onChange={() => toggleRow(rowIndex)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </td>
                )}
                <td className="px-2 py-1.5 text-center text-muted-foreground">
                  {rowIndex + 1}
                </td>
                {visibleFields.map((field) => (
                  <td key={field.id} className="px-3 py-1.5 overflow-hidden">
                    <EditableCell
                      field={field}
                      value={row[field.columnName]}
                      onChange={(val) => handleCellChange(rowIndex, field.columnName, val)}
                      disabled={!isEditable}
                      extraProps={buildCellExtraProps(field, row, rowIndex)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={visibleFields.length + (isEditable ? 2 : 1)}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {t('subTable.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
