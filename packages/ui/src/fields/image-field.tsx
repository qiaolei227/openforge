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

interface ImageFieldProps {
  field: Field;
  value: string[] | null;
  onChange: (value: string[]) => void;
  disabled?: boolean;
  mode: 'edit' | 'view';
  files?: FileInfo[];
  uploadFn?: (file: File) => Promise<{ id: string; originalName: string; url: string }>;
}

function ImagePlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
      <line x1="16" x2="22" y1="5" y2="5" />
      <line x1="19" x2="19" y1="2" y2="8" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
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

export default function ImageField({ field, value, onChange, disabled, mode, files, uploadFn }: ImageFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileIds = value ?? [];
  const fileList = files ?? [];
  const options = field.options as any;
  const maxCount = options?.maxCount ?? 9;
  const canUpload = mode === 'edit' && !disabled && fileIds.length < maxCount;

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || !uploadFn) return;

    setUploading(true);
    try {
      const imageFiles = Array.from(selectedFiles).filter((f) => f.type.startsWith('image/'));
      const results = await Promise.all(
        imageFiles.map((file) => uploadFn(file)),
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

  // View mode — image grid
  if (mode === 'view') {
    if (fileList.length === 0) return <span className="text-sm text-muted-foreground">-</span>;
    return (
      <>
        <div className="flex flex-wrap gap-2">
          {fileList.map((f) => (
            <button key={f.id} type="button"
              className="relative h-20 w-20 overflow-hidden rounded-md border bg-muted"
              onClick={() => setPreviewUrl(f.url)}>
              <img src={f.url} alt={f.originalName} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
        {previewUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPreviewUrl(null)}>
            <img src={previewUrl} alt="" className="max-h-[80vh] max-w-[80vw] rounded-lg" />
          </div>
        )}
      </>
    );
  }

  // Edit mode — image grid with upload
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {fileList.map((f) => (
          <div key={f.id} className="group relative h-20 w-20 overflow-hidden rounded-md border bg-muted">
            <img src={f.url} alt={f.originalName} className="h-full w-full object-cover" />
            {!disabled && (
              <button type="button"
                className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/60 p-0.5 text-white group-hover:block"
                onClick={() => handleRemove(f.id)}>
                <XIcon />
              </button>
            )}
          </div>
        ))}
        {canUpload && (
          <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25 bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors">
            {uploading ? <Loader2Icon /> : <ImagePlusIcon />}
            <input ref={inputRef} type="file" className="hidden" accept="image/*" multiple={maxCount > 1}
              onChange={handleFileSelect} disabled={uploading || disabled} />
          </label>
        )}
      </div>
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPreviewUrl(null)}>
          <img src={previewUrl} alt="" className="max-h-[80vh] max-w-[80vw] rounded-lg" />
        </div>
      )}
    </>
  );
}
