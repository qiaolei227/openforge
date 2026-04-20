import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncService } from '../sync.service';

describe('SyncService', () => {
  let service: SyncService;
  let prisma: any;
  beforeEach(() => {
    prisma = {
      sysModel: { findFirst: vi.fn() },
      sysOrganization: { findUnique: vi.fn().mockResolvedValue({ id: 'root', parentId: null }) },
      sysDistributionPolicy: { findMany: vi.fn() },
      sysDistributionLog: { create: vi.fn(), createMany: vi.fn() },
      $queryRawUnsafe: vi.fn(),
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    };
    service = new SyncService(prisma);
  });

  const rootUser = { userId: 'u', orgId: 'root', isAdmin: false };

  function mkModel(over: any = {}) {
    return {
      id: 'm', dataScope: 'distributed', tableName: 't',
      fields: [{ id: 'f1', columnName: 'remark', name: '备注' }, { id: 'f2', columnName: 'spec', name: '规格' }],
      ...over,
    };
  }

  it('rejects when confirmation phrase mismatches', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(mkModel());
    prisma.sysDistributionPolicy.findMany.mockResolvedValue([{ fieldId: 'f1', editable: true }]);
    await expect(service.sync('a', 'm', 'r1', {
      user: rootUser, action: 'force_push', fieldColumns: ['remark'], confirmationPhrase: 'wrong',
    })).rejects.toMatchObject({ errorCode: 'CONFIRMATION_MISMATCH' });
  });

  it('rejects non-distributed model', async () => {
    prisma.sysModel.findFirst.mockResolvedValue({ id: 'm', dataScope: 'private', tableName: 't', fields: [] });
    await expect(service.sync('a', 'm', 'r1', {
      user: rootUser, action: 'force_push', fieldColumns: ['remark'], confirmationPhrase: '强制覆盖',
    })).rejects.toMatchObject({ errorCode: 'MODEL_NOT_DISTRIBUTED' });
  });

  it('rejects non-root user', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(mkModel());
    prisma.sysOrganization.findUnique.mockResolvedValue({ id: 'sub', parentId: 'root' });
    await expect(service.sync('a', 'm', 'r1', {
      user: { userId: 'u', orgId: 'sub', isAdmin: false }, action: 'force_push',
      fieldColumns: ['remark'], confirmationPhrase: '强制覆盖',
    })).rejects.toMatchObject({ errorCode: 'DISTRIBUTE_REQUIRES_ROOT_ORG' });
  });

  it('force_push rejects readonly fields', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(mkModel());
    prisma.sysDistributionPolicy.findMany.mockResolvedValue([{ fieldId: 'f1', editable: false }, { fieldId: 'f2', editable: false }]);
    await expect(service.sync('a', 'm', 'r1', {
      user: rootUser, action: 'force_push', fieldColumns: ['spec'], confirmationPhrase: '强制覆盖',
    })).rejects.toMatchObject({ errorCode: 'FIELD_READONLY_BY_MASTER' });
  });

  it('force_push overwrites editable field values on all non-archived copies + logs', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(mkModel());
    prisma.sysDistributionPolicy.findMany.mockResolvedValue([{ fieldId: 'f1', editable: true }]);
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'r1', master_id: 'r1', remark: 'MASTER' }])
      .mockResolvedValueOnce([
        { id: 'c1', org_id: 'sub1', remark: 'LOCAL' },
        { id: 'c2', org_id: 'sub2', remark: 'MASTER' },
      ]);
    const res = await service.sync('a', 'm', 'r1', {
      user: rootUser, action: 'force_push', fieldColumns: ['remark'], confirmationPhrase: '强制覆盖',
    });
    expect(res.affected).toBe(2);
    expect(res.fieldCount).toBe(1);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(prisma.sysDistributionLog.createMany).toHaveBeenCalledTimes(1);
    const batchCall = prisma.sysDistributionLog.createMany.mock.calls[0][0];
    expect(batchCall.data).toHaveLength(2);
    expect(batchCall.data[0]).toMatchObject({
      action: 'force_push',
      fieldColumn: 'remark',
      sourceOrgId: 'root',
      beforeValue: { value: 'LOCAL' },
      afterValue: { value: 'MASTER' },
    });
  });

  it('backfill allows readonly fields (no editable restriction)', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(mkModel());
    prisma.sysDistributionPolicy.findMany.mockResolvedValue([{ fieldId: 'f2', editable: false }]);
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'r1', master_id: 'r1', spec: 'NEW' }])
      .mockResolvedValueOnce([{ id: 'c1', org_id: 'sub', spec: 'OLD' }]);
    const res = await service.sync('a', 'm', 'r1', {
      user: rootUser, action: 'backfill', fieldColumns: ['spec'], confirmationPhrase: '策略回填',
    });
    expect(res.affected).toBe(1);
    expect(prisma.sysDistributionLog.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ action: 'backfill', fieldColumn: 'spec' })],
    });
  });

  it('rejects NOT_A_MASTER_RECORD when record is a copy', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(mkModel());
    prisma.sysDistributionPolicy.findMany.mockResolvedValue([{ fieldId: 'f1', editable: true }]);
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]); // master not found / not a master
    await expect(service.sync('a', 'm', 'r1', {
      user: rootUser, action: 'force_push', fieldColumns: ['remark'], confirmationPhrase: '强制覆盖',
    })).rejects.toMatchObject({ errorCode: 'NOT_A_MASTER_RECORD' });
  });

  it('admin bypasses root-org check', async () => {
    prisma.sysModel.findFirst.mockResolvedValue(mkModel());
    prisma.sysDistributionPolicy.findMany.mockResolvedValue([{ fieldId: 'f1', editable: true }]);
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'r1', master_id: 'r1', remark: 'MASTER' }])
      .mockResolvedValueOnce([]); // no copies
    const adminUser = { userId: 'u', orgId: 'sub', isAdmin: true };
    const res = await service.sync('a', 'm', 'r1', {
      user: adminUser, action: 'force_push', fieldColumns: ['remark'], confirmationPhrase: '强制覆盖',
    });
    expect(res.affected).toBe(0);
  });
});
