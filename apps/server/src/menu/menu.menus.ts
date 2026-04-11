import type { MenuDef } from '@openforge/shared';

export const SYS_MANAGEMENT_GROUP: MenuDef = {
  code: 'sys:management',
  parentCode: null,
  type: 'group',
  name: '系统管理',
  nameEn: 'System',
  icon: 'Settings',
  sortOrder: 100,
};

export const SYS_MENUS: MenuDef = {
  code: 'sys:menus',
  parentCode: 'sys:management',
  type: 'page',
  name: '菜单管理',
  nameEn: 'Menus',
  icon: 'Menu',
  sortOrder: 40,
  targetRoute: '/menus',
};
