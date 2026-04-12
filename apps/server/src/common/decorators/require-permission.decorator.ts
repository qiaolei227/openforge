import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { MenuAction } from '@openforge/shared';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

/**
 * 权限目标的两种形式：
 *
 * - **Form A (string)**: 静态资源标识，如 `'platform:users'`、`'designer:apps'`。
 *   Guard 查询 sys_role_permission 表。
 *
 * - **Form B (function)**: 运行时从 Request 中解析菜单 code 的函数，如
 *   `(req) => \`menu:model:\${req.params.appCode}:\${req.params.modelCode}\``。
 *   Guard 查询 sys_role_menu 表（已有行为）。
 */
export type PermissionTarget =
  | string
  | ((req: Request) => string | null | Promise<string | null>);

export interface PermissionRequirement {
  target: PermissionTarget;
  action: MenuAction;
}

/**
 * 声明一个 Controller 方法需要的权限。
 *
 * 用法：
 *   @RequirePermission('platform:users', 'view')    // Form A — 静态资源 → sys_role_permission
 *   @RequirePermission(
 *     (req) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
 *     'view',
 *   )                                                // Form B — 动态菜单 → sys_role_menu
 */
export const RequirePermission = (target: PermissionTarget, action: MenuAction) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { target, action } as PermissionRequirement);
