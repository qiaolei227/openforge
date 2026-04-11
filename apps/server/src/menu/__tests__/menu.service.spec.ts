import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { MenuService } from '../menu.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MenuService', () => {
  let service: MenuService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      sysMenu: { findMany: vi.fn() },
      sysRoleMenu: { findMany: vi.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [
        MenuService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MenuService);
  });

  it('returns all visible menus for is_admin with full permissions', async () => {
    prisma.sysMenu.findMany.mockResolvedValue([
      { id: 'g1', parentId: null, code: 'sys:management', type: 'group',
        name: '系统管理', sortOrder: 100, visible: true },
      { id: 'p1', parentId: 'g1', code: 'sys:users', type: 'page',
        name: '用户', sortOrder: 10, visible: true, targetRoute: '/users' },
    ]);
    const tree = await service.buildTreeForUser({ id: 'u1', isAdmin: true });
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].code).toBe('sys:users');
    expect(tree[0].children[0].permissions).toContain('view');
    expect(tree[0].children[0].permissions).toContain('delete');
  });

  it('filters pages without view permission for non-admin', async () => {
    prisma.sysMenu.findMany.mockResolvedValue([
      { id: 'g1', parentId: null, code: 'sys:management', type: 'group',
        name: '系统管理', sortOrder: 100, visible: true },
      { id: 'p1', parentId: 'g1', code: 'sys:users', type: 'page',
        name: '用户', sortOrder: 10, visible: true, targetRoute: '/users' },
      { id: 'p2', parentId: 'g1', code: 'sys:orgs', type: 'page',
        name: '组织', sortOrder: 20, visible: true, targetRoute: '/orgs' },
    ]);
    prisma.sysRoleMenu.findMany.mockResolvedValue([
      { menuCode: 'sys:users', permissions: ['view'] },
    ]);
    const tree = await service.buildTreeForUser({ id: 'u1', isAdmin: false });
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].code).toBe('sys:users');
  });

  it('drops group nodes with no visible children', async () => {
    prisma.sysMenu.findMany.mockResolvedValue([
      { id: 'g1', parentId: null, code: 'sys:management', type: 'group',
        name: '系统管理', sortOrder: 100, visible: true },
      { id: 'p1', parentId: 'g1', code: 'sys:users', type: 'page',
        name: '用户', sortOrder: 10, visible: true, targetRoute: '/users' },
    ]);
    prisma.sysRoleMenu.findMany.mockResolvedValue([]);
    const tree = await service.buildTreeForUser({ id: 'u1', isAdmin: false });
    expect(tree).toHaveLength(0);
  });

  it('excludes visible=false menus', async () => {
    prisma.sysMenu.findMany.mockResolvedValue([]);
    await service.buildTreeForUser({ id: 'u1', isAdmin: true });
    expect(prisma.sysMenu.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ visible: true }),
      }),
    );
  });

  it('merges permissions across multiple roles for same menu', async () => {
    prisma.sysMenu.findMany.mockResolvedValue([
      { id: 'p1', parentId: null, code: 'sys:users', type: 'page',
        name: '用户', sortOrder: 10, visible: true, targetRoute: '/users' },
    ]);
    prisma.sysRoleMenu.findMany.mockResolvedValue([
      { menuCode: 'sys:users', permissions: ['view', 'create'] },
      { menuCode: 'sys:users', permissions: ['view', 'edit'] },
    ]);
    const tree = await service.buildTreeForUser({ id: 'u1', isAdmin: false });
    const perms = tree[0].permissions.sort();
    expect(perms).toEqual(['create', 'edit', 'view']);
  });
});
