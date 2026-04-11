import type { MenuAction } from './menu-actions';

/**
 * MenuNode 是 GET /api/menus/tree 返回的节点类型，
 * 树形嵌套，已按当前用户的权限过滤。
 */
export interface MenuNode {
  id: string;
  code: string;
  type: 'group' | 'model' | 'page' | 'link' | 'divider';
  name: string;
  nameEn?: string | null;
  icon?: string | null;
  sortOrder: number;

  // type=page
  targetRoute?: string | null;

  // type=model
  targetAppCode?: string | null;
  targetModelCode?: string | null;
  targetViewId?: string | null;
  targetFilterPreset?: Record<string, unknown> | null;

  // type=link
  targetUrl?: string | null;

  /** 嵌套子菜单 */
  children: MenuNode[];

  /** 当前用户在此菜单上的 action 权限集合 */
  permissions: MenuAction[];
}
