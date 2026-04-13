import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FieldService } from '../field.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DdlManagerService } from '../ddl-manager.service';
import { BusinessException } from '../../common/exceptions/business.exception';

describe('FieldService', () => {
  let service: FieldService;
  let prisma: any;
  let ddlManager: any;

  beforeEach(async () => {
    prisma = {
      sysModel: {
        findUnique: vi.fn(),
      },
      sysField: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      sysEntity: {
        findUnique: vi.fn(),
      },
      sysDict: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    ddlManager = {
      addColumn: vi.fn(),
      dropColumn: vi.fn(),
      createForeignKeyIndex: vi.fn(),
      syncUniqueIndex: vi.fn(),
      syncNotNull: vi.fn(),
      countNulls: vi.fn(),
      backfillNulls: vi.fn(),
      createJunctionTable: vi.fn(),
      dropJunctionTable: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        FieldService,
        { provide: PrismaService, useValue: prisma },
        { provide: DdlManagerService, useValue: ddlManager },
      ],
    }).compile();

    service = module.get(FieldService);
  });

  it('should reject MULTI_REFERENCE on entity fields', async () => {
    prisma.sysModel.findUnique.mockResolvedValue({ id: 'model-1', tableName: 'test_table', appId: 'app-1' });
    prisma.sysField.findFirst.mockResolvedValue(null);

    await expect(
      service.create('model-1', {
        name: 'Tags',
        columnName: 'tags',
        fieldType: 'MULTI_REFERENCE',
        entityId: 'entity-1',
        options: { targetModelId: 'target-1' },
      }),
    ).rejects.toThrow(BusinessException);
  });

  it('should allow MULTI_REFERENCE on model-level fields (no entityId)', async () => {
    prisma.sysModel.findUnique.mockResolvedValue({ id: 'model-1', tableName: 'test_table', appId: 'app-1', code: 'src', dataScope: 'shared' });
    prisma.sysField.findFirst.mockResolvedValue(null);
    prisma.sysField.create.mockResolvedValue({ id: 'field-1', fieldType: 'MULTI_REFERENCE', columnName: 'tags', modelId: 'model-1', options: { targetModelId: 'target-1' } });
    prisma.sysField.update.mockResolvedValue({});
    prisma.sysModel.findUnique
      .mockResolvedValueOnce({ id: 'model-1', tableName: 'test_table', appId: 'app-1', code: 'src', dataScope: 'shared' })
      .mockResolvedValueOnce({ id: 'model-1', tableName: 'test_table', code: 'src' })
      .mockResolvedValueOnce({ id: 'target-1', tableName: 'target_table', code: 'tgt' });
    ddlManager.createJunctionTable.mockResolvedValue(undefined);

    // Should not throw — MULTI_REFERENCE is allowed when entityId is absent
    const result = await service.create('model-1', {
      name: 'Tags',
      columnName: 'tags',
      fieldType: 'MULTI_REFERENCE',
      options: { targetModelId: 'target-1' },
    });

    expect(result).toBeDefined();
    expect(ddlManager.createJunctionTable).toHaveBeenCalled();
  });
});
