'use client';

import { useRef, useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DropdownItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface SplitButtonProps {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
  items: DropdownItem[];
}

interface MenuButtonProps {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
  items: DropdownItem[];
}

function DropdownMenu({
  items,
  open,
  onClose,
}: {
  items: DropdownItem[];
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="absolute left-0 top-full mt-1 min-w-[160px] bg-popover border rounded-md shadow-md py-1 z-50">
      {items.map((item, idx) => (
        <button
          key={idx}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors',
            item.disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
          )}
          onClick={() => {
            if (!item.disabled) {
              item.onClick();
              onClose();
            }
          }}
          disabled={item.disabled}
        >
          {item.icon && <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  );
}

function useDropdown() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return { open, setOpen, containerRef };
}

export function SplitButton({
  label,
  icon,
  onClick,
  disabled = false,
  variant = 'default',
  items,
}: SplitButtonProps) {
  const { open, setOpen, containerRef } = useDropdown();
  const allChildrenDisabled = items.length > 0 && items.every((i) => i.disabled);

  const baseVariant = cn(
    'inline-flex items-center text-sm font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    variant === 'destructive'
      ? 'text-destructive border-destructive/30 hover:bg-destructive/10'
      : 'border-border hover:bg-accent hover:text-accent-foreground',
  );

  return (
    <div ref={containerRef} className="relative inline-flex">
      {/* Primary action */}
      <button
        className={cn(baseVariant, 'gap-1.5 rounded-l-md px-3 py-1.5 border-r-0', disabled && 'opacity-40 cursor-not-allowed pointer-events-none')}
        onClick={onClick}
        disabled={disabled}
      >
        {icon && <span className="w-4 h-4 flex-shrink-0">{icon}</span>}
        {label}
      </button>

      {/* Dropdown trigger — independent of primary disabled state */}
      <button
        className={cn(baseVariant, 'rounded-r-md px-1.5 py-1.5', allChildrenDisabled && 'opacity-40 cursor-not-allowed pointer-events-none')}
        onClick={() => setOpen((v) => !v)}
        disabled={allChildrenDisabled}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      <DropdownMenu items={items} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export function MenuButton({
  label,
  icon,
  disabled = false,
  variant = 'default',
  items,
}: MenuButtonProps) {
  const { open, setOpen, containerRef } = useDropdown();

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          variant === 'destructive'
            ? 'text-destructive border-destructive/30 hover:bg-destructive/10'
            : 'border-border hover:bg-accent hover:text-accent-foreground',
          disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
        )}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {icon && <span className="w-4 h-4 flex-shrink-0">{icon}</span>}
        {label}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      <DropdownMenu items={items} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
