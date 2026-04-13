import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AccessibleAppsService } from '../accessible-apps.service';
import type { PrismaService } from '../../prisma/prisma.service';

describe('AccessibleAppsService', () => {
  let service: AccessibleAppsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      sysApp: { findMany: vi.fn() },
    };
    service = new AccessibleAppsService(prisma as PrismaService);
  });

  describe('listForUser', () => {
    it('returns ALL apps for admin', async () => {
      prisma.sysApp.findMany.mockResolvedValue([
        { id: 'a1', code: 'sales', name: '销售系统', icon: 'ShoppingCart', themeColor: null, sortOrder: 0, description: null },
      ]);
      const result = await service.listForUser({ userId: 'u1', isAdmin: true, identity: 'admin' });
      expect(prisma.sysApp.findMany).toHaveBeenCalledWith({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      expect(result).toHaveLength(1);
    });

    it('returns apps with menu VIEW permission for non-admin', async () => {
      prisma.sysApp.findMany.mockResolvedValue([
        { id: 'a1', code: 'sales', name: '销售系统', icon: null, themeColor: '#ef4444', sortOrder: 0, description: null },
      ]);
      const result = await service.listForUser({ userId: 'u1', isAdmin: false, identity: 'user' });
      expect(prisma.sysApp.findMany).toHaveBeenCalledWith({
        where: {
          menus: {
            some: {
              roleMenus: {
                some: {
                  permissions: { has: 'view' },
                  role: { userRoles: { some: { userId: 'u1' } } },
                },
              },
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      expect(result).toHaveLength(1);
    });

    it('returns empty array when user has no permissions', async () => {
      prisma.sysApp.findMany.mockResolvedValue([]);
      const result = await service.listForUser({ userId: 'u1', isAdmin: false, identity: 'user' });
      expect(result).toEqual([]);
    });

    it('returns designer-created apps even without role permissions', async () => {
      prisma.sysApp.findMany.mockResolvedValue([
        { id: 'a1', code: 'sales', name: '销售系统', icon: null, themeColor: null, sortOrder: 0, description: null },
      ]);
      const result = await service.listForUser({ userId: 'u1', isAdmin: false, identity: 'designer' });
      expect(prisma.sysApp.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { createdBy: 'u1' },
            ]),
          }),
        }),
      );
      expect(result).toHaveLength(1);
    });
  });
});
