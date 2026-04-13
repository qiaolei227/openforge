'use client';

import { LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onClick: () => void;
  className?: string;
}

export function MenuDrawerTrigger({ onClick, className }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center w-8 h-8 rounded-md',
        'border border-border hover:bg-primary/8 hover:border-primary/20 hover:text-primary',
        'text-muted-foreground transition-all',
        className,
      )}
      title="打开菜单 (Ctrl+K)"
    >
      <LayoutGrid className="w-4 h-4" />
    </button>
  );
}
