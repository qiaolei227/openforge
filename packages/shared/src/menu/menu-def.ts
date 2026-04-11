/**
 * MenuDef 是后端代码声明的菜单元数据，
 * 由 MenuSyncService 在 NestJS onModuleInit 阶段反射到 sys_menu 表。
 *
 * 只有硬编码页（source=coded）通过 MenuDef 注册；
 * 设计器生成的业务菜单（source=designer）通过管理页 API 直接写入数据库。
 */
export interface MenuDef {
  /** 稳定标识符，形如 'sys:users'，作为权限绑定的锚点 */
  code: string;
  /** 父级 MenuDef 的 code；顶级为 null */
  parentCode: string | null;
  /** coded 菜单只能是 group 或 page 两种类型 */
  type: 'group' | 'page';
  /** 中文显示名 */
  name: string;
  /** 英文显示名（可选） */
  nameEn?: string;
  /** lucide 图标名（可选） */
  icon?: string;
  /** 同级排序（可选，默认 0） */
  sortOrder?: number;
  /** type='page' 时必填：前端路由 */
  targetRoute?: string;
}

/**
 * NestJS multi provider 的注入 token。
 * 每个后端模块通过
 *   { provide: MENU_DEF_TOKEN, useValue: FOO_MENU, multi: true }
 * 向全局注册自己的 MenuDef。
 */
export const MENU_DEF_TOKEN = 'MENU_DEF_TOKEN';
