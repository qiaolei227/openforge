import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { MenuAction } from '@openforge/shared';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

export type MenuCodeResolver = string | ((req: Request) => string);

export interface PermissionRequirement {
  menuCode: MenuCodeResolver;
  action: MenuAction;
}

/**
 * 声明一个 Controller 方法需要的菜单权限。
 *
 * 用法：
 *   @RequirePermission('sys:users', 'view')         // 静态菜单
 *   @RequirePermission(
 *     (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
 *     'view',
 *   )                                                // 动态业务菜单
 */
export const RequirePermission = (menuCode: MenuCodeResolver, action: MenuAction) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { menuCode, action } as PermissionRequirement);
