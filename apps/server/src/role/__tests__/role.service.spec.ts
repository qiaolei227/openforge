import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { RoleService } from '../role.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';

describe('RoleService', () => {
  let service: RoleService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      sysRole: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      sysUserRole: {
        count: vi.fn(),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        RoleService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(RoleService);
  });

  describe('create', () => {
    it('creates a role with unique code', async () => {
      prisma.sysRole.findUnique.mockResolvedValue(null);
      prisma.sysRole.create.mockResolvedValue({ id: 'r1', code: 'sales_user', name: '销售员' });
      const result = await service.create({ code: 'sales_user', name: '销售员' });
      expect(result.code).toBe('sales_user');
    });

    it('throws ROLE_CODE_DUPLICATE on conflict', async () => {
      prisma.sysRole.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create({ code: 'sales_user', name: '销售员' }),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('delete', () => {
    it('throws ROLE_HAS_USERS when role is bound to users', async () => {
      prisma.sysRole.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.sysUserRole.count.mockResolvedValue(3);
      await expect(service.delete('r1')).rejects.toThrow(BusinessException);
    });

    it('deletes role when no user bindings', async () => {
      prisma.sysRole.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.sysUserRole.count.mockResolvedValue(0);
      prisma.sysRole.delete.mockResolvedValue({});
      await service.delete('r1');
      expect(prisma.sysRole.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    });
  });

  describe('list', () => {
    it('supports keyword search on code and name', async () => {
      prisma.sysRole.findMany.mockResolvedValue([]);
      prisma.sysRole.count.mockResolvedValue(0);
      await service.list({ keyword: 'sales' });
      expect(prisma.sysRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { code: { contains: 'sales', mode: 'insensitive' } },
              { name: { contains: 'sales', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });
  });
});
