import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowUrgeService } from '../workflow-urge.service';
import { ErrorCodes } from '../../common/exceptions/error-codes';

describe('WorkflowUrgeService', () => {
  let service: WorkflowUrgeService;
  let prisma: any;
  let notify: any;

  const SUBMITTER = 'user-submitter';
  const OTHER = 'user-other';
  const ORG = 'org-1';
  const INSTANCE_ID = 'inst-1';

  function buildInstance(overrides: any = {}) {
    return {
      id: INSTANCE_ID,
      startedBy: SUBMITTER,
      orgId: ORG,
      status: 'running',
      tasks: [
        { id: 't1', assigneeUserId: 'u1', urgedAt: null },
        { id: 't2', assigneeUserId: 'u2', urgedAt: null },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      sysWorkflowInstance: {
        findUnique: vi.fn(),
      },
      sysWorkflowTask: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      sysWorkflowLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    notify = { create: vi.fn().mockResolvedValue({}) };
    service = new WorkflowUrgeService(prisma as any, notify as any);
  });

  it('happy path: writes log, updates urgedAt, creates one notification per pending assignee', async () => {
    prisma.sysWorkflowInstance.findUnique.mockResolvedValue(buildInstance());

    const result = await service.urge(INSTANCE_ID, { userId: SUBMITTER, orgId: ORG });

    expect(result).toEqual({ ok: true, urgedTasks: 2 });
    expect(prisma.sysWorkflowTask.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['t1', 't2'] } },
      data: { urgedAt: expect.any(Date) },
    });
    expect(prisma.sysWorkflowLog.create).toHaveBeenCalledWith({
      data: { instanceId: INSTANCE_ID, action: 'urge', operatorUserId: SUBMITTER },
    });
    expect(notify.create).toHaveBeenCalledTimes(2);
    expect(notify.create).toHaveBeenNthCalledWith(1, {
      userId: 'u1',
      orgId: ORG,
      type: 'workflow_urge',
      title: '催办：请尽快处理审批',
      relatedType: 'workflow_task',
      relatedId: 't1',
      navigateTo: '/workspace/inbox',
    });
    expect(notify.create).toHaveBeenNthCalledWith(2, {
      userId: 'u2',
      orgId: ORG,
      type: 'workflow_urge',
      title: '催办：请尽快处理审批',
      relatedType: 'workflow_task',
      relatedId: 't2',
      navigateTo: '/workspace/inbox',
    });
  });

  it('throws WORKFLOW_INSTANCE_NOT_FOUND when instance missing', async () => {
    prisma.sysWorkflowInstance.findUnique.mockResolvedValue(null);

    await expect(
      service.urge(INSTANCE_ID, { userId: SUBMITTER, orgId: ORG }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_INSTANCE_NOT_FOUND });
  });

  it('throws WORKFLOW_TASK_NOT_ASSIGNEE when caller is not the submitter', async () => {
    prisma.sysWorkflowInstance.findUnique.mockResolvedValue(buildInstance());

    await expect(
      service.urge(INSTANCE_ID, { userId: OTHER, orgId: ORG }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_TASK_NOT_ASSIGNEE });
    expect(prisma.sysWorkflowTask.updateMany).not.toHaveBeenCalled();
    expect(notify.create).not.toHaveBeenCalled();
  });

  it('throws WORKFLOW_INSTANCE_NOT_RUNNING when instance status != running', async () => {
    prisma.sysWorkflowInstance.findUnique.mockResolvedValue(
      buildInstance({ status: 'approved' }),
    );

    await expect(
      service.urge(INSTANCE_ID, { userId: SUBMITTER, orgId: ORG }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_INSTANCE_NOT_RUNNING });
  });

  it('throws WORKFLOW_INSTANCE_NOT_RUNNING when there are no pending tasks', async () => {
    prisma.sysWorkflowInstance.findUnique.mockResolvedValue(
      buildInstance({ tasks: [] }),
    );

    await expect(
      service.urge(INSTANCE_ID, { userId: SUBMITTER, orgId: ORG }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_INSTANCE_NOT_RUNNING });
  });

  it('throws WORKFLOW_URGE_TOO_FREQUENT when within 24h cooldown', async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    prisma.sysWorkflowInstance.findUnique.mockResolvedValue(
      buildInstance({
        tasks: [
          { id: 't1', assigneeUserId: 'u1', urgedAt: recent },
          { id: 't2', assigneeUserId: 'u2', urgedAt: null },
        ],
      }),
    );

    await expect(
      service.urge(INSTANCE_ID, { userId: SUBMITTER, orgId: ORG }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_URGE_TOO_FREQUENT });
    expect(prisma.sysWorkflowTask.updateMany).not.toHaveBeenCalled();
    expect(notify.create).not.toHaveBeenCalled();
  });

  it('succeeds beyond 24h cooldown', async () => {
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago
    prisma.sysWorkflowInstance.findUnique.mockResolvedValue(
      buildInstance({
        tasks: [
          { id: 't1', assigneeUserId: 'u1', urgedAt: longAgo },
          { id: 't2', assigneeUserId: 'u2', urgedAt: longAgo },
        ],
      }),
    );

    const result = await service.urge(INSTANCE_ID, { userId: SUBMITTER, orgId: ORG });

    expect(result).toEqual({ ok: true, urgedTasks: 2 });
    expect(prisma.sysWorkflowTask.updateMany).toHaveBeenCalled();
    expect(notify.create).toHaveBeenCalledTimes(2);
  });
});
