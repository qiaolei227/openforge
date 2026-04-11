import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from '../permission.guard';
import { PermissionService } from '../../permission/permission.service';
import { BusinessException } from '../../exceptions/business.exception';

function mockContext(params: {
  user?: { id: string; isAdmin: boolean };
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
  let permService: { check: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    reflector = new Reflector();
    permService = { check: vi.fn() };
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
      guard.canActivate(mockContext({ user: { id: 'u1', isAdmin: false } })),
    ).rejects.toThrow(BusinessException);
  });

  it('bypasses is_admin users without calling PermissionService', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
      if (key === 'require_permission') return { menuCode: 'sys:users', action: 'view' };
      return undefined;
    });
    expect(
      await guard.canActivate(mockContext({ user: { id: 'u1', isAdmin: true } })),
    ).toBe(true);
    expect(permService.check).not.toHaveBeenCalled();
  });

  it('calls PermissionService.check for static menu', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
      if (key === 'require_permission') return { menuCode: 'sys:users', action: 'view' };
      return undefined;
    });
    permService.check.mockResolvedValue(true);
    expect(
      await guard.canActivate(mockContext({ user: { id: 'u1', isAdmin: false } })),
    ).toBe(true);
    expect(permService.check).toHaveBeenCalledWith('u1', 'sys:users', 'view');
  });

  it('resolves function menuCode with the request', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
      if (key === 'require_permission') {
        return {
          menuCode: (req: any) => `menu:model:${req.params.appCode}:${req.params.modelCode}`,
          action: 'view',
        };
      }
      return undefined;
    });
    permService.check.mockResolvedValue(true);
    await guard.canActivate(mockContext({
      user: { id: 'u1', isAdmin: false },
      request: { params: { appCode: 'purchase', modelCode: 'order' } },
    }));
    expect(permService.check).toHaveBeenCalledWith('u1', 'menu:model:purchase:order', 'view');
  });

  it('throws FORBIDDEN when check returns false', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
      if (key === 'require_permission') return { menuCode: 'sys:users', action: 'delete' };
      return undefined;
    });
    permService.check.mockResolvedValue(false);
    await expect(
      guard.canActivate(mockContext({ user: { id: 'u1', isAdmin: false } })),
    ).rejects.toThrow(BusinessException);
  });

  it('throws 401 when user is not authenticated (and not @Public)', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
      if (key === 'require_permission') return { menuCode: 'sys:users', action: 'view' };
      return undefined;
    });
    await expect(
      guard.canActivate(mockContext({})),
    ).rejects.toThrow(BusinessException);
  });
});
