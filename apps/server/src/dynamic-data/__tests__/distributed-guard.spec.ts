import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DistributedGuard } from '../distributed.guard';

describe('DistributedGuard', () => {
  let guard: DistributedGuard;
  let prisma: any;

  function mkCtx(method: string, params: any, body: any, user: any, routePath?: string) {
    const req = {
      method,
      params,
      body,
      user,
      route: { path: routePath ?? '/apps/:appCode/models/:modelCode/data' },
    };
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

  it('allows POST /query (list search) from non-root user on distributed model', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm', dataScope: 'distributed' });
    const ctx = mkCtx('POST',
      { appCode: 'a', modelCode: 'm' },
      { filter: {} },
      { userId: 'u', orgId: 'sub', isAdmin: false },
      '/apps/:appCode/models/:modelCode/data/query',
    );
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(prisma.sysOrganization.findUnique).not.toHaveBeenCalled();
  });

  it('rejects POST /batch (batch create) from non-root user on distributed model', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm', dataScope: 'distributed' });
    prisma.sysOrganization.findUnique.mockResolvedValue({ id: 'sub', parentId: 'root' });
    const ctx = mkCtx('POST',
      { appCode: 'a', modelCode: 'm' },
      { records: [] },
      { userId: 'u', orgId: 'sub', isAdmin: false },
      '/apps/:appCode/models/:modelCode/data/batch',
    );
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      errorCode: 'CANNOT_CREATE_COPY_DIRECTLY',
    });
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

  // ── Rule 2 (B2): readonly field write rejection on copies ──

  it('rejects update on copy readonly field from sub-org', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({
      id: 'm', dataScope: 'distributed', tableName: 'app1_items',
      fields: [
        { id: 'f1', columnName: 'spec', name: '规格' },
        { id: 'f2', columnName: 'remark', name: '备注' },
      ],
    });
    prisma.sysOrganization.findUnique.mockResolvedValue({ id: 'sub', parentId: 'root' });
    prisma.sysDistributionPolicy.findMany.mockResolvedValue([
      { fieldId: 'f1', editable: false },
      { fieldId: 'f2', editable: true },
    ]);
    prisma.$queryRawUnsafe.mockResolvedValue([{ id: 'r1', master_id: 'r0' }]);
    const ctx = mkCtx('PUT',
      { appCode: 'a', modelCode: 'm', id: 'r1' },
      { spec: 'new', remark: 'ok' },
      { userId: 'u', orgId: 'sub', isAdmin: false },
      '/apps/:appCode/models/:modelCode/data/:id',
    );
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      errorCode: 'FIELD_READONLY_BY_MASTER',
    });
  });

  it('allows update of editable field on copy from sub-org', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({
      id: 'm', dataScope: 'distributed', tableName: 'app1_items',
      fields: [{ id: 'f2', columnName: 'remark', name: '备注' }],
    });
    prisma.sysOrganization.findUnique.mockResolvedValue({ id: 'sub', parentId: 'root' });
    prisma.sysDistributionPolicy.findMany.mockResolvedValue([{ fieldId: 'f2', editable: true }]);
    prisma.$queryRawUnsafe.mockResolvedValue([{ id: 'r1', master_id: 'r0' }]);
    const ctx = mkCtx('PUT',
      { appCode: 'a', modelCode: 'm', id: 'r1' },
      { remark: 'hello' },
      { userId: 'u', orgId: 'sub', isAdmin: false },
      '/apps/:appCode/models/:modelCode/data/:id',
    );
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('allows master update of readonly field from root org', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({
      id: 'm', dataScope: 'distributed', tableName: 'app1_items',
      fields: [{ id: 'f1', columnName: 'spec', name: '规格' }],
    });
    prisma.sysOrganization.findUnique.mockResolvedValue({ id: 'root', parentId: null });
    prisma.sysDistributionPolicy.findMany.mockResolvedValue([{ fieldId: 'f1', editable: false }]);
    prisma.$queryRawUnsafe.mockResolvedValue([{ id: 'r0', master_id: 'r0' }]);
    const ctx = mkCtx('PUT',
      { appCode: 'a', modelCode: 'm', id: 'r0' },
      { spec: 'new' },
      { userId: 'u', orgId: 'root', isAdmin: false },
      '/apps/:appCode/models/:modelCode/data/:id',
    );
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('skips row lookup on archive subroute (is_archived-only write)', async () => {
    // PUT /:id/archive is its own endpoint; body has no field writes, guard should pass through
    prisma.sysModel.findFirst.mockResolvedValue({
      id: 'm', dataScope: 'distributed', tableName: 'app1_items',
      fields: [],
    });
    const ctx = mkCtx('PUT',
      { appCode: 'a', modelCode: 'm', id: 'r1' },
      {},
      { userId: 'u', orgId: 'sub', isAdmin: false },
      '/apps/:appCode/models/:modelCode/data/:id/archive',
    );
    // empty body or non-field keys → no readonly violation; row lookup not needed
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('throws readonly error with fieldName in message payload', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({
      id: 'm', dataScope: 'distributed', tableName: 'app1_items',
      fields: [{ id: 'f1', columnName: 'spec', name: '规格' }],
    });
    prisma.sysOrganization.findUnique.mockResolvedValue({ id: 'sub', parentId: 'root' });
    prisma.sysDistributionPolicy.findMany.mockResolvedValue([{ fieldId: 'f1', editable: false }]);
    prisma.$queryRawUnsafe.mockResolvedValue([{ id: 'r1', master_id: 'r0' }]);
    const ctx = mkCtx('PUT',
      { appCode: 'a', modelCode: 'm', id: 'r1' },
      { spec: 'x' },
      { userId: 'u', orgId: 'sub', isAdmin: false },
      '/apps/:appCode/models/:modelCode/data/:id',
    );
    try {
      await guard.canActivate(ctx);
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.errorCode).toBe('FIELD_READONLY_BY_MASTER');
      // message field holds a JSON string with fieldName
      // (the frontend's getApiErrorMessage interpolates {fieldName} from it)
      expect(e.getResponse?.().message ?? e.message).toMatch(/规格/);
    }
  });
});
