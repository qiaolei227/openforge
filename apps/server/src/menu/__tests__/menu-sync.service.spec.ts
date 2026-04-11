import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { MenuSyncService } from '../menu-sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MENU_DEF_TOKEN, type MenuDef } from '@openforge/shared';

describe('MenuSyncService', () => {
  let service: MenuSyncService;
  let prisma: any;

  const FOO: MenuDef = {
    code: 'sys:foo',
    parentCode: 'sys:management',
    type: 'page',
    name: 'Foo',
    icon: 'Foo',
    sortOrder: 10,
    targetRoute: '/foo',
  };
  const MGMT: MenuDef = {
    code: 'sys:management',
    parentCode: null,
    type: 'group',
    name: '系统管理',
    icon: 'Settings',
    sortOrder: 100,
  };

  beforeEach(async () => {
    prisma = {
      sysMenu: {
        upsert: vi.fn().mockResolvedValue({ id: 'uuid-fake' }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn((operations: any) => Promise.all(operations)),
    };
    const module = await Test.createTestingModule({
      providers: [
        MenuSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: MENU_DEF_TOKEN, useValue: [FOO, MGMT] },
      ],
    }).compile();
    service = module.get(MenuSyncService);
  });

  it('upserts all MenuDef entries (batched in one $transaction)', async () => {
    await service.onModuleInit();
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.sysMenu.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.sysMenu.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'sys:foo' } }),
    );
    expect(prisma.sysMenu.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'sys:management' } }),
    );
  });

  it('marks missing coded menus as visible=false', async () => {
    await service.onModuleInit();
    expect(prisma.sysMenu.updateMany).toHaveBeenCalledWith({
      where: { source: 'coded', code: { notIn: ['sys:foo', 'sys:management'] } },
      data: { visible: false },
    });
  });

  it('rebuilds parent_id links via a single findMany + batched updates', async () => {
    prisma.sysMenu.findMany.mockResolvedValue([
      { id: 'foo-uuid', code: 'sys:foo' },
      { id: 'mgmt-uuid', code: 'sys:management' },
    ]);
    await service.onModuleInit();
    expect(prisma.sysMenu.findMany).toHaveBeenCalledWith({
      where: { code: { in: ['sys:foo', 'sys:management'] } },
      select: { id: true, code: true },
    });
    expect(prisma.sysMenu.update).toHaveBeenCalledWith({
      where: { code: 'sys:foo' },
      data: { parentId: 'mgmt-uuid' },
    });
  });

  it('is idempotent: second run fires the same mutations', async () => {
    prisma.sysMenu.findMany.mockResolvedValue([
      { id: 'foo-uuid', code: 'sys:foo' },
      { id: 'mgmt-uuid', code: 'sys:management' },
    ]);
    await service.onModuleInit();
    const firstUpserts = prisma.sysMenu.upsert.mock.calls.length;
    const firstUpdates = prisma.sysMenu.update.mock.calls.length;
    await service.onModuleInit();
    expect(prisma.sysMenu.upsert.mock.calls.length).toBe(firstUpserts * 2);
    expect(prisma.sysMenu.update.mock.calls.length).toBe(firstUpdates * 2);
  });
});
