'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, MoreHorizontal } from 'lucide-react';
import type { SysView } from '@openforge/shared';
import { useCanvasStore } from './canvas-store';
import { ViewContextMenu } from './view-context-menu';

interface ViewListPanelProps {
  views: SysView[];
  onCreateView: () => void;
  onRenameView: (viewId: string, newName: string) => void;
  onDuplicateView: (view: SysView) => void;
  onDeleteView: (viewId: string) => void;
}

function FormIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 13H8" />
      <path d="M16 17H8" />
      <path d="M16 13h-2" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function ViewListPanel({
  views,
  onCreateView,
  onRenameView,
  onDuplicateView,
  onDeleteView,
}: ViewListPanelProps) {
  const t = useTranslations('designer');
  const currentViewId = useCanvasStore((s) => s.viewId);
  const setView = useCanvasStore((s) => s.setView);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering rename mode
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleSelectView = useCallback(
    (view: SysView) => {
      if (view.id === currentViewId || renamingId) return;
      setView(view.id, view.type, view.layout);
    },
    [currentViewId, setView, renamingId],
  );

  const startRename = useCallback((view: SysView) => {
    setRenamingId(view.id);
    setRenameValue(view.name);
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRenameView(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  }, [renamingId, renameValue, onRenameView]);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
  }, []);

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('viewList')}
        </h3>
        <button
          onClick={onCreateView}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={t('newView')}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-0.5">
        {views.map((view) => {
          const isActive = view.id === currentViewId;
          const isRenaming = view.id === renamingId;
          const Icon = view.type === 'form' ? FormIcon : ListIcon;

          if (isRenaming) {
            return (
              <div
                key={view.id}
                className="flex items-center gap-2 rounded-md px-2.5 py-1.5"
              >
                <Icon className="text-muted-foreground shrink-0" />
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') cancelRename();
                  }}
                  className="flex-1 rounded border border-primary bg-background px-1.5 py-0.5 text-sm outline-none"
                />
              </div>
            );
          }

          return (
            <div
              key={view.id}
              className={`group flex w-full items-center gap-1 rounded-md px-2.5 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              <button
                onClick={() => handleSelectView(view)}
                onDoubleClick={() => startRename(view)}
                className="flex flex-1 items-center gap-2 min-w-0"
              >
                <Icon className={isActive ? 'text-primary shrink-0' : 'text-muted-foreground shrink-0'} />
                <span className="truncate">{view.name}</span>
              </button>
              <ViewContextMenu
                viewName={view.name}
                onRename={() => startRename(view)}
                onDuplicate={() => onDuplicateView(view)}
                onDelete={() => onDeleteView(view.id)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-all"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </ViewContextMenu>
            </div>
          );
        })}
      </div>
    </div>
  );
}
