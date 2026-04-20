import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DistributionService } from '../distribution.service';

describe('DistributionService', () => {
  let service: DistributionService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      sysModel: { findFirst: vi.fn() },
      sysOrganization: { findUnique: vi.fn() },
      sysDistributionLog: { create: vi.fn() },
      $queryRawUnsafe: vi.fn(),
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    };
    service = new DistributionService(prisma);
  });

  function mkModel(over: any = {}) {
    return {
      id: 'm1',
      dataScope: 'distributed',
      tableName: 'app1_items',
      enableDataStatus: false,
      fields: [
        { id: 'f1', columnName: 'name' },
        { id: 'f2', columnName: 'spec' },
      ],
      ...over,
    };
  }

  const rootUser = { userId: 'u', orgId: 'root', isAdmin: false };

  it('rejects when current org is not root', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(mkModel());
    prisma.sysOrganization.findUnique.mockResolvedValueOnce({ id: 'sub', parentId: 'root' }); // current org is sub
    await expect(
      service.applyChanges('a', 'm', {
        user: { userId: 'u', orgId: 'sub', isAdmin: false },
        recordIds: ['r1'],
        changes: [{ orgId: 'sub2', action: 'allocate' }],
      }),
    ).rejects.toMatchObject({ errorCode: 'DISTRIBUTE_REQUIRES_ROOT_ORG' });
  });

  it('rejects non-distributed model', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(mkModel({ dataScope: 'private' }));
    await expect(
      service.applyChanges('a', 'm', {
        user: rootUser,
        recordIds: ['r1'],
        changes: [{ orgId: 'sub', action: 'allocate' }],
      }),
    ).rejects.toMatchObject({ errorCode: 'MODEL_NOT_DISTRIBUTED' });
  });

  it('allocates to new org (INSERT + log)', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(mkModel());
    // current org check → root
    prisma.sysOrganization.findUnique
      .mockResolvedValueOnce({ id: 'root', parentId: null }) // current org
      .mockResolvedValueOnce({ id: 'sub', parentId: 'root' }); // target org
    // master row lookup → valid master
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'r1', master_id: 'r1', name: 'X', spec: 'Y' }]);
    // existing copy lookup → none
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    const res = await service.applyChanges('a', 'm', {
      user: rootUser,
      recordIds: ['r1'],
      changes: [{ orgId: 'sub', action: 'allocate' }],
    });

    expect(res.results[0].status).toBe('success');
    expect(res.results[0].copyId).toBeDefined();
    const insertCall = prisma.$executeRawUnsafe.mock.calls.find(
      (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO biz.'),
    );
    expect(insertCall).toBeDefined();
    expect(prisma.sysDistributionLog.create).toHaveBeenCalled();
  });

  it('restores archived copy on re-allocate (UPDATE is_archived=false)', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(mkModel());
    prisma.sysOrganization.findUnique
      .mockResolvedValueOnce({ id: 'root', parentId: null })
      .mockResolvedValueOnce({ id: 'sub', parentId: 'root' });
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'r1', master_id: 'r1' }])
      .mockResolvedValueOnce([{ id: 'c1', is_archived: true }]);

    const res = await service.applyChanges('a', 'm', {
      user: rootUser,
      recordIds: ['r1'],
      changes: [{ orgId: 'sub', action: 'allocate' }],
    });

    expect(res.results[0].status).toBe('success');
    expect(res.results[0].copyId).toBe('c1');
    const restoreCall = prisma.$executeRawUnsafe.mock.calls.find(
      (c: any) => typeof c[0] === 'string' && /is_archived\s*=\s*false/i.test(c[0]),
    );
    expect(restoreCall).toBeDefined();
  });

  it('marks ALREADY_ALLOCATED when active copy exists', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(mkModel());
    prisma.sysOrganization.findUnique
      .mockResolvedValueOnce({ id: 'root', parentId: null })
      .mockResolvedValueOnce({ id: 'sub', parentId: 'root' });
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'r1', master_id: 'r1' }])
      .mockResolvedValueOnce([{ id: 'c1', is_archived: false }]);

    const res = await service.applyChanges('a', 'm', {
      user: rootUser,
      recordIds: ['r1'],
      changes: [{ orgId: 'sub', action: 'allocate' }],
    });

    expect(res.results[0].status).toBe('failed');
    expect(res.results[0].errorCode).toBe('ALREADY_ALLOCATED');
  });

  it('revokes by archiving copy', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(mkModel());
    prisma.sysOrganization.findUnique
      .mockResolvedValueOnce({ id: 'root', parentId: null })
      .mockResolvedValueOnce({ id: 'sub', parentId: 'root' });
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'r1', master_id: 'r1' }])
      .mockResolvedValueOnce([{ id: 'c1', is_archived: false }]);

    const res = await service.applyChanges('a', 'm', {
      user: rootUser,
      recordIds: ['r1'],
      changes: [{ orgId: 'sub', action: 'revoke' }],
    });

    expect(res.results[0].status).toBe('success');
    const archiveCall = prisma.$executeRawUnsafe.mock.calls.find(
      (c: any) => typeof c[0] === 'string' && /is_archived\s*=\s*true/i.test(c[0]),
    );
    expect(archiveCall).toBeDefined();
  });

  it('fails NOT_A_MASTER_RECORD when recordId is a copy', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(mkModel());
    prisma.sysOrganization.findUnique
      .mockResolvedValueOnce({ id: 'root', parentId: null })
      .mockResolvedValueOnce({ id: 'sub', parentId: 'root' });
    // record exists but is a copy (master_id !== id)
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'r2', master_id: 'r1' }]);

    const res = await service.applyChanges('a', 'm', {
      user: rootUser,
      recordIds: ['r2'],
      changes: [{ orgId: 'sub', action: 'allocate' }],
    });

    expect(res.results[0].status).toBe('failed');
    expect(res.results[0].errorCode).toBe('NOT_A_MASTER_RECORD');
  });

  it('fails CANNOT_ALLOCATE_TO_ROOT when target is root', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(mkModel());
    prisma.sysOrganization.findUnique
      .mockResolvedValueOnce({ id: 'root', parentId: null }) // current org
      .mockResolvedValueOnce({ id: 'root', parentId: null }); // target org is also root
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'r1', master_id: 'r1' }]);

    const res = await service.applyChanges('a', 'm', {
      user: rootUser,
      recordIds: ['r1'],
      changes: [{ orgId: 'root', action: 'allocate' }],
    });

    expect(res.results[0].errorCode).toBe('CANNOT_ALLOCATE_TO_ROOT');
  });

  // B6: getDistributionStatus tests
  it('returns distribution status with hasLocalEdits flag', async () => {
    prisma.sysDistributionPolicy = { findMany: vi.fn().mockResolvedValue([
      { fieldId: 'f1', editable: false },
      { fieldId: 'f2', editable: true },
    ]) };
    prisma.sysModel.findFirst.mockResolvedValue({
      id: 'm1', dataScope: 'distributed', tableName: 'app1_items', enableDataStatus: false,
      fields: [{ id: 'f1', columnName: 'spec' }, { id: 'f2', columnName: 'remark' }],
    });
    // one query returning master + two copies
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { id: 'm1', master_id: 'm1', org_id: 'root', is_archived: false, spec: 'A', remark: 'R' },
      { id: 'c1', master_id: 'm1', org_id: 'sub1', is_archived: false, spec: 'A', remark: 'LOCAL' },
      { id: 'c2', master_id: 'm1', org_id: 'sub2', is_archived: true,  spec: 'A', remark: 'R' },
    ]);

    const res = await service.getDistributionStatus('a', 'm', ['m1']);
    expect(res['m1']).toHaveLength(2);
    expect(res['m1']).toEqual(expect.arrayContaining([
      expect.objectContaining({ orgId: 'sub1', copyId: 'c1', isArchived: false, hasLocalEdits: true }),
      expect.objectContaining({ orgId: 'sub2', copyId: 'c2', isArchived: true, hasLocalEdits: false }),
    ]));
  });

  it('getDistributionStatus returns empty array for unknown recordId', async () => {
    prisma.sysDistributionPolicy = { findMany: vi.fn().mockResolvedValue([]) };
    prisma.sysModel.findFirst.mockResolvedValue({
      id: 'm1', dataScope: 'distributed', tableName: 'app1_items', enableDataStatus: false,
      fields: [],
    });
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);
    const res = await service.getDistributionStatus('a', 'm', ['unknown']);
    expect(res['unknown']).toEqual([]);
  });

  it('getDistributionStatus throws MODEL_NOT_DISTRIBUTED on private model', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm', dataScope: 'private', tableName: 't', fields: [] });
    await expect(service.getDistributionStatus('a', 'm', ['r1'])).rejects.toMatchObject({
      errorCode: 'MODEL_NOT_DISTRIBUTED',
    });
  });

  it('getDistributionLog returns paginated results sorted desc by createdAt', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.sysDistributionLog = {
      findMany: vi.fn().mockResolvedValue([
        { id: 'l1', createdAt: new Date() },
        { id: 'l2', createdAt: new Date() },
      ]),
      count: vi.fn().mockResolvedValue(42),
    };
    const res = await service.getDistributionLog('a', 'm', 'r1', 2, 10);
    expect(prisma.sysDistributionLog.findMany).toHaveBeenCalledWith({
      where: { modelId: 'm1', recordId: 'r1' },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(res).toEqual({ items: expect.any(Array), total: 42, page: 2, pageSize: 10 });
  });

  it('getDistributionLog clamps page >= 1 and pageSize between 1 and 200', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.sysDistributionLog = {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    };
    await service.getDistributionLog('a', 'm', 'r1', 0, 500);
    expect(prisma.sysDistributionLog.findMany).toHaveBeenCalledWith({
      where: { modelId: 'm1', recordId: 'r1' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 200,
    });
  });

  it('getDistributionLog throws MODEL_NOT_FOUND when model does not exist', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(null);
    await expect(service.getDistributionLog('a', 'm', 'r1')).rejects.toMatchObject({
      errorCode: 'MODEL_NOT_FOUND',
    });
  });
});
