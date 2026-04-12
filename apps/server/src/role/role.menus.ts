import type { MenuDef } from '@openforge/shared';

export const SYS_ROLES: MenuDef = {
  code: 'sys:roles',
  parentCode: 'sys:management',
  type: 'page',
  name: '角色管理',
  icon: 'Shield',
  sortOrder: 30,
  targetRoute: '/roles',
};
