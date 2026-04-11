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
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
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

  it('upserts all MenuDef entries', async () => {
    prisma.sysMenu.findUnique.mockResolvedValue({ id: 'mgmt-uuid' });
    await service.onModuleInit();
    expect(prisma.sysMenu.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.sysMenu.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: 'sys:foo' },
      }),
    );
  });

  it('marks missing coded menus as visible=false', async () => {
    prisma.sysMenu.findUnique.mockResolvedValue(null);
    await service.onModuleInit();
    expect(prisma.sysMenu.updateMany).toHaveBeenCalledWith({
      where: { source: 'coded', code: { notIn: ['sys:foo', 'sys:management'] } },
      data: { visible: false },
    });
  });

  it('rebuilds parent_id links after upserts', async () => {
    prisma.sysMenu.findUnique.mockImplementation(({ where }: any) =>
      where.code === 'sys:management' ? { id: 'mgmt-uuid' } : null,
    );
    await service.onModuleInit();
    expect(prisma.sysMenu.update).toHaveBeenCalledWith({
      where: { code: 'sys:foo' },
      data: { parentId: 'mgmt-uuid' },
    });
  });

  it('is idempotent (second run produces same mutation set)', async () => {
    prisma.sysMenu.findUnique.mockResolvedValue({ id: 'mgmt-uuid' });
    await service.onModuleInit();
    const first = prisma.sysMenu.upsert.mock.calls.length;
    await service.onModuleInit();
    expect(prisma.sysMenu.upsert.mock.calls.length).toBe(first * 2);
  });
});
