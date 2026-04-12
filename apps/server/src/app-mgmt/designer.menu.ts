import type { MenuDef } from '@openforge/shared';

export const SYS_DESIGNER: MenuDef = {
  code: 'sys:designer',
  parentCode: null,
  type: 'page',
  name: '应用设计器',
  icon: 'Paintbrush',
  sortOrder: 200,
  targetRoute: '/apps',
};
