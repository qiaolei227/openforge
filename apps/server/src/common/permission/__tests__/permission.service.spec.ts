import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PermissionService } from '../permission.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('PermissionService', () => {
  let service: PermissionService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      sysRoleMenu: {
        findMany: vi.fn(),
      },
      sysFieldPermission: {
        findMany: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PermissionService>(PermissionService);
  });

  describe('check (static menu)', () => {
    it('returns true when any of the user roles has the action', async () => {
      prisma.sysRoleMenu.findMany.mockResolvedValue([
        { permissions: ['view', 'create'] },
        { permissions: ['view'] },
      ]);
      expect(await service.check('user-1', 'sys:users', 'create')).toBe(true);
    });

    it('returns false when no role grants the action', async () => {
      prisma.sysRoleMenu.findMany.mockResolvedValue([
        { permissions: ['view'] },
      ]);
      expect(await service.check('user-1', 'sys:users', 'delete')).toBe(false);
    });

    it('returns false when user has no roles on the menu', async () => {
      prisma.sysRoleMenu.findMany.mockResolvedValue([]);
      expect(await service.check('user-1', 'sys:users', 'view')).toBe(false);
    });
  });

  describe('check (dynamic model menu)', () => {
    it('resolves menu:model:{app}:{model} via sys_menu join', async () => {
      prisma.sysRoleMenu.findMany.mockResolvedValue([
        { permissions: ['view', 'edit'] },
      ]);
      const ok = await service.check('user-1', 'menu:model:purchase:order', 'edit');
      expect(ok).toBe(true);
      expect(prisma.sysRoleMenu.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            menu: expect.objectContaining({
              type: 'model',
              targetAppCode: 'purchase',
              targetModelCode: 'order',
            }),
          }),
        }),
      );
    });

    it('returns false for malformed dynamic menu code', async () => {
      expect(await service.check('user-1', 'menu:model:incomplete', 'view')).toBe(false);
    });
  });

  describe('union semantics', () => {
    it('aggregates permissions across multiple rows (role union)', async () => {
      prisma.sysRoleMenu.findMany.mockResolvedValue([
        { permissions: ['view'] },
        { permissions: ['create'] },
        { permissions: ['edit', 'archive'] },
      ]);
      expect(await service.check('u', 'sys:users', 'view')).toBe(true);
      expect(await service.check('u', 'sys:users', 'create')).toBe(true);
      expect(await service.check('u', 'sys:users', 'edit')).toBe(true);
      expect(await service.check('u', 'sys:users', 'archive')).toBe(true);
      expect(await service.check('u', 'sys:users', 'delete')).toBe(false);
    });
  });

  describe('sys:self virtual permission', () => {
    it('always returns true for sys:self regardless of user or action', async () => {
      expect(await service.check('any-user', 'sys:self', 'view')).toBe(true);
      expect(await service.check('any-user', 'sys:self', 'edit')).toBe(true);
      // should not have queried the DB
      expect(prisma.sysRoleMenu.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getFieldPermissions', () => {
    it('returns empty map when no rows', async () => {
      prisma.sysFieldPermission.findMany.mockResolvedValue([]);
      const result = await service.getFieldPermissions('u1', 'model-1');
      expect(result.size).toBe(0);
    });

    it('maps hidden and readonly access per field', async () => {
      prisma.sysFieldPermission.findMany.mockResolvedValue([
        { fieldId: 'f1', access: 'hidden' },
        { fieldId: 'f2', access: 'readonly' },
      ]);
      const result = await service.getFieldPermissions('u1', 'model-1');
      expect(result.get('f1')).toBe('hidden');
      expect(result.get('f2')).toBe('readonly');
    });

    it('takes the widest access across multiple rows (editable > readonly > hidden)', async () => {
      prisma.sysFieldPermission.findMany.mockResolvedValue([
        { fieldId: 'f1', access: 'hidden' },
        { fieldId: 'f1', access: 'readonly' },
        { fieldId: 'f1', access: 'editable' },
        { fieldId: 'f2', access: 'hidden' },
        { fieldId: 'f2', access: 'readonly' },
        { fieldId: 'f3', access: 'hidden' },
        { fieldId: 'f3', access: 'hidden' },
      ]);
      const result = await service.getFieldPermissions('u1', 'model-1');
      expect(result.get('f1')).toBe('editable');  // widest wins
      expect(result.get('f2')).toBe('readonly');
      expect(result.get('f3')).toBe('hidden');
    });
  });
});
