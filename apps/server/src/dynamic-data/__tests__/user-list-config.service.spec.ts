import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { UserListConfigService } from '../user-list-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';

describe('UserListConfigService', () => {
  let service: UserListConfigService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      sysUserListConfig: {
        upsert: vi.fn().mockResolvedValue(undefined),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        UserListConfigService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UserListConfigService);
  });

  describe('upsert', () => {
    it('accepts columns with only main fields', async () => {
      await service.upsert('u1', 'm1', { columns: ['name', 'qty'] });
      expect(prisma.sysUserListConfig.upsert).toHaveBeenCalled();
    });

    it('accepts columns mixing main and 1:1 entity fields', async () => {
      await service.upsert('u1', 'm1', {
        columns: ['name', '__oneToOne__customer__company_name', 'qty'],
      });
      expect(prisma.sysUserListConfig.upsert).toHaveBeenCalled();
    });

    it('accepts columns with a single detail entity', async () => {
      await service.upsert('u1', 'm1', {
        columns: ['name', '__detail__order_line__qty', '__detail__order_line__product_id'],
      });
      expect(prisma.sysUserListConfig.upsert).toHaveBeenCalled();
    });

    it('rejects columns with two different detail entities', async () => {
      await expect(
        service.upsert('u1', 'm1', {
          columns: ['__detail__order_line__qty', '__detail__shipment__tracking_no'],
        }),
      ).rejects.toBeInstanceOf(BusinessException);
      expect(prisma.sysUserListConfig.upsert).not.toHaveBeenCalled();
    });

    it('accepts config without columns key', async () => {
      await service.upsert('u1', 'm1', { pageSize: 50 });
      expect(prisma.sysUserListConfig.upsert).toHaveBeenCalled();
    });

    it('accepts empty columns array', async () => {
      await service.upsert('u1', 'm1', { columns: [] });
      expect(prisma.sysUserListConfig.upsert).toHaveBeenCalled();
    });
  });
});
