'use client';

import { WysiwygMenuEditor } from './components/wysiwyg-menu-editor';

export interface AdminMenuNode {
  id: string;
  appId: string;
  parentId: string | null;
  code: string;
  type: 'group' | 'model' | 'page' | 'link' | 'divider';
  name: string;
  icon?: string | null;
  sortOrder: number;
  visible: boolean;
  targetModelId?: string | null;
  targetViewType?: string | null;
  targetViewId?: string | null;
  targetUrl?: string | null;
  children: AdminMenuNode[];
}

export type MenuCreateType = 'group' | 'model' | 'link' | 'divider';

interface MenuTabProps {
  appId: string;
}

export function MenuTab({ appId }: MenuTabProps) {
  return <WysiwygMenuEditor appId={appId} />;
}
