import 'reflect-metadata';
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

describe('ActionService.syncDistributeAction', () => {
  let service: ActionService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      sysAction: { upsert: vi.fn(), deleteMany: vi.fn() },
    };
    service = new ActionService(prisma);
  });

  it('upserts distribute action when dataScope = distributed', async () => {
    await service.syncDistributeAction('m1', 'distributed');
    expect(prisma.sysAction.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { modelId_code: { modelId: 'm1', code: 'distribute' } },
      create: expect.objectContaining({
        modelId: 'm1',
        code: 'distribute',
        category: 'system',
        actionType: 'builtin',
      }),
    }));
    expect(prisma.sysAction.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes distribute action when dataScope is not distributed', async () => {
    await service.syncDistributeAction('m1', 'private');
    expect(prisma.sysAction.deleteMany).toHaveBeenCalledWith({
      where: { modelId: 'm1', code: 'distribute', category: 'system' },
    });
    expect(prisma.sysAction.upsert).not.toHaveBeenCalled();
  });
});

describe('ActionService.generateSystemActions includes distribute for distributed models', () => {
  let service: ActionService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      sysModel: { findUnique: vi.fn() },
      sysAction: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        upsert: vi.fn(),
        findFirst: vi.fn(),
      },
    };
    service = new ActionService(prisma);
  });

  it('includes distribute action in createMany when dataScope=distributed', async () => {
    prisma.sysModel.findUnique.mockResolvedValue({
      id: 'm1', dataScope: 'distributed', enableDataStatus: false,
    });
    await service.generateSystemActions('m1');
    const call = prisma.sysAction.createMany.mock.calls[0][0];
    const codes = call.data.map((a: any) => a.code);
    expect(codes).toContain('distribute');
  });

  it('does not include distribute action when dataScope=private', async () => {
    prisma.sysModel.findUnique.mockResolvedValue({
      id: 'm1', dataScope: 'private', enableDataStatus: false,
    });
    await service.generateSystemActions('m1');
    const call = prisma.sysAction.createMany.mock.calls[0][0];
    const codes = call.data.map((a: any) => a.code);
    expect(codes).not.toContain('distribute');
  });
});
