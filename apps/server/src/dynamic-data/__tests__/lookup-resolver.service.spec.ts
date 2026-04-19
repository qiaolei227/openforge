import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { LookupResolverService } from '../lookup-resolver.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

const stringField = {
  id: 'f_string',
  columnName: 'name',
  fieldType: 'STRING',
  options: {},
};

const makeLookupField = (overrides: Partial<{
  id: string;
  columnName: string;
  sourceFieldId: string;
  targetFieldColumnName: string;
}> = {}) => ({
  id: overrides.id ?? 'lf_1',
  columnName: overrides.columnName ?? 'material_name',
  fieldType: 'LOOKUP',
  options: {
    sourceFieldId: overrides.sourceFieldId ?? 'sf_material_id',
    targetFieldColumnName: overrides.targetFieldColumnName ?? 'name',
  },
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe('LookupResolverService', () => {
  let service: LookupResolverService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      sysField: { findMany: vi.fn() },
      sysModel: { findUnique: vi.fn() },
      $queryRawUnsafe: vi.fn(),
    };
    const mod = await Test.createTestingModule({
      providers: [
        LookupResolverService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(LookupResolverService);
  });

  // ─── Test 1: no-op when no LOOKUP fields ───────────────────────────────────
  it('should do nothing when there are no LOOKUP fields', async () => {
    const records = [{ id: 'r1', name: 'a' }];
    await service.resolve(records, [stringField]);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.sysField.findMany).not.toHaveBeenCalled();
  });

  // ─── Test 2: batch resolve single scalar LOOKUP across 4 records ───────────
  it('should batch-resolve a scalar LOOKUP across 4 records with one IN query', async () => {
    const records = [
      { id: 'r1', material_id: 'mat_1' },
      { id: 'r2', material_id: 'mat_2' },
      { id: 'r3', material_id: 'mat_1' }, // duplicate FK → same IN query
      { id: 'r4', material_id: null },     // null FK → stays null
    ];
    const lookupField = makeLookupField();
    const sourceFieldMeta = {
      id: 'sf_material_id',
      columnName: 'material_id',
      fieldType: 'REFERENCE',
      options: { targetModelId: 'm_material' },
    };

    prisma.sysField.findMany.mockResolvedValue([sourceFieldMeta]);
    prisma.sysModel.findUnique.mockResolvedValue({
      id: 'm_material',
      tableName: 'app_material',
      fields: [{ columnName: 'name', fieldType: 'STRING', options: {} }],
    });
    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 'mat_1', name: '螺丝' },
      { id: 'mat_2', name: '螺母' },
    ]);

    await service.resolve(records, [stringField, lookupField]);

    // Only one IN query should have been issued (Stage B)
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);

    expect(records[0].material_name).toBe('螺丝');
    expect(records[1].material_name).toBe('螺母');
    expect(records[2].material_name).toBe('螺丝');
    expect(records[3].material_name).toBeNull();
  });

  // ─── Test 3: dangling FK ──────────────────────────────────────────────────
  it('should set LOOKUP to null and warn on dangling FK', async () => {
    const records = [{ id: 'r1', material_id: 'missing_id' }];
    const lookupField = makeLookupField();
    const sourceFieldMeta = {
      id: 'sf_material_id',
      columnName: 'material_id',
      fieldType: 'REFERENCE',
      options: { targetModelId: 'm_material' },
    };

    prisma.sysField.findMany.mockResolvedValue([sourceFieldMeta]);
    prisma.sysModel.findUnique.mockResolvedValue({
      id: 'm_material',
      tableName: 'app_material',
      fields: [{ columnName: 'name', fieldType: 'STRING', options: {} }],
    });
    // Target row missing — returns empty array
    prisma.$queryRawUnsafe.mockResolvedValue([]);

    const warnMock = vi.fn();
    (service as any).logger = { warn: warnMock, error: vi.fn() };

    await service.resolve(records, [lookupField]);

    expect(records[0].material_name).toBeNull();
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining('dangling FK'),
    );
  });

  // ─── Test 4: skipAlreadyResolved=true ────────────────────────────────────
  it('should skip resolution when skipAlreadyResolved=true and values are already set', async () => {
    const records = [
      { id: 'r1', material_id: 'mat_1', material_name: 'preset' },
    ];
    const lookupField = makeLookupField();
    const sourceFieldMeta = {
      id: 'sf_material_id',
      columnName: 'material_id',
      fieldType: 'REFERENCE',
      options: { targetModelId: 'm_material' },
    };

    prisma.sysField.findMany.mockResolvedValue([sourceFieldMeta]);
    prisma.sysModel.findUnique.mockResolvedValue({
      id: 'm_material',
      tableName: 'app_material',
      fields: [{ columnName: 'name', fieldType: 'STRING', options: {} }],
    });

    await service.resolve(records, [lookupField], { skipAlreadyResolved: true });

    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(records[0].material_name).toBe('preset');
  });

  // ─── Test 5: two-hop for REFERENCE target ─────────────────────────────────
  it('should resolve two-hop LOOKUP when target field is REFERENCE', async () => {
    // LOOKUP: material_supplier_name
    //   source: material_id (REFERENCE → material)
    //   target col: default_supplier_id (REFERENCE → supplier, display='name')
    const records = [
      { id: 'r1', material_id: 'mat_1' },
    ];
    const lookupField: any = {
      id: 'lf_supplier',
      columnName: 'material_supplier_name',
      fieldType: 'LOOKUP',
      options: {
        sourceFieldId: 'sf_material_id',
        targetFieldColumnName: 'default_supplier_id',
      },
    };
    const sourceFieldMeta = {
      id: 'sf_material_id',
      columnName: 'material_id',
      fieldType: 'REFERENCE',
      options: { targetModelId: 'm_material' },
    };

    // sysField.findMany returns source field
    prisma.sysField.findMany.mockResolvedValue([sourceFieldMeta]);

    // sysModel.findUnique called twice:
    //   1st call → material model (tableName + fields including default_supplier_id)
    //   2nd call → supplier model (tableName only, for Stage C)
    prisma.sysModel.findUnique
      .mockResolvedValueOnce({
        id: 'm_material',
        tableName: 'app_material',
        fields: [
          {
            columnName: 'default_supplier_id',
            fieldType: 'REFERENCE',
            options: { targetModelId: 'm_supplier', targetDisplayField: 'name' },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 'm_supplier',
        tableName: 'app_supplier',
      });

    // $queryRawUnsafe called twice:
    //   1st → material table: { id: 'mat_1', default_supplier_id: 'sup_1' }
    //   2nd → supplier table: { id: 'sup_1', name: '海尔供应商' }
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'mat_1', default_supplier_id: 'sup_1' }])
      .mockResolvedValueOnce([{ id: 'sup_1', name: '海尔供应商' }]);

    await service.resolve(records, [lookupField]);

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    expect(records[0].material_supplier_name).toBe('海尔供应商');
  });
});
