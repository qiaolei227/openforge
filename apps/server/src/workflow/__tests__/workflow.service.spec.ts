import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowService } from '../workflow.service';
import { WorkflowConditionMatcher } from '../workflow-condition-matcher.service';
import { ErrorCodes } from '../../common/exceptions/error-codes';

describe('WorkflowService', () => {
  let service: WorkflowService;
  let prisma: any;
  let matcher: WorkflowConditionMatcher;

  beforeEach(() => {
    prisma = {
      sysModel: { findFirst: vi.fn() },
      sysWorkflow: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        aggregate: vi.fn(),
      },
      sysWorkflowInstance: { count: vi.fn() },
      $transaction: vi.fn((calls: any[]) => Promise.all(calls)),
    };
    matcher = new WorkflowConditionMatcher();
    service = new WorkflowService(prisma as any, matcher);
  });

  describe('list', () => {
    it('looks up model by appCode+modelCode and returns workflows ordered by sortOrder', async () => {
      prisma.sysModel.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.sysWorkflow.findMany.mockResolvedValue([{ id: 'w1', sortOrder: 0 }]);

      const result = await service.list('crm', 'lead');

      expect(prisma.sysModel.findFirst).toHaveBeenCalledWith({
        where: { code: 'lead', app: { code: 'crm' } },
      });
      expect(prisma.sysWorkflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { modelId: 'm1' },
          orderBy: { sortOrder: 'asc' },
        }),
      );
      expect(result).toEqual([{ id: 'w1', sortOrder: 0 }]);
    });

    it('throws MODEL_NOT_FOUND when model not found', async () => {
      prisma.sysModel.findFirst.mockResolvedValue(null);
      await expect(service.list('crm', 'ghost')).rejects.toMatchObject({
        errorCode: ErrorCodes.MODEL_NOT_FOUND,
      });
    });
  });

  describe('create', () => {
    it('writes with default sortOrder = max+1 when not provided', async () => {
      prisma.sysModel.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.sysWorkflow.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      prisma.sysWorkflow.create.mockResolvedValue({ id: 'w1' });

      await service.create('crm', 'lead', { name: 'Approval flow' }, 'user-1');

      expect(prisma.sysWorkflow.aggregate).toHaveBeenCalledWith({
        where: { modelId: 'm1' },
        _max: { sortOrder: true },
      });
      expect(prisma.sysWorkflow.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          modelId: 'm1',
          name: 'Approval flow',
          sortOrder: 3,
          enabled: true,
          condition: null,
          createdBy: 'user-1',
        }),
      });
    });

    it('uses provided sortOrder when given', async () => {
      prisma.sysModel.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.sysWorkflow.create.mockResolvedValue({ id: 'w1' });

      await service.create('crm', 'lead', { name: 'F', sortOrder: 5 }, 'user-1');

      expect(prisma.sysWorkflow.aggregate).not.toHaveBeenCalled();
      expect(prisma.sysWorkflow.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 5 }),
      });
    });

    it('first workflow on a model gets sortOrder=0', async () => {
      prisma.sysModel.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.sysWorkflow.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      prisma.sysWorkflow.create.mockResolvedValue({ id: 'w1' });

      await service.create('crm', 'lead', { name: 'F' }, 'user-1');

      expect(prisma.sysWorkflow.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 0 }),
      });
    });
  });

  describe('update', () => {
    it('updates an existing row', async () => {
      prisma.sysWorkflow.findUnique.mockResolvedValue({ id: 'w1' });
      prisma.sysWorkflow.update.mockResolvedValue({ id: 'w1', name: 'New' });

      const result = await service.update('w1', { name: 'New' });

      expect(prisma.sysWorkflow.update).toHaveBeenCalledWith({
        where: { id: 'w1' },
        data: { name: 'New' },
      });
      expect(result).toEqual({ id: 'w1', name: 'New' });
    });

    it('throws WORKFLOW_NOT_FOUND when missing', async () => {
      prisma.sysWorkflow.findUnique.mockResolvedValue(null);

      await expect(service.update('ghost', { name: 'X' })).rejects.toMatchObject({
        errorCode: ErrorCodes.WORKFLOW_NOT_FOUND,
      });
      expect(prisma.sysWorkflow.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('throws WORKFLOW_DELETE_HAS_INSTANCES when instance count > 0', async () => {
      prisma.sysWorkflow.findUnique.mockResolvedValue({ id: 'w1' });
      prisma.sysWorkflowInstance.count.mockResolvedValue(2);

      await expect(service.delete('w1')).rejects.toMatchObject({
        errorCode: ErrorCodes.WORKFLOW_DELETE_HAS_INSTANCES,
      });
      expect(prisma.sysWorkflow.delete).not.toHaveBeenCalled();
    });

    it('succeeds when no instances', async () => {
      prisma.sysWorkflow.findUnique.mockResolvedValue({ id: 'w1' });
      prisma.sysWorkflowInstance.count.mockResolvedValue(0);
      prisma.sysWorkflow.delete.mockResolvedValue({ id: 'w1' });

      const result = await service.delete('w1');

      expect(prisma.sysWorkflow.delete).toHaveBeenCalledWith({ where: { id: 'w1' } });
      expect(result).toEqual({ id: 'w1' });
    });

    it('throws WORKFLOW_NOT_FOUND when missing', async () => {
      prisma.sysWorkflow.findUnique.mockResolvedValue(null);
      await expect(service.delete('ghost')).rejects.toMatchObject({
        errorCode: ErrorCodes.WORKFLOW_NOT_FOUND,
      });
    });
  });

  describe('reorder', () => {
    it('updates sortOrder in a transaction', async () => {
      prisma.sysWorkflow.update.mockImplementation((args: any) =>
        Promise.resolve({ id: args.where.id, ...args.data }),
      );

      await service.reorder([
        { id: 'w1', sortOrder: 2 },
        { id: 'w2', sortOrder: 1 },
      ]);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.sysWorkflow.update).toHaveBeenCalledTimes(2);
      expect(prisma.sysWorkflow.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'w1' },
        data: { sortOrder: 2 },
      });
      expect(prisma.sysWorkflow.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'w2' },
        data: { sortOrder: 1 },
      });
    });
  });

  describe('findMatching', () => {
    it('returns first enabled, versioned workflow whose condition matches', async () => {
      const wf1 = {
        id: 'w1',
        sortOrder: 0,
        condition: { op: 'and', conditions: [{ field: 'amount', op: 'gt', value: 999 }] },
      };
      const wf2 = {
        id: 'w2',
        sortOrder: 1,
        condition: { op: 'and', conditions: [{ field: 'amount', op: 'lte', value: 100 }] },
      };
      prisma.sysWorkflow.findMany.mockResolvedValue([wf1, wf2]);

      const result = await service.findMatching('m1', { amount: 50 });
      expect(result).toBe(wf2);
      expect(prisma.sysWorkflow.findMany).toHaveBeenCalledWith({
        where: { modelId: 'm1', enabled: true, currentVersionId: { not: null } },
        orderBy: { sortOrder: 'asc' },
      });
    });

    it('returns null when no candidate matches', async () => {
      prisma.sysWorkflow.findMany.mockResolvedValue([
        { id: 'w1', condition: { op: 'and', conditions: [{ field: 'x', op: 'eq', value: 1 }] } },
      ]);

      const result = await service.findMatching('m1', { x: 2 });
      expect(result).toBeNull();
    });

    it('null condition matches all', async () => {
      prisma.sysWorkflow.findMany.mockResolvedValue([{ id: 'w1', condition: null }]);

      const result = await service.findMatching('m1', {});
      expect(result).toEqual({ id: 'w1', condition: null });
    });
  });
});
