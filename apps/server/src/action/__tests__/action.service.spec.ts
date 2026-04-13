import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ActionService } from '../action.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';

describe('ActionService', () => {
  let service: ActionService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      sysAction: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        createMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      sysModel: {
        findUnique: vi.fn(),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        ActionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ActionService);
  });

  it('should generate system actions for model without data status', async () => {
    prisma.sysAction.createMany.mockResolvedValue({ count: 5 });
    prisma.sysModel.findUnique.mockResolvedValue({ id: 'm1', enableDataStatus: false });

    await service.generateSystemActions('m1');

    const call = prisma.sysAction.createMany.mock.calls[0][0];
    const codes = call.data.map((a: any) => a.code);
    expect(codes).toContain('create');
    expect(codes).toContain('edit');
    expect(codes).toContain('delete');
    expect(codes).toContain('archive');
    expect(codes).toContain('unarchive');
    expect(codes).not.toContain('submit');
  });

  it('should generate system actions for model with data status', async () => {
    prisma.sysAction.createMany.mockResolvedValue({ count: 11 });
    prisma.sysModel.findUnique.mockResolvedValue({ id: 'm1', enableDataStatus: true });

    await service.generateSystemActions('m1');

    const call = prisma.sysAction.createMany.mock.calls[0][0];
    const codes = call.data.map((a: any) => a.code);
    expect(codes).toContain('submit');
    expect(codes).toContain('approve');
    expect(codes).toContain('reject');
    expect(codes).toContain('withdraw');
    expect(codes).toContain('unapprove');
    expect(codes).toContain('revise');
  });

  it('should not allow deleting system actions', async () => {
    prisma.sysAction.findUnique.mockResolvedValue({ id: 'a1', category: 'system' });

    await expect(service.delete('a1')).rejects.toThrow(BusinessException);
  });

  it('should allow deleting custom actions', async () => {
    prisma.sysAction.findUnique.mockResolvedValue({ id: 'a1', category: 'custom' });
    prisma.sysAction.delete.mockResolvedValue({});

    await service.delete('a1');
    expect(prisma.sysAction.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });
});
