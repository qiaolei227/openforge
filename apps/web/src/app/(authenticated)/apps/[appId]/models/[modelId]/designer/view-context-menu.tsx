'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Pencil, Copy, Trash2 } from 'lucide-react';

interface ViewContextMenuProps {
  children?: React.ReactNode;
  viewName: string;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  className?: string;
}

export function ViewContextMenu({
  children,
  viewName,
  onRename,
  onDuplicate,
  onDelete,
  className,
}: ViewContextMenuProps) {
  const t = useTranslations('designer');
  const tc = useTranslations('common');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = useCallback(() => {
    setDeleteOpen(false);
    onDelete();
  }, [onDelete]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          onClick={(e) => e.stopPropagation()}
          className={className}
        >
          {children}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="mr-2 h-4 w-4" />
            {t('rename')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="mr-2 h-4 w-4" />
            {t('duplicate')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t('deleteView')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('deleteView')}</DialogTitle>
            <DialogDescription>
              {t('confirmDeleteView', { name: viewName })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {tc('confirmDeleteBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
