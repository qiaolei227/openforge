'use client';

import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  name?: string | null;
  className?: string;
}

/**
 * Dynamic lucide icon loader by name string.
 * Used by DynamicSidebarNav and other metadata-driven UIs where icon names
 * come from the database (sys_menu.icon) rather than imports.
 */
export function Icon({ name, className }: Props) {
  if (!name) return null;
  const LucideComponent = (Icons as unknown as Record<string, LucideIcon>)[name];
  if (!LucideComponent) return null;
  return <LucideComponent className={className} />;
}
