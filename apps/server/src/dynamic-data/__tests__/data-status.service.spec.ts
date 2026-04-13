import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { DataStatusService } from '../data-status.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';

describe('DataStatusService', () => {
  let service: DataStatusService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      $queryRawUnsafe: vi.fn(),
      $executeRawUnsafe: vi.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        DataStatusService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(DataStatusService);
  });

  describe('transition', () => {
    const tableName = 'test_table';
    const recordId = '550e8400-e29b-41d4-a716-446655440000';
    const userId = '660e8400-e29b-41d4-a716-446655440001';

    it('should submit a draft record', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ data_status: 'draft', created_by: userId }]);
      prisma.$executeRawUnsafe.mockResolvedValue(1);

      await service.transition(tableName, recordId, 'submit', userId);

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"data_status" = \'submitted\''),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should reject submit on non-draft record', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ data_status: 'submitted', created_by: userId }]);

      await expect(
        service.transition(tableName, recordId, 'submit', userId),
      ).rejects.toThrow(BusinessException);
    });

    it('should allow only submitter to withdraw', async () => {
      const otherUser = '770e8400-e29b-41d4-a716-446655440002';
      prisma.$queryRawUnsafe.mockResolvedValue([{
        data_status: 'submitted',
        submitted_by: userId,
        created_by: userId,
      }]);

      await expect(
        service.transition(tableName, recordId, 'withdraw', otherUser),
      ).rejects.toThrow(BusinessException);
    });

    it('should approve a submitted record', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ data_status: 'submitted', created_by: userId }]);
      prisma.$executeRawUnsafe.mockResolvedValue(1);

      await service.transition(tableName, recordId, 'approve', userId);

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"data_status" = \'approved\''),
        expect.anything(),
      );
    });

    it('should reject to pending_revision', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ data_status: 'submitted', created_by: userId }]);
      prisma.$executeRawUnsafe.mockResolvedValue(1);

      await service.transition(tableName, recordId, 'reject', userId);

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"data_status" = \'pending_revision\''),
        expect.anything(),
      );
    });

    it('should revise pending_revision back to draft', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ data_status: 'pending_revision', created_by: userId }]);
      prisma.$executeRawUnsafe.mockResolvedValue(1);

      await service.transition(tableName, recordId, 'revise', userId);

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"data_status" = \'draft\''),
        expect.anything(),
      );
    });

    it('should unapprove back to draft', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ data_status: 'approved', created_by: userId }]);
      prisma.$executeRawUnsafe.mockResolvedValue(1);

      await service.transition(tableName, recordId, 'unapprove', userId);

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"data_status" = \'draft\''),
        expect.anything(),
      );
    });

    it('should throw on non-existent record', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await expect(
        service.transition(tableName, recordId, 'submit', userId),
      ).rejects.toThrow(BusinessException);
    });
  });
});
