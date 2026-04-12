import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ViewService } from '../view.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';

describe('ViewService', () => {
  let service: ViewService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      sysView: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
      },
      sysMenu: {
        count: vi.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        ViewService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ViewService);
  });

  describe('delete', () => {
    const viewId = 'view-uuid-1';
    const mockView = {
      id: viewId,
      name: 'Test View',
      modelId: 'model-uuid-1',
      type: 'list',
      isDefault: false,
    };

    it('rejects delete when menus reference the view', async () => {
      prisma.sysView.findUnique.mockResolvedValue(mockView);
      prisma.sysMenu.count.mockResolvedValue(1);

      await expect(service.delete(viewId)).rejects.toThrow(BusinessException);

      // Verify the menu count was checked with the correct targetViewId
      expect(prisma.sysMenu.count).toHaveBeenCalledWith({
        where: { targetViewId: viewId },
      });
    });

    it('proceeds when no menus reference the view', async () => {
      prisma.sysView.findUnique.mockResolvedValue(mockView);
      prisma.sysMenu.count.mockResolvedValue(0);
      prisma.sysView.delete.mockResolvedValue(undefined);
      // non-default view, so no promotion needed

      await service.delete(viewId);
      expect(prisma.sysView.delete).toHaveBeenCalledWith({ where: { id: viewId } });
    });
  });
});
