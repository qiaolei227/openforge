'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ApiQueryFn } from './field-props';

export interface RelationPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (record: Record<string, any>) => void;
  appCode: string;
  modelCode: string;
  displayField: string;
  title: string;
  queryFn: ApiQueryFn;
}

const INPUT_BASE =
  'flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs border-input disabled:cursor-not-allowed disabled:opacity-50';

const BTN_BASE = 'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors';
const BTN_PRIMARY = `${BTN_BASE} bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none`;
const BTN_OUTLINE = `${BTN_BASE} border border-input bg-transparent hover:bg-accent hover:text-accent-foreground`;

export default function RelationPickerDialog({
  open,
  onClose,
  onSelect,
  appCode,
  modelCode,
  displayField,
  title,
  queryFn,
}: RelationPickerDialogProps) {
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);

  const pageSize = 10;
  const totalPages = Math.ceil(total / pageSize);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setKeyword('');
      setPage(1);
      setSelectedRecord(null);
      setData([]);
      setTotal(0);
    }
  }, [open]);

  // Fetch data on keyword or page change
  const fetchData = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const result = await queryFn(
        { appCode, modelCode },
        { keyword: keyword || undefined, page, pageSize, includeArchived: false },
      );
      setData(result.data);
      setTotal(result.total);
    } catch {
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [open, queryFn, appCode, modelCode, keyword, page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleConfirm() {
    if (selectedRecord) {
      onSelect(selectedRecord);
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-lg border bg-background shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            type="button"
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <input
            type="text"
            className={INPUT_BASE}
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            placeholder="Search..."
          />
        </div>

        {/* List */}
        <div className="max-h-64 overflow-y-auto px-4">
          {loading && data.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : data.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No records found</div>
          ) : (
            <div className="space-y-0.5">
              {data.map((record) => {
                const isSelected = selectedRecord?.id === record.id;
                return (
                  <button
                    key={record.id}
                    type="button"
                    className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? 'bg-primary/5 text-primary'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setSelectedRecord(record)}
                  >
                    {record[displayField] ?? record.id}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 border-t px-4 py-2">
            <button
              type="button"
              className={`${BTN_OUTLINE} px-2 py-1 text-xs`}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              className={`${BTN_OUTLINE} px-2 py-1 text-xs`}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <button type="button" className={BTN_OUTLINE} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={BTN_PRIMARY} disabled={!selectedRecord} onClick={handleConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
