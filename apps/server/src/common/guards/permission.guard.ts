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
      // Form A: static resource string → sys_role_permission
      allowed = await this.permissionService.checkResource(user.userId, perm.target, perm.action);
    } else {
      // Form B: function → resolve menuCode → sys_role_menu
      const menuCode = await perm.target(request as Request);
      if (!menuCode) {
        throw new BusinessException(403, ErrorCodes.FORBIDDEN, 'Forbidden');
      }
      allowed = await this.permissionService.check(user.userId, menuCode, perm.action);
    }

    if (!allowed) {
      throw new BusinessException(403, ErrorCodes.FORBIDDEN, 'Forbidden');
    }
    return true;
  }
}
