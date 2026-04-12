import type { MenuDef } from '@openforge/shared';

export const SYS_ORGS: MenuDef = {
  code: 'sys:orgs',
  parentCode: 'sys:management',
  type: 'page',
  name: '组织管理',
  icon: 'Building2',
  sortOrder: 20,
  targetRoute: '/orgs',
};
