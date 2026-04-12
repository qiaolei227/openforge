import type { MenuDef } from '@openforge/shared';

export const SYS_USERS: MenuDef = {
  code: 'sys:users',
  parentCode: 'sys:management',
  type: 'page',
  name: '用户管理',
  icon: 'Users',
  sortOrder: 10,
  targetRoute: '/users',
};
