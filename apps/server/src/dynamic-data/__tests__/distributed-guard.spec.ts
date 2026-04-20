import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DistributedGuard } from '../distributed.guard';

describe('DistributedGuard', () => {
  let guard: DistributedGuard;
  let prisma: any;

  function mkCtx(method: string, params: any, body: any, user: any) {
    const req = { method, params, body, user };
    return { switchToHttp: () => ({ getRequest: () => req }) } as any;
  }

  beforeEach(() => {
    prisma = {
      sysModel: { findFirst: vi.fn() },
      sysOrganization: { findUnique: vi.fn() },
      sysDistributionPolicy: { findMany: vi.fn() },
      $queryRawUnsafe: vi.fn(),
    };
    guard = new DistributedGuard(prisma);
  });

  it('passes through when controller params missing appCode/modelCode', async () => {
    const ctx = mkCtx('POST', {}, {}, { userId: 'u', orgId: 'o', isAdmin: false });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(prisma.sysModel.findFirst).not.toHaveBeenCalled();
  });

  it('passes through non-distributed model', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm', dataScope: 'private' });
    const ctx = mkCtx('POST',
      { appCode: 'a', modelCode: 'm' },
      { name: 'x' },
      { userId: 'u', orgId: 'sub', isAdmin: false },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('rejects create master on distributed model from non-root org', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm', dataScope: 'distributed' });
    prisma.sysOrganization.findUnique.mockResolvedValue({ id: 'sub', parentId: 'root' });
    const ctx = mkCtx('POST',
      { appCode: 'a', modelCode: 'm' },
      { name: 'x' },
      { userId: 'u', orgId: 'sub', isAdmin: false },
    );
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      errorCode: 'CANNOT_CREATE_COPY_DIRECTLY',
    });
  });

  it('allows create master from root org', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm', dataScope: 'distributed' });
    prisma.sysOrganization.findUnique.mockResolvedValue({ id: 'root', parentId: null });
    const ctx = mkCtx('POST',
      { appCode: 'a', modelCode: 'm' },
      { name: 'x' },
      { userId: 'u', orgId: 'root', isAdmin: false },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('admin bypasses root-org check on distributed create', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm', dataScope: 'distributed' });
    // admin: guard should not even check currentOrg.parentId
    const ctx = mkCtx('POST',
      { appCode: 'a', modelCode: 'm' },
      { name: 'x' },
      { userId: 'u', orgId: 'sub', isAdmin: true },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('does not intercept update (PUT) operations in B1', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm', dataScope: 'distributed' });
    const ctx = mkCtx('PUT',
      { appCode: 'a', modelCode: 'm', id: 'r1' },
      { spec: 'x' },
      { userId: 'u', orgId: 'sub', isAdmin: false },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
  });
});
