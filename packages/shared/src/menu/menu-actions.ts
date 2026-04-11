/**
 * P2.1 启用的菜单动作。
 * UI 配置界面为每个菜单项渲染这些 action 的勾选框。
 */
export const MENU_ACTIONS = {
  VIEW:    'view',
  CREATE:  'create',
  EDIT:    'edit',
  DELETE:  'delete',
  ARCHIVE: 'archive',
} as const;

/**
 * 预留给后续阶段的动作常量，P2.1 不在 UI 上显示。
 */
export const MENU_ACTIONS_FUTURE = {
  EXPORT:     'export',      // P4
  IMPORT:     'import',      // P4
  APPROVE:    'approve',     // P2.3
  DISTRIBUTE: 'distribute',  // P2.2
  FORCE_PUSH: 'force_push',  // P2.2
} as const;

export type MenuAction =
  | typeof MENU_ACTIONS[keyof typeof MENU_ACTIONS]
  | typeof MENU_ACTIONS_FUTURE[keyof typeof MENU_ACTIONS_FUTURE];

/**
 * P2.1 启用的动作字符串数组，供运行时校验使用。
 */
export const ENABLED_MENU_ACTIONS: MenuAction[] = Object.values(MENU_ACTIONS);
