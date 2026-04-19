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

  describe('LOOKUP create/update validation', () => {
    const modelId = 'model-1';

    it('creates LOOKUP successfully with REFERENCE source + scalar target; ddlManager.addColumn NOT called', async () => {
      // model lookup
      prisma.sysModel.findUnique.mockResolvedValueOnce({
        id: modelId,
        tableName: 'app_model',
        appId: 'app-1',
        code: 'model',
        dataScope: 'shared',
      });
      // columnName uniqueness check
      prisma.sysField.findFirst.mockResolvedValueOnce(null);
      // source field (findUnique for validateLookupOptions)
      prisma.sysField.findUnique.mockResolvedValueOnce({
        id: 'src-field-1',
        modelId,
        entityId: null,
        fieldType: 'REFERENCE',
        options: { targetModelId: 'target-model-1' },
      });
      // target model with fields (findUnique in validateLookupOptions)
      prisma.sysModel.findUnique.mockResolvedValueOnce({
        id: 'target-model-1',
        fields: [
          { columnName: 'customer_name', fieldType: 'STRING', deletedAt: null },
        ],
      });
      // sysField.create (the actual field creation)
      prisma.sysField.create.mockResolvedValueOnce({
        id: 'lookup-field-1',
        fieldType: 'LOOKUP',
        columnName: 'cust_name',
        modelId,
      });
      // sortOrder findFirst
      prisma.sysField.findFirst.mockResolvedValueOnce(null);

      const result = await service.create(modelId, {
        name: '客户名称',
        columnName: 'cust_name',
        fieldType: 'LOOKUP',
        options: { sourceFieldId: 'src-field-1', targetFieldColumnName: 'customer_name' },
      });

      expect(result).toBeDefined();
      expect(ddlManager.addColumn).not.toHaveBeenCalled();
    });

    it('throws LOOKUP_SOURCE_FIELD_NOT_FOUND when sourceFieldId is invalid (field not in DB)', async () => {
      prisma.sysModel.findUnique.mockResolvedValueOnce({
        id: modelId,
        tableName: 'app_model',
        appId: 'app-1',
        code: 'model',
        dataScope: 'shared',
      });
      prisma.sysField.findFirst.mockResolvedValueOnce(null); // columnName check
      prisma.sysField.findUnique.mockResolvedValueOnce(null); // source field not found

      await expect(
        service.create(modelId, {
          name: '查找字段',
          columnName: 'lookup_col',
          fieldType: 'LOOKUP',
          options: { sourceFieldId: 'nonexistent-id', targetFieldColumnName: 'some_col' },
        }),
      ).rejects.toSatisfy((e: any) => e instanceof BusinessException && (e.getResponse() as any).errorCode === 'LOOKUP_SOURCE_FIELD_NOT_FOUND');
    });

    it('throws LOOKUP_SOURCE_TYPE_INVALID when source field is STRING type', async () => {
      prisma.sysModel.findUnique.mockResolvedValueOnce({
        id: modelId,
        tableName: 'app_model',
        appId: 'app-1',
        code: 'model',
        dataScope: 'shared',
      });
      prisma.sysField.findFirst.mockResolvedValueOnce(null); // columnName check
      prisma.sysField.findUnique.mockResolvedValueOnce({
        id: 'src-field-string',
        modelId,
        entityId: null,
        fieldType: 'STRING',
        options: {},
      });

      await expect(
        service.create(modelId, {
          name: '查找字段',
          columnName: 'lookup_col',
          fieldType: 'LOOKUP',
          options: { sourceFieldId: 'src-field-string', targetFieldColumnName: 'some_col' },
        }),
      ).rejects.toSatisfy((e: any) => e instanceof BusinessException && (e.getResponse() as any).errorCode === 'LOOKUP_SOURCE_TYPE_INVALID');
    });

    it('throws LOOKUP_SOURCE_MUST_BE_SAME_RECORD when source is on a different model', async () => {
      prisma.sysModel.findUnique.mockResolvedValueOnce({
        id: modelId,
        tableName: 'app_model',
        appId: 'app-1',
        code: 'model',
        dataScope: 'shared',
      });
      prisma.sysField.findFirst.mockResolvedValueOnce(null); // columnName check
      prisma.sysField.findUnique.mockResolvedValueOnce({
        id: 'src-field-other-model',
        modelId: 'other-model-id', // different model
        entityId: null,
        fieldType: 'REFERENCE',
        options: { targetModelId: 'target-model-1' },
      });

      await expect(
        service.create(modelId, {
          name: '查找字段',
          columnName: 'lookup_col',
          fieldType: 'LOOKUP',
          options: { sourceFieldId: 'src-field-other-model', targetFieldColumnName: 'some_col' },
        }),
      ).rejects.toSatisfy((e: any) => e instanceof BusinessException && (e.getResponse() as any).errorCode === 'LOOKUP_SOURCE_MUST_BE_SAME_RECORD');
    });

    it('throws LOOKUP_SOURCE_MUST_BE_SAME_RECORD when source is on a different entity', async () => {
      prisma.sysModel.findUnique.mockResolvedValueOnce({
        id: modelId,
        tableName: 'app_model',
        appId: 'app-1',
        code: 'model',
        dataScope: 'shared',
      });
      prisma.sysField.findFirst.mockResolvedValueOnce(null); // columnName check
      prisma.sysField.findUnique.mockResolvedValueOnce({
        id: 'src-field-entity-b',
        modelId,
        entityId: 'entity-b', // different entity
        fieldType: 'REFERENCE',
        options: { targetModelId: 'target-model-1' },
      });

      await expect(
        service.create(modelId, {
          name: '查找字段',
          columnName: 'lookup_col',
          fieldType: 'LOOKUP',
          entityId: 'entity-a', // current entity
          options: { sourceFieldId: 'src-field-entity-b', targetFieldColumnName: 'some_col' },
        }),
      ).rejects.toSatisfy((e: any) => e instanceof BusinessException && (e.getResponse() as any).errorCode === 'LOOKUP_SOURCE_MUST_BE_SAME_RECORD');
    });

    it('throws LOOKUP_TARGET_TYPE_NOT_ALLOWED for FILE target field', async () => {
      prisma.sysModel.findUnique.mockResolvedValueOnce({
        id: modelId,
        tableName: 'app_model',
        appId: 'app-1',
        code: 'model',
        dataScope: 'shared',
      });
      prisma.sysField.findFirst.mockResolvedValueOnce(null); // columnName check
      prisma.sysField.findUnique.mockResolvedValueOnce({
        id: 'src-ref-field',
        modelId,
        entityId: null,
        fieldType: 'REFERENCE',
        options: { targetModelId: 'target-model-1' },
      });
      prisma.sysModel.findUnique.mockResolvedValueOnce({
        id: 'target-model-1',
        fields: [{ columnName: 'attachment', fieldType: 'FILE', deletedAt: null }],
      });

      await expect(
        service.create(modelId, {
          name: '查找字段',
          columnName: 'lookup_col',
          fieldType: 'LOOKUP',
          options: { sourceFieldId: 'src-ref-field', targetFieldColumnName: 'attachment' },
        }),
      ).rejects.toSatisfy((e: any) => e instanceof BusinessException && (e.getResponse() as any).errorCode === 'LOOKUP_TARGET_TYPE_NOT_ALLOWED');
    });

    it('throws LOOKUP_TARGET_TYPE_NOT_ALLOWED for LOOKUP target field (no chaining)', async () => {
      prisma.sysModel.findUnique.mockResolvedValueOnce({
        id: modelId,
        tableName: 'app_model',
        appId: 'app-1',
        code: 'model',
        dataScope: 'shared',
      });
      prisma.sysField.findFirst.mockResolvedValueOnce(null); // columnName check
      prisma.sysField.findUnique.mockResolvedValueOnce({
        id: 'src-ref-field',
        modelId,
        entityId: null,
        fieldType: 'REFERENCE',
        options: { targetModelId: 'target-model-1' },
      });
      prisma.sysModel.findUnique.mockResolvedValueOnce({
        id: 'target-model-1',
        fields: [{ columnName: 'derived_col', fieldType: 'LOOKUP', deletedAt: null }],
      });

      await expect(
        service.create(modelId, {
          name: '查找字段',
          columnName: 'lookup_col',
          fieldType: 'LOOKUP',
          options: { sourceFieldId: 'src-ref-field', targetFieldColumnName: 'derived_col' },
        }),
      ).rejects.toSatisfy((e: any) => e instanceof BusinessException && (e.getResponse() as any).errorCode === 'LOOKUP_TARGET_TYPE_NOT_ALLOWED');
    });
  });
});
