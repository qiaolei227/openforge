import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { DataStatusService } from '../data-status.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowService } from '../../workflow/workflow.service';
import { WorkflowEngineService } from '../../workflow/workflow-engine.service';
import { BusinessException } from '../../common/exceptions/business.exception';

describe('DataStatusService', () => {
  let service: DataStatusService;
  let prisma: any;
  let tx: any;
  let workflowService: any;
  let engine: any;

  beforeEach(async () => {
    tx = {
      $queryRawUnsafe: vi.fn(),
      $executeRawUnsafe: vi.fn(),
    };
    prisma = {
      $transaction: vi.fn((fn: (tx: any) => Promise<any>) => fn(tx)),
      $queryRawUnsafe: vi.fn(),
      sysWorkflowInstance: { findFirst: vi.fn().mockResolvedValue(null) },
      sysModel: { findMany: vi.fn().mockResolvedValue([]) },
    };
    workflowService = { findMatching: vi.fn().mockResolvedValue(null) };
    engine = {
      start: vi.fn().mockResolvedValue(undefined),
      withdraw: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        DataStatusService,
        { provide: PrismaService, useValue: prisma },
        { provide: WorkflowService, useValue: workflowService },
        { provide: WorkflowEngineService, useValue: engine },
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

  describe('workflow integration', () => {
    const tableName = 'crm_lead';
    const recordId = '550e8400-e29b-41d4-a716-446655440000';
    const userId = '660e8400-e29b-41d4-a716-446655440001';
    const modelId = 'model-1';
    const workflowId = 'wf-1';

    const setupRecord = (status = 'draft') => {
      prisma.sysModel.findMany.mockResolvedValue([
        { id: modelId, code: 'lead', appId: 'app-1', tableName, app: { code: 'crm' } },
      ]);
      prisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: recordId,
          data_status: status,
          org_id: '770e8400-e29b-41d4-a716-446655440002',
          amount: 5000,
        },
      ]);
      tx.$queryRawUnsafe.mockResolvedValue([
        { data_status: status, submitted_by: userId, created_by: userId },
      ]);
      tx.$executeRawUnsafe.mockResolvedValue(1);
    };

    it('submit with matching workflow: calls engine.start AND performs the data_status UPDATE', async () => {
      setupRecord('draft');
      workflowService.findMatching.mockResolvedValue({ id: workflowId, name: 'F' });

      await service.transition(tableName, recordId, 'submit', userId);

      expect(workflowService.findMatching).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({ id: recordId, amount: 5000 }),
      );
      expect(engine.start).toHaveBeenCalledWith(
        workflowId,
        recordId,
        expect.objectContaining({
          user: expect.objectContaining({ userId, orgId: '770e8400-e29b-41d4-a716-446655440002' }),
          appId: 'app-1',
          appCode: 'crm',
          modelId,
          modelCode: 'lead',
        }),
      );
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"data_status" = $1'),
        'submitted',
        userId,
        recordId,
      );
    });

    it('submit with no matching workflow: skips engine.start, still performs UPDATE', async () => {
      setupRecord('draft');
      workflowService.findMatching.mockResolvedValue(null);

      await service.transition(tableName, recordId, 'submit', userId);

      expect(engine.start).not.toHaveBeenCalled();
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"data_status" = $1'),
        'submitted',
        userId,
        recordId,
      );
    });

    it('submit with existing running instance: skips engine.start (idempotent), still UPDATEs', async () => {
      setupRecord('draft');
      prisma.sysWorkflowInstance.findFirst.mockResolvedValue({ id: 'inst-1', status: 'running' });

      await service.transition(tableName, recordId, 'submit', userId);

      expect(engine.start).not.toHaveBeenCalled();
      expect(workflowService.findMatching).not.toHaveBeenCalled();
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"data_status" = $1'),
        'submitted',
        userId,
        recordId,
      );
    });

    it('withdraw with running instance: delegates to engine.withdraw and skips direct UPDATE', async () => {
      prisma.sysWorkflowInstance.findFirst.mockResolvedValue({ id: 'inst-1', status: 'running' });

      await service.transition(tableName, recordId, 'withdraw', userId);

      expect(engine.withdraw).toHaveBeenCalledWith('inst-1', expect.objectContaining({ userId }));
      // direct UPDATE skipped — listener will set data_status='draft'
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('withdraw with no running instance: falls through to existing UPDATE', async () => {
      prisma.sysWorkflowInstance.findFirst.mockResolvedValue(null);
      tx.$queryRawUnsafe.mockResolvedValue([
        { data_status: 'submitted', submitted_by: userId, created_by: userId },
      ]);
      tx.$executeRawUnsafe.mockResolvedValue(1);

      await service.transition(tableName, recordId, 'withdraw', userId);

      expect(engine.withdraw).not.toHaveBeenCalled();
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"data_status" = $1'),
        'draft',
        userId,
        recordId,
      );
    });

    it('unapprove with approved instance: cancels instance AND performs reaudit UPDATE', async () => {
      prisma.sysWorkflowInstance.findFirst.mockResolvedValue({ id: 'inst-1', status: 'approved' });
      tx.$queryRawUnsafe.mockResolvedValue([{ data_status: 'approved', created_by: userId }]);
      tx.$executeRawUnsafe.mockResolvedValue(1);

      await service.transition(tableName, recordId, 'unapprove', userId);

      expect(engine.cancel).toHaveBeenCalledWith('inst-1', 'unapproved');
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"data_status" = $1'),
        'reaudit',
        userId,
        recordId,
      );
    });

    it('unapprove with no approved instance: skips engine.cancel, still does UPDATE', async () => {
      prisma.sysWorkflowInstance.findFirst.mockResolvedValue(null);
      tx.$queryRawUnsafe.mockResolvedValue([{ data_status: 'approved', created_by: userId }]);
      tx.$executeRawUnsafe.mockResolvedValue(1);

      await service.transition(tableName, recordId, 'unapprove', userId);

      expect(engine.cancel).not.toHaveBeenCalled();
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"data_status" = $1'),
        'reaudit',
        userId,
        recordId,
      );
    });
  });
});
