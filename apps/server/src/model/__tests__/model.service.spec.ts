import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ModelService } from '../model.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../event-bus/event-bus.service';
import { DdlManagerService } from '../ddl-manager.service';
import { ActionService } from '../../action/action.service';
import { BusinessException } from '../../common/exceptions/business.exception';

describe('ModelService', () => {
  let service: ModelService;
  let prisma: any;
  let ddlManager: any;

  beforeEach(async () => {
    prisma = {
      sysModel: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      sysField: {
        deleteMany: vi.fn(),
      },
      sysMenu: {
        count: vi.fn(),
      },
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
    };

    ddlManager = {
      createTable: vi.fn(),
      dropTable: vi.fn(),
      countRecords: vi.fn(),
    };

    const eventBus = { emit: vi.fn() };
    const actionService = {
      generateSystemActions: vi.fn(),
      syncDataStatusActions: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ModelService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventBusService, useValue: eventBus },
        { provide: DdlManagerService, useValue: ddlManager },
        { provide: ActionService, useValue: actionService },
      ],
    }).compile();

    service = module.get(ModelService);
  });

  describe('delete', () => {
    const modelId = 'model-uuid-1';
    const mockModel = {
      id: modelId,
      name: 'Test Model',
      tableName: 'app1_test_model',
      app: { code: 'app1' },
      fields: [],
      entities: [],
      _count: { fields: 0 },
    };

    it('rejects delete when menus reference the model', async () => {
      prisma.sysModel.findUnique.mockResolvedValue(mockModel);
      prisma.sysMenu.count.mockResolvedValue(2);

      await expect(service.delete(modelId)).rejects.toThrow(BusinessException);

      // Verify the menu count was checked with the correct targetModelId
      expect(prisma.sysMenu.count).toHaveBeenCalledWith({
        where: { targetModelId: modelId },
      });
    });

    it('proceeds when no menus reference the model', async () => {
      prisma.sysModel.findUnique.mockResolvedValue(mockModel);
      prisma.sysMenu.count.mockResolvedValue(0);
      prisma.$queryRaw.mockResolvedValue([]); // no reference fields
      ddlManager.countRecords.mockResolvedValue(0); // no data records
      ddlManager.dropTable.mockResolvedValue(undefined);
      prisma.sysField.deleteMany.mockResolvedValue({});
      prisma.sysModel.delete.mockResolvedValue(mockModel);

      const result = await service.delete(modelId);
      expect(result).toEqual(mockModel);
      expect(ddlManager.dropTable).toHaveBeenCalledWith(mockModel.tableName);
    });
  });
});
