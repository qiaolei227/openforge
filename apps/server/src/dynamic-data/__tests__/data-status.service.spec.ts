import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { DataStatusService } from '../data-status.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';

describe('DataStatusService', () => {
  let service: DataStatusService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      $queryRawUnsafe: vi.fn(),
      $executeRawUnsafe: vi.fn(),
    };
    prisma = {
      $transaction: vi.fn((fn: (tx: any) => Promise<any>) => fn(tx)),
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
      tx.$queryRawUnsafe.mockResolvedValue([{ data_status: 'draft', created_by: userId }]);
      tx.$executeRawUnsafe.mockResolvedValue(1);

      await service.transition(tableName, recordId, 'submit', userId);

      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"data_status" = $1'),
        'submitted',
        userId,
        recordId,
      );
    });

    it('should reject submit on non-draft record', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([{ data_status: 'submitted', created_by: userId }]);

      await expect(
        service.transition(tableName, recordId, 'submit', userId),
      ).rejects.toThrow(BusinessException);
    });

    it('should allow only submitter to withdraw', async () => {
      const otherUser = '770e8400-e29b-41d4-a716-446655440002';
      tx.$queryRawUnsafe.mockResolvedValue([{
        data_status: 'submitted',
        submitted_by: userId,
        created_by: userId,
      }]);

      await expect(
        service.transition(tableName, recordId, 'withdraw', otherUser),
      ).rejects.toThrow(BusinessException);
    });

    it('should approve a submitted record', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([{ data_status: 'submitted', created_by: userId }]);
      tx.$executeRawUnsafe.mockResolvedValue(1);

      await service.transition(tableName, recordId, 'approve', userId);

      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"data_status" = $1'),
        'approved',
        userId,
        recordId,
      );
    });

    it('should unapprove back to reaudit', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([{ data_status: 'approved', created_by: userId }]);
      tx.$executeRawUnsafe.mockResolvedValue(1);

      await service.transition(tableName, recordId, 'unapprove', userId);

      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"data_status" = $1'),
        'reaudit',
        userId,
        recordId,
      );
    });

    it('should throw on non-existent record', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([]);

      await expect(
        service.transition(tableName, recordId, 'submit', userId),
      ).rejects.toThrow(BusinessException);
    });

    it('should use SELECT FOR UPDATE within transaction', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([{ data_status: 'draft', created_by: userId }]);
      tx.$executeRawUnsafe.mockResolvedValue(1);

      await service.transition(tableName, recordId, 'submit', userId);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        recordId,
      );
    });
  });
});
