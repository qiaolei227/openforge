'use client';

import { useState, useMemo } from 'react';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { X, Search } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Build full icon name list once from lucide-react exports            */
/* ------------------------------------------------------------------ */

const iconsMap = Icons as unknown as Record<string, LucideIcon>;

/** All PascalCase icon component names — deduplicated (exclude LucideX / XIcon aliases) */
const ALL_ICON_NAMES: string[] = Object.keys(iconsMap)
  .filter((k) => /^[A-Z]/.test(k) && !k.startsWith('Lucide') && !k.endsWith('Icon') && typeof iconsMap[k] === 'object' && 'render' in iconsMap[k])
  .sort();

/** Max icons rendered at once to keep the popover snappy */
const PAGE_SIZE = 80;

/* ------------------------------------------------------------------ */
/*  Styles                                                              */
/* ------------------------------------------------------------------ */

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface IconPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return ALL_ICON_NAMES;
    const lower = search.toLowerCase();
    return ALL_ICON_NAMES.filter((n) => n.toLowerCase().includes(lower));
  }, [search]);

  const totalCount = filtered.length;
  const visible = filtered.slice(0, PAGE_SIZE);

  const SelectedIcon = value ? iconsMap[value] : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors hover:bg-accent',
          !value && 'text-muted-foreground',
        )}
      >
        {SelectedIcon ? (
          <>
            <SelectedIcon className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left truncate">{value}</span>
            <span
              role="button"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
            >
              <X className="w-3.5 h-3.5" />
            </span>
          </>
        ) : (
          <span className="flex-1 text-left">选择图标</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        {/* Search */}
        <div className="p-2 border-b border-border relative">
          <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            className={`${inputClass} pl-8`}
            placeholder={`搜索 ${ALL_ICON_NAMES.length} 个图标...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {/* Grid */}
        <div className="max-h-64 overflow-auto p-2">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              无匹配图标
            </p>
          ) : (
            <>
              <div className="grid grid-cols-8 gap-1">
                {visible.map((name) => {
                  const Comp = iconsMap[name];
                  if (!Comp) return null;
                  return (
                    <button
                      key={name}
                      type="button"
                      title={name}
                      onClick={() => {
                        onChange(name);
                        setOpen(false);
                        setSearch('');
                      }}
                      className={cn(
                        'flex items-center justify-center w-8 h-8 rounded-md transition-colors',
                        value === name
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted text-foreground',
                      )}
                    >
                      <Comp className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
              {totalCount > PAGE_SIZE && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  显示前 {PAGE_SIZE} 个，共 {totalCount} 个匹配 — 输入关键词缩小范围
                </p>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
