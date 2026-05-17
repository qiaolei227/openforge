import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InboxService } from '../inbox.service';

describe('InboxService', () => {
  let service: InboxService;
  let prisma: any;
  const USER = 'user-1';

  beforeEach(() => {
    prisma = {
      sysWorkflowTask: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      sysWorkflowInstance: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    service = new InboxService(prisma as any);
  });

  describe('pending', () => {
    it('queries pending approve tasks for user with running instance and default paging', async () => {
      await service.pending(USER, {});

      expect(prisma.sysWorkflowTask.findMany).toHaveBeenCalledWith({
        where: {
          assigneeUserId: USER,
          status: 'pending',
          nodeType: 'approve',
          instance: { status: 'running' },
        },
        include: { instance: { include: { workflow: true } } },
        orderBy: { instance: { startedAt: 'desc' } },
        take: 50,
        skip: 0,
      });
    });

    it('honors appId / orgId / limit / offset filters', async () => {
      await service.pending(USER, { appId: 'app-1', orgId: 'org-1', limit: 20, offset: 40 });

      expect(prisma.sysWorkflowTask.findMany).toHaveBeenCalledWith({
        where: {
          assigneeUserId: USER,
          status: 'pending',
          nodeType: 'approve',
          instance: { status: 'running', appId: 'app-1', orgId: 'org-1' },
        },
        include: { instance: { include: { workflow: true } } },
        orderBy: { instance: { startedAt: 'desc' } },
        take: 20,
        skip: 40,
      });
    });
  });

  describe('done', () => {
    it('queries decided approve tasks ordered by decisionAt desc', async () => {
      await service.done(USER, {});

      expect(prisma.sysWorkflowTask.findMany).toHaveBeenCalledWith({
        where: {
          assigneeUserId: USER,
          status: { in: ['approved', 'rejected', 'transferred'] },
          nodeType: 'approve',
        },
        include: { instance: { include: { workflow: true } } },
        orderBy: { decisionAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });

    it('honors appId / orgId filters via instance', async () => {
      await service.done(USER, { appId: 'app-1', orgId: 'org-1' });

      expect(prisma.sysWorkflowTask.findMany).toHaveBeenCalledWith({
        where: {
          assigneeUserId: USER,
          status: { in: ['approved', 'rejected', 'transferred'] },
          nodeType: 'approve',
          instance: { appId: 'app-1', orgId: 'org-1' },
        },
        include: { instance: { include: { workflow: true } } },
        orderBy: { decisionAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });

    it('does not set instance filter when neither appId nor orgId provided', async () => {
      await service.done(USER, { limit: 10 });

      const call = prisma.sysWorkflowTask.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('instance');
    });
  });

  describe('cc', () => {
    it('queries cc tasks for user', async () => {
      await service.cc(USER, {});

      expect(prisma.sysWorkflowTask.findMany).toHaveBeenCalledWith({
        where: {
          assigneeUserId: USER,
          nodeType: 'cc',
        },
        include: { instance: { include: { workflow: true } } },
        orderBy: { instance: { startedAt: 'desc' } },
        take: 50,
        skip: 0,
      });
    });
  });

  describe('myInstances', () => {
    it('queries instances started by the user with one pending task preview', async () => {
      await service.myInstances(USER, {});

      expect(prisma.sysWorkflowInstance.findMany).toHaveBeenCalledWith({
        where: { startedBy: USER },
        include: {
          workflow: true,
          tasks: { where: { status: 'pending' }, take: 1 },
        },
        orderBy: { startedAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });

    it('honors appId / orgId filters at instance level', async () => {
      await service.myInstances(USER, { appId: 'app-1', orgId: 'org-1' });

      expect(prisma.sysWorkflowInstance.findMany).toHaveBeenCalledWith({
        where: { startedBy: USER, appId: 'app-1', orgId: 'org-1' },
        include: {
          workflow: true,
          tasks: { where: { status: 'pending' }, take: 1 },
        },
        orderBy: { startedAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });
  });

  describe('counts', () => {
    it('runs four parallel counts and returns aggregated object', async () => {
      prisma.sysWorkflowTask.count
        .mockResolvedValueOnce(3) // pending
        .mockResolvedValueOnce(5) // done
        .mockResolvedValueOnce(1); // cc
      prisma.sysWorkflowInstance.count.mockResolvedValueOnce(7); // myInstances

      const result = await service.counts(USER);

      expect(result).toEqual({ pending: 3, done: 5, cc: 1, myInstances: 7 });
      expect(prisma.sysWorkflowTask.count).toHaveBeenCalledTimes(3);
      expect(prisma.sysWorkflowInstance.count).toHaveBeenCalledTimes(1);

      expect(prisma.sysWorkflowTask.count).toHaveBeenNthCalledWith(1, {
        where: {
          assigneeUserId: USER,
          status: 'pending',
          nodeType: 'approve',
          instance: { status: 'running' },
        },
      });
      expect(prisma.sysWorkflowTask.count).toHaveBeenNthCalledWith(2, {
        where: {
          assigneeUserId: USER,
          status: { in: ['approved', 'rejected', 'transferred'] },
          nodeType: 'approve',
        },
      });
      expect(prisma.sysWorkflowTask.count).toHaveBeenNthCalledWith(3, {
        where: { assigneeUserId: USER, nodeType: 'cc' },
      });
      expect(prisma.sysWorkflowInstance.count).toHaveBeenCalledWith({
        where: { startedBy: USER },
      });
    });
  });
});
