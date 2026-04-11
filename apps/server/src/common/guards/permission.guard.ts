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
    // 1. @Public routes pass unconditionally
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // 2. Require @RequirePermission on every non-public route
    const req = this.reflector.getAllAndOverride<PermissionRequirement>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!req) {
      throw new BusinessException(
        500,
        ErrorCodes.MISSING_PERMISSION_DECORATOR,
        'Controller method is missing @RequirePermission or @Public decorator',
      );
    }

    // 3. is_admin bypass
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (user?.isAdmin) return true;

    // 4. No user → 401
    if (!user?.id) {
      throw new BusinessException(
        401,
        ErrorCodes.AUTH_INVALID_CREDENTIALS,
        'Not authenticated',
      );
    }

    // 5. Resolve menu code (static string or function)
    const menuCode =
      typeof req.menuCode === 'function'
        ? req.menuCode(request as Request)
        : req.menuCode;

    // 6. Call PermissionService.check; FORBIDDEN if not allowed
    const allowed = await this.permissionService.check(user.id, menuCode, req.action);
    if (!allowed) {
      throw new BusinessException(403, ErrorCodes.FORBIDDEN, 'Forbidden');
    }
    return true;
  }
}
