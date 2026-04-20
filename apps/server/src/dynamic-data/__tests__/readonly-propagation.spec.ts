import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReadonlyPropagationService } from '../readonly-propagation.service';

describe('ReadonlyPropagationService', () => {
  let service: ReadonlyPropagationService;
  let prisma: any;
  let client: any;
  beforeEach(() => {
    client = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    };
    prisma = {
      sysDistributionPolicy: { findMany: vi.fn() },
    };
    service = new ReadonlyPropagationService(prisma);
  });

  it('propagates readonly columns to all non-archived copies', async () => {
    prisma.sysDistributionPolicy.findMany.mockResolvedValue([
      { fieldId: 'f1', editable: false }, // spec = readonly
      { fieldId: 'f2', editable: true },  // remark = editable
    ]);
    const model = {
      id: 'm', tableName: 'app1_items',
      fields: [
        { id: 'f1', columnName: 'spec' },
        { id: 'f2', columnName: 'remark' },
      ],
    };
    await service.propagate(client, model as any, 'r1', { spec: 'new', remark: 'local-ignored' });
    // one SQL call, UPDATE with "spec" in set clause, no "remark"
    expect(client.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const sql = client.$executeRawUnsafe.mock.calls[0][0];
    expect(sql).toContain('UPDATE biz."app1_items"');
    expect(sql).toContain('"spec" = $1');
    expect(sql).not.toContain('"remark"');
    expect(sql).toContain('master_id = $');
    expect(sql).toContain('id <> master_id');
    expect(sql).toContain('is_archived = false');
  });

  it('no-op when only editable columns changed', async () => {
    prisma.sysDistributionPolicy.findMany.mockResolvedValue([
      { fieldId: 'f2', editable: true },
    ]);
    const model = {
      id: 'm', tableName: 'app1_items',
      fields: [{ id: 'f2', columnName: 'remark' }],
    };
    await service.propagate(client, model as any, 'r1', { remark: 'x' });
    expect(client.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('no-op when payload has no readonly columns', async () => {
    prisma.sysDistributionPolicy.findMany.mockResolvedValue([]);
    const model = {
      id: 'm', tableName: 'app1_items',
      fields: [{ id: 'f1', columnName: 'spec' }],
    };
    // empty payload
    await service.propagate(client, model as any, 'r1', {});
    expect(client.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('field absent from payload is not included in SET clause', async () => {
    prisma.sysDistributionPolicy.findMany.mockResolvedValue([
      { fieldId: 'f1', editable: false },
      { fieldId: 'f3', editable: false },
    ]);
    const model = {
      id: 'm', tableName: 'app1_items',
      fields: [
        { id: 'f1', columnName: 'spec' },
        { id: 'f3', columnName: 'manufacturer' },
      ],
    };
    // only spec in payload — manufacturer should not be in SET
    await service.propagate(client, model as any, 'r1', { spec: 'X' });
    const sql = client.$executeRawUnsafe.mock.calls[0][0];
    expect(sql).toContain('"spec"');
    expect(sql).not.toContain('"manufacturer"');
  });

  it('unknown column in payload is ignored (not in model.fields)', async () => {
    prisma.sysDistributionPolicy.findMany.mockResolvedValue([]);
    const model = {
      id: 'm', tableName: 'app1_items',
      fields: [{ id: 'f1', columnName: 'spec' }],
    };
    await service.propagate(client, model as any, 'r1', { __system: 'x', other: 'y' });
    expect(client.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
