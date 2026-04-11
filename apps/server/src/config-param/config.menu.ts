import type { MenuDef } from '@openforge/shared';

export const SYS_CONFIG: MenuDef = {
  code: 'sys:config',
  parentCode: 'sys:management',
  type: 'page',
  name: '系统参数',
  nameEn: 'Config',
  icon: 'SlidersHorizontal',
  sortOrder: 50,
  targetRoute: '/config',
};
