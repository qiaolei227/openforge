'use client';

import { useState, useMemo, useCallback, useEffect, type ComponentType } from 'react';
import type { Field, FieldType } from '@openforge/shared';
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

  // ONE_TO_ONE mode: single record form
  if (meta.isOneToOne) {
    const record = rows[0] ?? null;
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-medium">{meta.entityName}</h4>
          {isEditable && !record && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-accent"
              onClick={handleAddRow}
            >
              <PlusIcon />
              {t('subTable.create')}
            </button>
          )}
          {isEditable && record && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => handleDeleteRows([0])}
            >
              <Trash2Icon />
              {t('subTable.remove')}
            </button>
          )}
        </div>
        {record && (
          <div className="grid grid-cols-2 gap-4">
            {visibleFields.map((field) => (
              <div key={field.id}>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {field.name}
                  {field.isRequired && <span className="ml-0.5 text-destructive">*</span>}
                </label>
                <EditableCell
                  field={field}
                  value={record[field.columnName]}
                  onChange={(val) => handleCellChange(0, field.columnName, val)}
                  disabled={!isEditable}
                  extraProps={buildFieldExtraProps?.(field, record ?? {})}
                />
              </div>
            ))}
          </div>
        )}
        {!record && (
          <p className="text-sm text-muted-foreground">{t('subTable.empty')}</p>
        )}
      </div>
    );
  }

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
        <h4 className="text-sm font-medium">{meta.entityName}</h4>
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {isEditable && (
                <th className="w-10 px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selectedRows.size === rows.length}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </th>
              )}
              <th className="w-10 px-2 py-2 text-center text-muted-foreground">#</th>
              {visibleFields.map((field) => (
                <th
                  key={field.id}
                  className="px-3 py-2 text-left font-medium text-muted-foreground"
                >
                  {field.name}
                  {field.isRequired && <span className="ml-0.5 text-destructive">*</span>}
                </th>
              ))}
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
                  <td key={field.id} className="px-3 py-1.5">
                    <EditableCell
                      field={field}
                      value={row[field.columnName]}
                      onChange={(val) => handleCellChange(rowIndex, field.columnName, val)}
                      disabled={!isEditable}
                      extraProps={buildFieldExtraProps?.(field, row)}
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
