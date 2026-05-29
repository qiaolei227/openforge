import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  REQUIRE_PERMISSION_KEY,
  PermissionRequirement,
} from '../decorators/require-permission.decorator';
import { PermissionService } from '../permission/permission.service';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCodes } from '../exceptions/error-codes';

@Injectable()
export class PermissionGuard implements CanActivate {
  // Explicit @Inject is required because esbuild does not emit full
  // `design:paramtypes` metadata in the Vitest runtime, so NestJS cannot
  // resolve the constructor parameter by type alone.
  constructor(
    @Inject(Reflector) private reflector: Reflector,
    @Inject(PermissionService) private permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const perm = this.reflector.getAllAndOverride<PermissionRequirement>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!perm) {
      throw new BusinessException(
        500,
        ErrorCodes.MISSING_PERMISSION_DECORATOR,
        'Controller method is missing @RequirePermission or @Public decorator',
      );
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (user?.isAdmin) return true;

    if (!user?.userId) {
      throw new BusinessException(
        401,
        ErrorCodes.AUTH_INVALID_CREDENTIALS,
        'Not authenticated',
      );
    }

    let allowed: boolean;

    if (typeof perm.target === 'string') {
      // Identity-based check for platform resources
      const identity = user.identity ?? 'user';
      if (perm.target === 'sys:self') {
        allowed = true; // Any authenticated user
      } else if (perm.target === 'sys:designer' || perm.target === 'sys:menus') {
        allowed = identity === 'designer' || identity === 'admin';
      } else if (perm.target.startsWith('sys:') || perm.target.startsWith('platform:')) {
        allowed = identity === 'admin';
      } else {
        // Fallback: check sys_role_permission for non-sys resources
        allowed = await this.permissionService.checkResource(user.userId, perm.target, perm.action);
      }
    } else {
      // Form B: function → resolve menuCode → sys_role_menu
      const menuCode = await perm.target(request as Request);
      if (!menuCode) {
        throw new BusinessException(403, ErrorCodes.FORBIDDEN, 'Forbidden');
      }

      // Designer auto-gets full access to own systems' data
      if (user.identity === 'designer' && menuCode.startsWith('menu:model:')) {
        const appCode = menuCode.split(':')[2];
        if (appCode) {
          const app = await this.permissionService.findAppByCode(appCode);
          if (app?.createdBy === user.userId) {
            allowed = true;
          } else {
            allowed = await this.permissionService.check(user.userId, menuCode, perm.action);
          }
        } else {
          allowed = await this.permissionService.check(user.userId, menuCode, perm.action);
        }
      } else {
        allowed = await this.permissionService.check(user.userId, menuCode, perm.action);
      }

      // Inbox-task bypass: an assignee with a pending workflow task on this
      // model gets temporary view access so they can open the record from
      // their inbox even when no role grants them menu access. Decision
      // actions (approve/reject/transfer/...) still go through workflow-task
      // endpoints with their own sys:self check.
      if (
        !allowed &&
        perm.action === 'view' &&
        menuCode.startsWith('menu:model:')
      ) {
        const parts = menuCode.split(':');
        if (parts.length === 4) {
          allowed = await this.permissionService.hasPendingTaskOnModel(
            user.userId,
            parts[2],
            parts[3],
          );
        }
      }
    }

    if (!allowed) {
      throw new BusinessException(403, ErrorCodes.FORBIDDEN, 'Forbidden');
    }
    return true;
  }
}
