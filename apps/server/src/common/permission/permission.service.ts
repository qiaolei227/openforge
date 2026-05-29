import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { MenuAction } from '@openforge/shared';

type FieldAccess = 'hidden' | 'readonly' | 'editable';

@Injectable()
export class PermissionService {
  // Explicit @Inject is required because esbuild does not emit full
  // `design:paramtypes` metadata in the Vitest runtime, so NestJS cannot
  // resolve the constructor parameter by type alone.
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async check(userId: string, menuCode: string, action: MenuAction): Promise<boolean> {
    // sys:self — virtual permission any authenticated user has
    // (used for menu tree API, personal settings, etc.)
    if (menuCode === 'sys:self') return true;

    if (menuCode.startsWith('menu:model:')) {
      return this.checkModelMenu(userId, menuCode, action);
    }
    return this.checkStaticMenu(userId, menuCode, action);
  }

  private async checkStaticMenu(
    userId: string,
    menuCode: string,
    action: MenuAction,
  ): Promise<boolean> {
    // Static menus no longer exist as sys_menu rows. Their permissions are
    // checked via sys_role_menu by joining through the menu's code column.
    const rows = await this.prisma.sysRoleMenu.findMany({
      where: {
        menu: { code: menuCode },
        role: {
          userRoles: { some: { userId } },
        },
      },
      select: { permissions: true },
    });
    return this.anyPermissionMatches(rows, action);
  }

  private async checkModelMenu(
    userId: string,
    menuCode: string,
    action: MenuAction,
  ): Promise<boolean> {
    const parts = menuCode.split(':');
    if (parts.length !== 4) return false;
    const appCode = parts[2];
    const modelCode = parts[3];

    // targetAppCode/targetModelCode columns no longer exist.
    // Join through targetModel → model.app to resolve app code + model code.
    const rows = await this.prisma.sysRoleMenu.findMany({
      where: {
        menu: {
          type: 'model',
          targetModel: {
            code: modelCode,
            app: { code: appCode },
          },
        },
        role: {
          userRoles: { some: { userId } },
        },
      },
      select: { permissions: true },
    });
    return this.anyPermissionMatches(rows, action);
  }

  private anyPermissionMatches(
    rows: Array<{ permissions: string[] }>,
    action: MenuAction,
  ): boolean {
    for (const row of rows) {
      if (row.permissions.includes(action)) return true;
    }
    return false;
  }

  /**
   * Find an app by its code. Used by PermissionGuard to check designer ownership.
   */
  async findAppByCode(code: string) {
    return this.prisma.sysApp.findUnique({
      where: { code },
      select: { id: true, createdBy: true },
    });
  }

  /**
   * Does the user have any pending workflow task on a record of this model?
   * Used by PermissionGuard as a view-only bypass so inbox assignees can open
   * records that their roles wouldn't otherwise grant access to.
   */
  async hasPendingTaskOnModel(
    userId: string,
    appCode: string,
    modelCode: string,
  ): Promise<boolean> {
    const task = await this.prisma.sysWorkflowTask.findFirst({
      where: {
        assigneeUserId: userId,
        status: 'pending',
        instance: {
          status: 'running',
          workflow: {
            model: {
              code: modelCode,
              app: { code: appCode },
            },
          },
        },
      },
      select: { id: true },
    });
    return task !== null;
  }

  /**
   * Form A: 检查用户是否拥有静态资源权限。
   * 查询 sys_role_permission 表（resource + actions 列）。
   */
  async checkResource(userId: string, resource: string, action: string): Promise<boolean> {
    const userRoles = await this.prisma.sysUserRole.findMany({
      where: { userId },
      select: { roleId: true },
    });
    if (userRoles.length === 0) return false;

    const grant = await this.prisma.sysRolePermission.findFirst({
      where: {
        roleId: { in: userRoles.map((r) => r.roleId) },
        resource,
        actions: { has: action },
      },
    });
    return grant !== null;
  }

  /**
   * 返回当前用户在某模型上的字段权限映射。
   * - 表里没有记录的字段 = 'editable'（默认值，不出现在 map 中）
   * - 多角色合并：取最宽（editable > readonly > hidden）
   */
  async getFieldPermissions(
    userId: string,
    modelId: string,
  ): Promise<Map<string, FieldAccess>> {
    const rows = await this.prisma.sysFieldPermission.findMany({
      where: {
        modelId,
        role: {
          userRoles: { some: { userId } },
        },
      },
      select: { fieldId: true, access: true },
    });

    const map = new Map<string, FieldAccess>();
    for (const row of rows) {
      const access = row.access as FieldAccess;
      const current = map.get(row.fieldId);
      // 取最宽：editable 覆盖一切；readonly 覆盖 hidden
      if (current === 'editable') continue;
      if (access === 'editable') {
        map.set(row.fieldId, 'editable');
      } else if (access === 'readonly') {
        // current is 'hidden' | undefined at this point (editable already handled above)
        map.set(row.fieldId, 'readonly');
      } else if (!current) {
        map.set(row.fieldId, access);
      }
    }
    return map;
  }
}
