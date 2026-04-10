'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import type { Field, FieldType } from '@openforge/shared';
import { DataTableToolbar } from './data-table-toolbar';
import { DataTablePagination } from './data-table-pagination';

/* ── Inline SVG icons ── */
function ChevronUpIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ChevronsUpDownIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="opacity-40">
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  );
}

/* ── Column width map ── */
const COLUMN_WIDTH: Partial<Record<FieldType, number>> = {
  STRING: 150,
  ENUM: 150,
  MULTI_ENUM: 150,
  TEXT: 200,
  RICHTEXT: 200,
  INTEGER: 120,
  DECIMAL: 120,
  BOOLEAN: 80,
  DATE: 120,
  DATETIME: 180,
  TIME: 100,
  REFERENCE: 180,
  USER: 150,
  ORGANIZATION: 150,
  AUTO_NUMBER: 140,
};

/** Optional per-column config from a saved list layout. */
export interface LayoutColumnConfig {
  fieldId: string;
  label?: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  fixed?: string | null;
}

export interface DataTableProps {
  fields: Field[];
  data: Record<string, any>[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  keyword: string;
  includeArchived: boolean;
  onKeywordChange: (keyword: string) => void;
  onPageChange: (page: number) => void;
  onArchiveToggle: () => void;
  onSortChange: (field: string, order: 'asc' | 'desc') => void;
  onRowClick: (record: Record<string, any>) => void;
  onNew: () => void;
  onBatchArchive: (ids: string[]) => void;
  onBatchDelete: (ids: string[]) => void;
  renderCell: (field: Field, value: any, record?: Record<string, any>) => React.ReactNode;
  t: (key: string, values?: Record<string, any>) => string;
  /** When provided, overrides auto-generated column order/width/label from fields */
  layoutColumns?: LayoutColumnConfig[];
}

export function DataTable({
  fields,
  data,
  total,
  page,
  pageSize,
  loading,
  keyword,
  includeArchived,
  onKeywordChange,
  onPageChange,
  onArchiveToggle,
  onSortChange,
  onRowClick,
  onNew,
  onBatchArchive,
  onBatchDelete,
  renderCell,
  t,
  layoutColumns,
}: DataTableProps) {
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searching, setSearching] = useState(false);

  // Clear selection when data changes
  useEffect(() => {
    setRowSelection({});
  }, [data]);

  // Track searching state
  useEffect(() => {
    if (loading) {
      setSearching(true);
    } else {
      setSearching(false);
    }
  }, [loading]);

  // Sort visible fields: use layoutColumns order if provided, else AUTO_NUMBER first then sortOrder
  const visibleFields = useMemo(() => {
    if (layoutColumns && layoutColumns.length > 0) {
      // Map layout column order to fields
      const fieldMap = new Map(fields.map((f) => [f.id, f]));
      return layoutColumns
        .map((lc) => fieldMap.get(lc.fieldId))
        .filter((f): f is Field => f != null && !f.isSystem && !f.deletedAt);
    }
    return fields
      .filter((f) => !f.isSystem && !f.deletedAt)
      .sort((a, b) => {
        if (a.fieldType === 'AUTO_NUMBER' && b.fieldType !== 'AUTO_NUMBER') return -1;
        if (a.fieldType !== 'AUTO_NUMBER' && b.fieldType === 'AUTO_NUMBER') return 1;
        return a.sortOrder - b.sortOrder;
      });
  }, [fields, layoutColumns]);

  // Build a lookup for layout column overrides by fieldId
  const layoutColumnMap = useMemo(() => {
    if (!layoutColumns) return null;
    const map = new Map<string, LayoutColumnConfig>();
    for (const lc of layoutColumns) {
      map.set(lc.fieldId, lc);
    }
    return map;
  }, [layoutColumns]);

  const handleSort = useCallback(
    (columnName: string) => {
      let newOrder: 'asc' | 'desc' = 'asc';
      if (sortField === columnName) {
        newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      }
      setSortField(columnName);
      setSortOrder(newOrder);
      onSortChange(columnName, newOrder);
    },
    [sortField, sortOrder, onSortChange],
  );

  const columns = useMemo<ColumnDef<Record<string, any>>[]>(() => {
    const cols: ColumnDef<Record<string, any>>[] = [];

    // Checkbox column
    cols.push({
      id: '_select',
      size: 28,
      minSize: 28,
      maxSize: 28,
      header: ({ table }) => (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input accent-primary"
          checked={table.getIsAllPageRowsSelected()}
          onChange={(e) => {
            e.stopPropagation();
            table.toggleAllPageRowsSelected(!!e.target.checked);
          }}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input accent-primary"
          checked={row.getIsSelected()}
          onChange={(e) => {
            e.stopPropagation();
            row.toggleSelected(!!e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    });

    // Row number column
    cols.push({
      id: '_row_number',
      size: 32,
      minSize: 32,
      maxSize: 32,
      header: () => <span className="text-muted-foreground">#</span>,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">
          {(page - 1) * pageSize + row.index + 1}
        </span>
      ),
    });

    // Business field columns
    for (const field of visibleFields) {
      const lc = layoutColumnMap?.get(field.id);
      const colWidth = lc?.width ?? COLUMN_WIDTH[field.fieldType] ?? 150;
      const colLabel = lc?.label || field.name;

      cols.push({
        id: field.columnName,
        size: colWidth,
        header: () => (
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors w-full text-left"
            onClick={(e) => {
              e.stopPropagation();
              handleSort(field.columnName);
            }}
          >
            <span className="truncate">{colLabel}</span>
            {sortField === field.columnName ? (
              sortOrder === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />
            ) : (
              <ChevronsUpDownIcon />
            )}
          </button>
        ),
        cell: ({ row }) => renderCell(field, row.original[field.columnName], row.original),
      });
    }

    return cols;
  }, [visibleFields, sortField, sortOrder, handleSort, renderCell, page, pageSize, layoutColumnMap]);

  const table = useReactTable({
    data,
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    getRowId: (row) => row.id,
    rowCount: total,
  });

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden bg-background">
      <DataTableToolbar
        selectedCount={selectedIds.length}
        searchValue={keyword}
        onSearchChange={onKeywordChange}
        searching={searching && keyword.length > 0}
        includeArchived={includeArchived}
        onArchiveToggle={onArchiveToggle}
        onNew={onNew}
        onBatchArchive={() => onBatchArchive(selectedIds)}
        onBatchDelete={() => onBatchDelete(selectedIds)}
        onClearSelection={() => setRowSelection({})}
        t={t}
      />

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/40">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="h-10 px-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap"
                    style={{ width: header.getSize(), minWidth: header.column.columnDef.minSize, maxWidth: header.column.columnDef.maxSize }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {/* Loading skeleton */}
            {loading && data.length === 0 && (
              <>
                {Array.from({ length: 5 }).map((_, rowIdx) => (
                  <tr key={`skeleton-${rowIdx}`} className="border-b">
                    {columns.map((col, colIdx) => (
                      <td key={`skeleton-${rowIdx}-${colIdx}`} className="h-10 px-3">
                        <div className="h-4 rounded bg-muted animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            )}

            {/* Empty state */}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  {t('dataTab.noData')}
                </td>
              </tr>
            )}

            {/* Data rows */}
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b hover:bg-muted/50 cursor-pointer transition-colors ${
                  row.original.is_archived ? 'opacity-60' : ''
                } ${row.getIsSelected() ? 'bg-muted/30' : ''}`}
                onClick={() => onRowClick(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="h-10 px-2 whitespace-nowrap overflow-hidden text-ellipsis max-w-[300px]"
                    style={{ width: cell.column.getSize(), minWidth: cell.column.columnDef.minSize, maxWidth: cell.column.columnDef.maxSize }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DataTablePagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        t={t}
      />
    </div>
  );
}
