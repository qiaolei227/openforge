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
});
