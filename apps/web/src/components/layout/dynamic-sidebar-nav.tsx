'use client';

import { useArea } from '@/hooks/use-area';
import { SettingsSidebar } from './settings-sidebar';

export function DynamicSidebarNav() {
  const area = useArea();
  if (area === 'settings') return <SettingsSidebar />;
  return null;
}
