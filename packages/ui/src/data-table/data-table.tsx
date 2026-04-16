'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import type { Field, FieldType } from '@openforge/shared';
import { DEFAULT_COLUMN_WIDTH } from '@openforge/render-engine';
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
  /** When true, the built-in DataTableToolbar is hidden (caller renders its own toolbar) */
  hideToolbar?: boolean;
  /** Called whenever the set of selected row IDs changes */
  onSelectionChange?: (selectedIds: string[], selectedRecords: Record<string, any>[]) => void;
  /** Called on row double-click (distinct from single-click) */
  onRowDoubleClick?: (record: Record<string, any>) => void;
  /** Extra columns prepended after checkbox + row number (e.g. data_status) */
  extraColumns?: ColumnDef<Record<string, any>>[];
  /** Columns appended after business fields (e.g. expanded detail fields) */
  trailingColumns?: ColumnDef<Record<string, any>>[];
  /** Column name to render as a clickable link (defaults to first visible field when onLinkClick is set) */
  linkColumnName?: string;
  /** Called when the link cell is clicked — opens record detail */
  onLinkClick?: (record: Record<string, any>) => void;
  /** Called when user changes page size via the pagination dropdown */
  onPageSizeChange?: (size: number) => void;
  /** Rendered in the table header's rightmost cell (e.g. column settings gear) */
  headerEndSlot?: React.ReactNode;
  /** Row grouping: consecutive rows with the same key merge via rowSpan on grouped columns. */
  getRowGroupKey?: (row: Record<string, any>) => string | null;
  /** IDs of columns that merge (rowSpan) within a group. Only first row in a group renders these cells. */
  groupedColumnIds?: string[];
  /** Override row ID (for selection). Default: row.id. */
  getRowId?: (row: Record<string, any>) => string;
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
  hideToolbar,
  onSelectionChange,
  onRowDoubleClick,
  extraColumns,
  trailingColumns,
  linkColumnName,
  onLinkClick,
  onPageSizeChange,
  headerEndSlot,
  getRowGroupKey,
  groupedColumnIds,
  getRowId,
}: DataTableProps) {
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searching, setSearching] = useState(false);

  // Clear selection when data changes
  useEffect(() => {
    setRowSelection({});
  }, [data]);

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChange) {
      const ids = Object.keys(rowSelection).filter((k) => rowSelection[k]);
      const records = data.filter((r) => ids.includes(r.id));
      onSelectionChange(ids, records);
    }
  }, [rowSelection]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Determine which column renders as a clickable link
  const effectiveLinkColumn = linkColumnName ?? (onLinkClick ? visibleFields[0]?.columnName : undefined);

  const columns = useMemo<ColumnDef<Record<string, any>>[]>(() => {
    const cols: ColumnDef<Record<string, any>>[] = [];

    // Checkbox column
    cols.push({
      id: '_select',
      size: 40,
      minSize: 40,
      maxSize: 40,
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
      size: 48,
      minSize: 48,
      maxSize: 48,
      header: () => <span className="text-muted-foreground">#</span>,
      cell: ({ row }) => {
        const mIdx = row.original.__masterIndex;
        const idx = typeof mIdx === 'number' ? mIdx : row.index;
        return (
          <span className="text-muted-foreground text-xs">
            {(page - 1) * pageSize + idx + 1}
          </span>
        );
      },
    });

    // Extra columns (e.g. data_status badge, 1:1 fields) — after checkbox + row number
    if (extraColumns) {
      cols.push(...extraColumns);
    }

    // Business field columns
    for (const field of visibleFields) {
      const lc = layoutColumnMap?.get(field.id);
      const colWidth = lc?.width ?? DEFAULT_COLUMN_WIDTH[field.fieldType as FieldType] ?? 150;
      const colLabel = lc?.label || field.name;

      cols.push({
        id: field.columnName,
        size: colWidth,
        minSize: colWidth,
        maxSize: colWidth,
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
        cell: ({ row }) => {
          const cellValue = row.original[field.columnName];
          const content = renderCell(field, cellValue, row.original);
          if (effectiveLinkColumn === field.columnName && onLinkClick && cellValue != null) {
            // Render link cell as plain text to avoid child component color conflicts
            const displayText = row.original[`${field.columnName}__display`] ?? String(cellValue);
            return (
              <button
                type="button"
                className="text-primary hover:underline text-left truncate max-w-full cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onLinkClick(row.original);
                }}
              >
                {displayText}
              </button>
            );
          }
          return content;
        },
      });
    }

    // Trailing columns (e.g. 1:N detail fields) — appended after business columns
    if (trailingColumns) {
      cols.push(...trailingColumns);
    }

    return cols;
  }, [visibleFields, sortField, sortOrder, handleSort, renderCell, page, pageSize, layoutColumnMap, effectiveLinkColumn, onLinkClick, extraColumns, trailingColumns]);

  const table = useReactTable({
    data,
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    getRowId: (row) => (getRowId ? getRowId(row) : row.id),
    rowCount: total,
  });

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);

  /* Precompute group info (for rowSpan rendering) */
  const groupInfo = useMemo(() => {
    if (!getRowGroupKey) return null;
    const info: Array<{ isFirst: boolean; groupSize: number }> = new Array(data.length);
    let i = 0;
    while (i < data.length) {
      const key = getRowGroupKey(data[i]);
      if (key == null) {
        info[i] = { isFirst: true, groupSize: 1 };
        i += 1;
        continue;
      }
      let j = i + 1;
      while (j < data.length && getRowGroupKey(data[j]) === key) j += 1;
      const size = j - i;
      for (let k = i; k < j; k += 1) {
        info[k] = { isFirst: k === i, groupSize: k === i ? size : 0 };
      }
      i = j;
    }
    return info;
  }, [data, getRowGroupKey]);

  const groupedColumnSet = useMemo(
    () => (groupedColumnIds ? new Set(groupedColumnIds) : null),
    [groupedColumnIds],
  );

  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden bg-background">
      {!hideToolbar && (
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
      )}

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-auto table-fixed text-sm">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted">
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
                {headerEndSlot && (
                  <th className="h-10 w-10 px-1 text-center bg-muted sticky right-0">{headerEndSlot}</th>
                )}
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
            {table.getRowModel().rows.map((row, rowIdx) => {
              const gi = groupInfo ? groupInfo[rowIdx] : null;
              const isFirstInGroup = gi ? gi.isFirst : true;
              // Add thicker divider before a new group (except the very first row)
              const isGroupBoundary = gi && isFirstInGroup && rowIdx > 0;
              return (
                <tr
                  key={row.id}
                  className={`hover:bg-muted/50 transition-colors ${
                    isFirstInGroup ? (isGroupBoundary ? 'border-t-2 border-border' : '') : ''
                  } ${!gi || gi.isFirst ? 'border-b' : 'border-b border-dashed border-muted/60'} ${
                    row.original.is_archived ? 'opacity-60' : ''
                  } ${row.getIsSelected() ? 'bg-muted/30' : ''}`}
                  onClick={() => onRowClick(row.original)}
                  onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => {
                    const colId = cell.column.id;
                    const isGrouped = groupedColumnSet?.has(colId) ?? false;
                    // If cell belongs to a grouped column and this isn't the first row in the group, skip it
                    if (isGrouped && gi && !gi.isFirst) return null;
                    const rowSpan = isGrouped && gi ? gi.groupSize : undefined;
                    return (
                      <td
                        key={cell.id}
                        rowSpan={rowSpan}
                        className={`h-10 px-2 whitespace-nowrap overflow-hidden text-ellipsis max-w-[300px] ${
                          isGrouped ? 'align-top pt-2' : ''
                        }`}
                        style={{ width: cell.column.getSize(), minWidth: cell.column.columnDef.minSize, maxWidth: cell.column.columnDef.maxSize }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                  {headerEndSlot && isFirstInGroup && (
                    <td className="w-10" rowSpan={gi ? gi.groupSize : undefined} />
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DataTablePagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        t={t}
      />
    </div>
  );
}
