'use client';

import { LayoutGrid, type LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

/**
 * Resolve a Lucide icon component by name (string → component).
 * Falls back to LayoutGrid if the name is null or not found.
 *
 * Centralizes the dynamic icon lookup that was duplicated in
 * SystemSwitcher and Launcher.
 */
export function getLucideIcon(name: string | null | undefined): LucideIcon {
  if (!name) return LayoutGrid;
  const Icon = (LucideIcons as Record<string, unknown>)[name];
  return Icon && typeof Icon === 'object' && 'render' in Icon ? (Icon as unknown as LucideIcon) : LayoutGrid;
}

interface AppIconProps {
  iconName: string | null | undefined;
  className?: string;
}

/** Renders a Lucide icon resolved by name. Fallback: LayoutGrid. */
export function AppIcon({ iconName, className = 'w-4 h-4' }: AppIconProps) {
  const Icon = getLucideIcon(iconName);
  return <Icon className={className} />;
}
