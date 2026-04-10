'use client';

import { useState, useCallback, useRef } from 'react';
import type { Field } from '@openforge/shared';

interface FileInfo {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

interface FileFieldProps {
  field: Field;
  value: string[] | null;
  onChange: (value: string[]) => void;
  disabled?: boolean;
  mode: 'edit' | 'view';
  files?: FileInfo[];
  uploadFn?: (file: File) => Promise<{ id: string; originalName: string; url: string }>;
}

function UploadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function Loader2Icon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileField({ field, value, onChange, disabled, mode, files, uploadFn }: FileFieldProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileIds = value ?? [];
  const fileList = files ?? [];
  const options = field.options as any;
  const maxCount = options?.maxCount ?? 10;
  const accept = options?.accept ?? '';
  const canUpload = mode === 'edit' && !disabled && fileIds.length < maxCount;

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || !uploadFn) return;

    setUploading(true);
    try {
      const results = await Promise.all(
        Array.from(selectedFiles).map((file) => uploadFn(file)),
      );
      const newIds = results.map((r) => r.id);
      onChange([...fileIds, ...newIds]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [fileIds, onChange, uploadFn]);

  const handleRemove = useCallback((fileId: string) => {
    onChange(fileIds.filter((id) => id !== fileId));
  }, [fileIds, onChange]);

  if (mode === 'view') {
    if (fileList.length === 0) return <span className="text-sm text-muted-foreground">-</span>;
    return (
      <div className="space-y-1">
        {fileList.map((f) => (
          <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary hover:underline">
            <FileIcon />
            {f.originalName}
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {fileList.map((f) => (
        <div key={f.id} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
          <FileIcon />
          <span className="flex-1 truncate">{f.originalName}</span>
          <span className="text-xs text-muted-foreground">{formatFileSize(f.size)}</span>
          {!disabled && (
            <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => handleRemove(f.id)}>
              <XIcon />
            </button>
          )}
        </div>
      ))}
      {canUpload && (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 bg-background px-4 py-6 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors">
          {uploading ? <Loader2Icon /> : <UploadIcon />}
          {uploading ? '...' : ''}
          <input ref={inputRef} type="file" className="hidden" accept={accept} multiple={maxCount > 1}
            onChange={handleFileSelect} disabled={uploading || disabled} />
        </label>
      )}
    </div>
  );
}
