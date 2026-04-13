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
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        createMany: vi.fn(),
        deleteMany: vi.fn(),
        upsert: vi.fn(),
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
    prisma.sysAction.createMany.mockResolvedValue({ count: 3 });
    prisma.sysAction.findFirst.mockResolvedValue({ id: 'archive-id' });
    prisma.sysAction.upsert.mockResolvedValue({});
    prisma.sysModel.findUnique.mockResolvedValue({ id: 'm1', enableDataStatus: false });

    await service.generateSystemActions('m1');

    const call = prisma.sysAction.createMany.mock.calls[0][0];
    const codes = call.data.map((a: any) => a.code);
    expect(codes).toContain('create');
    expect(codes).not.toContain('edit');
    expect(codes).toContain('delete');
    expect(codes).toContain('archive');
    expect(codes).not.toContain('unarchive'); // unarchive is child of archive
    expect(codes).not.toContain('submit');
    // unarchive linked as child of archive via upsert
    expect(prisma.sysAction.upsert).toHaveBeenCalled();
  });

  it('should generate system actions for model with data status', async () => {
    prisma.sysAction.createMany.mockResolvedValue({ count: 5 });
    prisma.sysAction.findFirst.mockResolvedValue({ id: 'parent-id' });
    prisma.sysAction.upsert.mockResolvedValue({});
    prisma.sysModel.findUnique.mockResolvedValue({ id: 'm1', enableDataStatus: true });

    await service.generateSystemActions('m1');

    const call = prisma.sysAction.createMany.mock.calls[0][0];
    const codes = call.data.map((a: any) => a.code);
    // Top-level split parents
    expect(codes).toContain('submit');
    expect(codes).toContain('approve');
    // Children (withdraw, unapprove) are linked via upsert, not in createMany
    expect(codes).not.toContain('withdraw');
    expect(codes).not.toContain('unapprove');
    // 3 upserts: unarchive→archive, withdraw→submit, unapprove→approve
    expect(prisma.sysAction.upsert).toHaveBeenCalledTimes(3);
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
