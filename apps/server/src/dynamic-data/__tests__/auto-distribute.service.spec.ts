import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoDistributeService } from '../auto-distribute.service';

describe('AutoDistributeService', () => {
  let service: AutoDistributeService;
  let prisma: any;
  let distribution: any;
  beforeEach(() => {
    prisma = {
      sysOrganization: { findMany: vi.fn() },
      sysModel: { findFirst: vi.fn() },
      $queryRawUnsafe: vi.fn(),
    };
    distribution = {
      applyChanges: vi.fn().mockResolvedValue({ results: [], summary: { succeeded: 0, failed: 0 } }),
      getDistributionStatus: vi.fn(),
    };
    service = new AutoDistributeService(prisma, distribution);
  });

  // onMasterCreated

  it('onMasterCreated no-op when autoDistribute=false', async () => {
    await service.onMasterCreated(
      { id: 'm', autoDistribute: false, dataScope: 'distributed', appCode: 'a', modelCode: 'items' },
      'r1',
      { userId: 'u', orgId: 'root', isAdmin: false },
    );
    expect(prisma.sysOrganization.findMany).not.toHaveBeenCalled();
    expect(distribution.applyChanges).not.toHaveBeenCalled();
  });

  it('onMasterCreated no-op when dataScope != distributed', async () => {
    await service.onMasterCreated(
      { id: 'm', autoDistribute: true, dataScope: 'private', appCode: 'a', modelCode: 'items' },
      'r1',
      { userId: 'u', orgId: 'root', isAdmin: false },
    );
    expect(distribution.applyChanges).not.toHaveBeenCalled();
  });

  it('onMasterCreated dispatches allocate to all non-root orgs when autoDistribute=true', async () => {
    prisma.sysOrganization.findMany.mockResolvedValue([
      { id: 'sub1' },
      { id: 'sub2' },
    ]);
    await service.onMasterCreated(
      { id: 'm', autoDistribute: true, dataScope: 'distributed', appCode: 'a', modelCode: 'items' },
      'r1',
      { userId: 'u', orgId: 'root', isAdmin: false },
    );
    expect(distribution.applyChanges).toHaveBeenCalledWith('a', 'items', {
      user: expect.objectContaining({ userId: 'u', orgId: 'root' }),
      recordIds: ['r1'],
      changes: [
        { orgId: 'sub1', action: 'allocate' },
        { orgId: 'sub2', action: 'allocate' },
      ],
    });
  });

  it('onMasterCreated no-op when there are no non-root orgs', async () => {
    prisma.sysOrganization.findMany.mockResolvedValue([]);
    await service.onMasterCreated(
      { id: 'm', autoDistribute: true, dataScope: 'distributed', appCode: 'a', modelCode: 'items' },
      'r1',
      { userId: 'u', orgId: 'root', isAdmin: false },
    );
    expect(distribution.applyChanges).not.toHaveBeenCalled();
  });

  it('onMasterCreated swallows applyChanges errors so master create still succeeds', async () => {
    prisma.sysOrganization.findMany.mockResolvedValue([{ id: 'sub1' }]);
    distribution.applyChanges.mockRejectedValue(new Error('boom'));
    await expect(service.onMasterCreated(
      { id: 'm', autoDistribute: true, dataScope: 'distributed', appCode: 'a', modelCode: 'items' },
      'r1',
      { userId: 'u', orgId: 'root', isAdmin: false },
    )).resolves.toBeUndefined();
  });

  // fillMissing

  it('fillMissing returns 0/0 when no non-root orgs', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm', dataScope: 'distributed', tableName: 't' });
    prisma.sysOrganization.findMany.mockResolvedValue([]);
    const res = await service.fillMissing('a', 'items', { userId: 'u', orgId: 'root', isAdmin: false });
    expect(res).toEqual({ created: 0, skipped: 0 });
  });

  it('fillMissing rejects non-distributed model', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm', dataScope: 'private', tableName: 't' });
    await expect(service.fillMissing('a', 'items', { userId: 'u', orgId: 'root', isAdmin: false }))
      .rejects.toMatchObject({ errorCode: 'MODEL_NOT_DISTRIBUTED' });
  });

  it('fillMissing allocates only to missing orgs per master', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm', dataScope: 'distributed', tableName: 't' });
    prisma.sysOrganization.findMany.mockResolvedValue([{ id: 'sub1' }, { id: 'sub2' }]);
    prisma.$queryRawUnsafe.mockResolvedValue([{ id: 'r1' }]);
    distribution.getDistributionStatus.mockResolvedValue({
      r1: [{ orgId: 'sub1', copyId: 'c1', isArchived: false, hasLocalEdits: false }],
    });
    distribution.applyChanges.mockResolvedValue({ results: [], summary: { succeeded: 1, failed: 0 } });
    const res = await service.fillMissing('a', 'items', { userId: 'u', orgId: 'root', isAdmin: false });
    expect(distribution.applyChanges).toHaveBeenCalledWith('a', 'items', expect.objectContaining({
      recordIds: ['r1'],
      changes: [{ orgId: 'sub2', action: 'allocate' }],
    }));
    expect(res.created).toBe(1);
    expect(res.skipped).toBe(0);
  });

  it('fillMissing skips masters that have all copies already', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm', dataScope: 'distributed', tableName: 't' });
    prisma.sysOrganization.findMany.mockResolvedValue([{ id: 'sub1' }]);
    prisma.$queryRawUnsafe.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    distribution.getDistributionStatus.mockResolvedValue({
      r1: [{ orgId: 'sub1', copyId: 'c1', isArchived: false, hasLocalEdits: false }],
      r2: [{ orgId: 'sub1', copyId: 'c2', isArchived: false, hasLocalEdits: false }],
    });
    const res = await service.fillMissing('a', 'items', { userId: 'u', orgId: 'root', isAdmin: false });
    expect(distribution.applyChanges).not.toHaveBeenCalled();
    expect(res).toEqual({ created: 0, skipped: 2 });
  });

  it('fillMissing ignores archived copies when computing missing orgs', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm', dataScope: 'distributed', tableName: 't' });
    prisma.sysOrganization.findMany.mockResolvedValue([{ id: 'sub1' }]);
    prisma.$queryRawUnsafe.mockResolvedValue([{ id: 'r1' }]);
    distribution.getDistributionStatus.mockResolvedValue({
      r1: [{ orgId: 'sub1', copyId: 'c1', isArchived: true, hasLocalEdits: false }],
    });
    distribution.applyChanges.mockResolvedValue({ results: [], summary: { succeeded: 1, failed: 0 } });
    const res = await service.fillMissing('a', 'items', { userId: 'u', orgId: 'root', isAdmin: false });
    expect(distribution.applyChanges).toHaveBeenCalledWith('a', 'items', expect.objectContaining({
      changes: [{ orgId: 'sub1', action: 'allocate' }],
    }));
    expect(res.created).toBe(1);
  });
});
