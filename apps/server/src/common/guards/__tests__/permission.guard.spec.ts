import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from '../permission.guard';
import { PermissionService } from '../../permission/permission.service';
import { BusinessException } from '../../exceptions/business.exception';

function mockContext(params: {
  user?: { userId: string; isAdmin: boolean; identity?: string };
  request?: any;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: params.user, ...(params.request ?? {}) }),
    }),
    getHandler: () => 'handler',
    getClass: () => 'class',
  } as any;
}

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: Reflector;
  let permService: {
    check: ReturnType<typeof vi.fn>;
    checkResource: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    reflector = new Reflector();
    permService = { check: vi.fn(), checkResource: vi.fn() };
    guard = new PermissionGuard(reflector, permService as unknown as PermissionService);
  });

  it('lets @Public routes through', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
      if (key === 'isPublic') return true;
      return undefined;
    });
    expect(await guard.canActivate(mockContext({}))).toBe(true);
  });

  it('throws MISSING_PERMISSION_DECORATOR when no @Public and no @RequirePermission', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    await expect(
      guard.canActivate(mockContext({ user: { userId: 'u1', isAdmin: false } })),
    ).rejects.toThrow(BusinessException);
  });

  it('bypasses is_admin users without calling PermissionService', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
      if (key === 'require_permission') return { target: 'platform:users', action: 'view' };
      return undefined;
    });
    expect(
      await guard.canActivate(mockContext({ user: { userId: 'u1', isAdmin: true } })),
    ).toBe(true);
    expect(permService.check).not.toHaveBeenCalled();
    expect(permService.checkResource).not.toHaveBeenCalled();
  });

  it('throws 401 when user is not authenticated (and not @Public)', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
      if (key === 'require_permission') return { target: 'platform:users', action: 'view' };
      return undefined;
    });
    await expect(
      guard.canActivate(mockContext({})),
    ).rejects.toThrow(BusinessException);
  });

  describe('Form A — static resource string → sys_role_permission', () => {
    it('identity-gates platform:* targets (only admin allowed)', async () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === 'require_permission') return { target: 'platform:users', action: 'view' };
        return undefined;
      });
      // Non-admin user → forbidden (identity short-circuit, never reaches checkResource)
      await expect(
        guard.canActivate(mockContext({ user: { userId: 'u1', isAdmin: false, identity: 'user' } })),
      ).rejects.toThrow(BusinessException);
      expect(permService.checkResource).not.toHaveBeenCalled();
    });

    it('calls checkResource for non-sys/platform resources and passes when true', async () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === 'require_permission') return { target: 'custom:reports', action: 'view' };
        return undefined;
      });
      permService.checkResource.mockResolvedValue(true);
      expect(
        await guard.canActivate(mockContext({ user: { userId: 'u1', isAdmin: false } })),
      ).toBe(true);
      expect(permService.checkResource).toHaveBeenCalledWith('u1', 'custom:reports', 'view');
      expect(permService.check).not.toHaveBeenCalled();
    });

    it('throws FORBIDDEN when checkResource returns false', async () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === 'require_permission') return { target: 'custom:reports', action: 'delete' };
        return undefined;
      });
      permService.checkResource.mockResolvedValue(false);
      await expect(
        guard.canActivate(mockContext({ user: { userId: 'u1', isAdmin: false } })),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('Form B — function target → sys_role_menu', () => {
    it('resolves the function and calls check with the resulting menuCode', async () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === 'require_permission') {
          return {
            target: (req: any) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
            action: 'view',
          };
        }
        return undefined;
      });
      permService.check.mockResolvedValue(true);
      await guard.canActivate(mockContext({
        user: { userId: 'u1', isAdmin: false },
        request: { params: { appCode: 'purchase', modelCode: 'order' } },
      }));
      expect(permService.check).toHaveBeenCalledWith('u1', 'menu:model:purchase:order', 'view');
      expect(permService.checkResource).not.toHaveBeenCalled();
    });

    it('throws FORBIDDEN when function returns null', async () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === 'require_permission') {
          return {
            target: () => null,
            action: 'view',
          };
        }
        return undefined;
      });
      await expect(
        guard.canActivate(mockContext({ user: { userId: 'u1', isAdmin: false } })),
      ).rejects.toThrow(BusinessException);
      expect(permService.check).not.toHaveBeenCalled();
    });

    it('throws FORBIDDEN when check returns false', async () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === 'require_permission') {
          return {
            target: (req: any) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
            action: 'delete',
          };
        }
        return undefined;
      });
      permService.check.mockResolvedValue(false);
      await expect(
        guard.canActivate(mockContext({
          user: { userId: 'u1', isAdmin: false },
          request: { params: { appCode: 'purchase', modelCode: 'order' } },
        })),
      ).rejects.toThrow(BusinessException);
    });
  });
});
