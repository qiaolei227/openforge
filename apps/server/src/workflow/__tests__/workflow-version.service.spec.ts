import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowVersionService } from '../workflow-version.service';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { WorkflowDefinition } from '../types';

const validDefinition: WorkflowDefinition = {
  nodes: [
    { id: 'start', type: 'start', name: 'Start', position: { x: 0, y: 0 }, config: {} },
    {
      id: 'a1',
      type: 'approve',
      name: 'Approve',
      position: { x: 50, y: 0 },
      config: { assigneeStrategy: 'fixed' } as any,
    },
    { id: 'end', type: 'end', name: 'End', position: { x: 100, y: 0 }, config: {} },
  ],
  edges: [
    { id: 'e1', from: 'start', to: 'a1' },
    { id: 'e2', from: 'a1', to: 'end' },
  ],
};

describe('WorkflowVersionService', () => {
  let service: WorkflowVersionService;
  let prisma: any;
  let tx: any;

  beforeEach(() => {
    tx = {
      sysWorkflowVersion: { create: vi.fn() },
      sysWorkflow: { update: vi.fn() },
    };
    prisma = {
      sysWorkflow: { findUnique: vi.fn(), update: vi.fn() },
      sysWorkflowVersion: {
        aggregate: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      $transaction: vi.fn((cb: any) => cb(tx)),
    };
    service = new WorkflowVersionService(prisma);
  });

  describe('publish', () => {
    it('creates a new version with versionNo=max+1 and sets currentVersionId', async () => {
      prisma.sysWorkflow.findUnique.mockResolvedValue({ id: 'w1' });
      prisma.sysWorkflowVersion.aggregate.mockResolvedValue({ _max: { versionNo: 4 } });
      tx.sysWorkflowVersion.create.mockResolvedValue({ id: 'v1', versionNo: 5 });
      tx.sysWorkflow.update.mockResolvedValue({});

      const result = await service.publish('w1', validDefinition, 'user-1');

      expect(prisma.sysWorkflowVersion.aggregate).toHaveBeenCalledWith({
        where: { workflowId: 'w1' },
        _max: { versionNo: true },
      });
      expect(tx.sysWorkflowVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workflowId: 'w1',
          versionNo: 5,
          publishedBy: 'user-1',
        }),
      });
      expect(tx.sysWorkflow.update).toHaveBeenCalledWith({
        where: { id: 'w1' },
        data: { currentVersionId: 'v1' },
      });
      expect(result).toEqual({ id: 'v1', versionNo: 5 });
    });

    it('first version of a new workflow has versionNo=1', async () => {
      prisma.sysWorkflow.findUnique.mockResolvedValue({ id: 'w1' });
      prisma.sysWorkflowVersion.aggregate.mockResolvedValue({ _max: { versionNo: null } });
      tx.sysWorkflowVersion.create.mockResolvedValue({ id: 'v1', versionNo: 1 });
      tx.sysWorkflow.update.mockResolvedValue({});

      await service.publish('w1', validDefinition, 'user-1');

      expect(tx.sysWorkflowVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ versionNo: 1 }),
      });
    });

    it('throws WORKFLOW_NOT_FOUND when workflow does not exist', async () => {
      prisma.sysWorkflow.findUnique.mockResolvedValue(null);

      await expect(
        service.publish('ghost', validDefinition, 'user-1'),
      ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_NOT_FOUND });
      expect(tx.sysWorkflowVersion.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid definition via the validator', async () => {
      prisma.sysWorkflow.findUnique.mockResolvedValue({ id: 'w1' });
      const invalid: any = { nodes: [], edges: [] };

      await expect(service.publish('w1', invalid, 'user-1')).rejects.toMatchObject({
        errorCode: ErrorCodes.WORKFLOW_INVALID_DEFINITION,
      });
      expect(prisma.sysWorkflowVersion.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('activate', () => {
    it('updates currentVersionId when version belongs to that workflow', async () => {
      prisma.sysWorkflowVersion.findFirst.mockResolvedValue({ id: 'v2', workflowId: 'w1' });
      prisma.sysWorkflow.update.mockResolvedValue({ id: 'w1', currentVersionId: 'v2' });

      const result = await service.activate('w1', 'v2');

      expect(prisma.sysWorkflowVersion.findFirst).toHaveBeenCalledWith({
        where: { id: 'v2', workflowId: 'w1' },
      });
      expect(prisma.sysWorkflow.update).toHaveBeenCalledWith({
        where: { id: 'w1' },
        data: { currentVersionId: 'v2' },
      });
      expect(result).toEqual({ id: 'w1', currentVersionId: 'v2' });
    });

    it('throws WORKFLOW_VERSION_NOT_FOUND when version not on that workflow', async () => {
      prisma.sysWorkflowVersion.findFirst.mockResolvedValue(null);

      await expect(service.activate('w1', 'v-foreign')).rejects.toMatchObject({
        errorCode: ErrorCodes.WORKFLOW_VERSION_NOT_FOUND,
      });
      expect(prisma.sysWorkflow.update).not.toHaveBeenCalled();
    });
  });

  describe('listVersions', () => {
    it('returns versions sorted by versionNo DESC', async () => {
      prisma.sysWorkflowVersion.findMany.mockResolvedValue([
        { id: 'v3', versionNo: 3 },
        { id: 'v2', versionNo: 2 },
        { id: 'v1', versionNo: 1 },
      ]);

      const result = await service.listVersions('w1');

      expect(prisma.sysWorkflowVersion.findMany).toHaveBeenCalledWith({
        where: { workflowId: 'w1' },
        orderBy: { versionNo: 'desc' },
      });
      expect(result).toHaveLength(3);
      expect(result[0].versionNo).toBe(3);
    });
  });
});
