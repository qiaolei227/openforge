import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { RolePermissionService } from '../role-permission.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';

describe('RolePermissionService', () => {
  let service: RolePermissionService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      sysRolePermission: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
      sysRole: {
        findUnique: vi.fn(),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        RolePermissionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(RolePermissionService);
  });

  describe('listByRole', () => {
    it('returns grants for a role', async () => {
      prisma.sysRole.findUnique.mockResolvedValue({ id: 'r1' });
      const grants = [
        { id: 'g1', roleId: 'r1', resource: 'designer:models', actions: ['view', 'create'] },
        { id: 'g2', roleId: 'r1', resource: 'platform:users', actions: ['view'] },
      ];
      prisma.sysRolePermission.findMany.mockResolvedValue(grants);

      const result = await service.listByRole('r1');
      expect(result).toEqual(grants);
      expect(prisma.sysRolePermission.findMany).toHaveBeenCalledWith({
        where: { roleId: 'r1' },
        orderBy: { resource: 'asc' },
      });
    });

    it('throws ROLE_NOT_FOUND when role does not exist', async () => {
      prisma.sysRole.findUnique.mockResolvedValue(null);
      await expect(service.listByRole('nonexistent')).rejects.toThrow(BusinessException);
    });
  });

  describe('grant', () => {
    it('upserts a permission', async () => {
      prisma.sysRole.findUnique.mockResolvedValue({ id: 'r1' });
      const upserted = { id: 'g1', roleId: 'r1', resource: 'platform:users', actions: ['view', 'create'] };
      prisma.sysRolePermission.upsert.mockResolvedValue(upserted);

      const result = await service.grant('r1', { resource: 'platform:users', actions: ['view', 'create'] });
      expect(result).toEqual(upserted);
      expect(prisma.sysRolePermission.upsert).toHaveBeenCalledWith({
        where: { roleId_resource: { roleId: 'r1', resource: 'platform:users' } },
        create: { roleId: 'r1', resource: 'platform:users', actions: ['view', 'create'] },
        update: { actions: ['view', 'create'] },
      });
    });
  });

  describe('revoke', () => {
    it('deletes a permission', async () => {
      prisma.sysRole.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.sysRolePermission.delete.mockResolvedValue({});

      await service.revoke('r1', { resource: 'platform:users' });
      expect(prisma.sysRolePermission.delete).toHaveBeenCalledWith({
        where: { roleId_resource: { roleId: 'r1', resource: 'platform:users' } },
      });
    });
  });

  describe('check', () => {
    it('returns true when grant exists', async () => {
      prisma.sysRolePermission.findFirst.mockResolvedValue({
        id: 'g1', roleId: 'r1', resource: 'platform:users', actions: ['view'],
      });

      const result = await service.check(['r1'], 'platform:users', 'view');
      expect(result).toBe(true);
      expect(prisma.sysRolePermission.findFirst).toHaveBeenCalledWith({
        where: {
          roleId: { in: ['r1'] },
          resource: 'platform:users',
          actions: { has: 'view' },
        },
      });
    });

    it('returns false when no grant or empty roleIds', async () => {
      // Empty roleIds — should short-circuit without querying
      const result1 = await service.check([], 'platform:users', 'view');
      expect(result1).toBe(false);
      expect(prisma.sysRolePermission.findFirst).not.toHaveBeenCalled();

      // Non-empty roleIds but no matching grant
      prisma.sysRolePermission.findFirst.mockResolvedValue(null);
      const result2 = await service.check(['r1'], 'platform:users', 'delete');
      expect(result2).toBe(false);
    });
  });
});
