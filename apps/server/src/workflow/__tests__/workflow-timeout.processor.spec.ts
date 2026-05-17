import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowTimeoutProcessor } from '../workflow-timeout.processor';
import { ApproveNodeConfig, WorkflowDefinition } from '../types';

/**
 * Builds a `task -> definition` fixture that includes a single approve node
 * with the requested onTimeout strategy. We don't need the rest of the
 * graph because the processor only reads cfg.onTimeout / onTimeoutTransferUserIds.
 */
function buildFixture(onTimeout: ApproveNodeConfig['onTimeout'], transferIds: string[] = []) {
  const cfg: ApproveNodeConfig = {
    assigneeStrategy: 'fixed',
    assigneeConfig: {},
    mode: 'and',
    onEmpty: 'error',
    autoSkipDuplicates: false,
    autoSkipSubmitter: false,
    onTimeout,
    onTimeoutTransferUserIds: transferIds,
    allowedActions: {
      approve: true,
      reject: true,
      transfer: true,
      addBefore: false,
      addAfter: false,
      returnPrev: false,
      returnStart: false,
    },
  };
  const def: WorkflowDefinition = {
    nodes: [
      { id: 'a1', type: 'approve', name: 'Approve', position: { x: 0, y: 0 }, config: cfg },
    ],
    edges: [],
  };
  return { cfg, def };
}

function makeProcessor(opts: {
  task?: any;
} = {}) {
  const prisma: any = {
    sysWorkflowTask: {
      findUnique: vi.fn().mockResolvedValue(opts.task ?? null),
      update: vi.fn().mockResolvedValue({}),
    },
    sysWorkflowLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
  const engine: any = {
    decide: vi.fn().mockResolvedValue(undefined),
    transfer: vi.fn().mockResolvedValue(undefined),
  };
  const notify: any = {
    create: vi.fn().mockResolvedValue({}),
  };
  const processor = new WorkflowTimeoutProcessor(prisma, engine, notify);
  return { processor, prisma, engine, notify };
}

describe('WorkflowTimeoutProcessor', () => {
  it('returns early if task missing', async () => {
    const { processor, prisma, engine, notify } = makeProcessor({ task: null });
    await processor.process({ data: { taskId: 'missing' } } as any);
    expect(prisma.sysWorkflowTask.update).not.toHaveBeenCalled();
    expect(engine.decide).not.toHaveBeenCalled();
    expect(notify.create).not.toHaveBeenCalled();
  });

  it('returns early if task no longer pending', async () => {
    const { def } = buildFixture('notify');
    const task = {
      id: 't1',
      status: 'approved',
      escalated: false,
      assigneeUserId: 'u1',
      nodeId: 'a1',
      nodeName: 'Approve',
      instanceId: 'inst-1',
      instance: {
        id: 'inst-1',
        status: 'running',
        orgId: 'o1',
        workflowVersion: { definition: def },
      },
    };
    const { processor, prisma, engine, notify } = makeProcessor({ task });
    await processor.process({ data: { taskId: 't1' } } as any);
    expect(prisma.sysWorkflowTask.update).not.toHaveBeenCalled();
    expect(engine.decide).not.toHaveBeenCalled();
    expect(notify.create).not.toHaveBeenCalled();
  });

  it('returns early if instance not running', async () => {
    const { def } = buildFixture('autoApprove');
    const task = {
      id: 't1',
      status: 'pending',
      escalated: false,
      assigneeUserId: 'u1',
      nodeId: 'a1',
      nodeName: 'Approve',
      instanceId: 'inst-1',
      instance: {
        id: 'inst-1',
        status: 'approved',
        orgId: 'o1',
        workflowVersion: { definition: def },
      },
    };
    const { processor, prisma, engine } = makeProcessor({ task });
    await processor.process({ data: { taskId: 't1' } } as any);
    expect(prisma.sysWorkflowTask.update).not.toHaveBeenCalled();
    expect(engine.decide).not.toHaveBeenCalled();
  });

  it('returns early if task already escalated (idempotent on bullmq re-delivery)', async () => {
    const { def } = buildFixture('autoApprove');
    const task = {
      id: 't1',
      status: 'pending',
      escalated: true,
      assigneeUserId: 'u1',
      nodeId: 'a1',
      nodeName: 'Approve',
      instanceId: 'inst-1',
      instance: {
        id: 'inst-1',
        status: 'running',
        orgId: 'o1',
        workflowVersion: { definition: def },
      },
    };
    const { processor, engine, notify } = makeProcessor({ task });
    await processor.process({ data: { taskId: 't1' } } as any);
    expect(engine.decide).not.toHaveBeenCalled();
    expect(notify.create).not.toHaveBeenCalled();
  });

  it("onTimeout='notify': flips escalated, creates notification + timeout-notify log", async () => {
    const { def } = buildFixture('notify');
    const task = {
      id: 't1',
      status: 'pending',
      escalated: false,
      assigneeUserId: 'u1',
      nodeId: 'a1',
      nodeName: '审批 A',
      instanceId: 'inst-1',
      instance: {
        id: 'inst-1',
        status: 'running',
        orgId: 'o1',
        workflowVersion: { definition: def },
      },
    };
    const { processor, prisma, engine, notify } = makeProcessor({ task });

    await processor.process({ data: { taskId: 't1' } } as any);

    expect(prisma.sysWorkflowTask.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { escalated: true },
    });
    expect(notify.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        type: 'workflow_timeout',
        relatedType: 'workflow_task',
        relatedId: 't1',
      }),
    );
    expect(prisma.sysWorkflowLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'timeout-notify', taskId: 't1' }),
    });
    expect(engine.decide).not.toHaveBeenCalled();
  });

  it("onTimeout='autoApprove': calls engine.decide('approve') + writes timeout-auto-approve log", async () => {
    const { def } = buildFixture('autoApprove');
    const task = {
      id: 't1',
      status: 'pending',
      escalated: false,
      assigneeUserId: 'u1',
      nodeId: 'a1',
      nodeName: 'Approve',
      instanceId: 'inst-1',
      instance: {
        id: 'inst-1',
        status: 'running',
        orgId: 'o1',
        workflowVersion: { definition: def },
      },
    };
    const { processor, engine, prisma, notify } = makeProcessor({ task });

    await processor.process({ data: { taskId: 't1' } } as any);

    expect(engine.decide).toHaveBeenCalledWith(
      't1',
      'approve',
      { userId: 'u1', orgId: 'o1' },
      expect.stringContaining('超时'),
    );
    expect(prisma.sysWorkflowLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'timeout-auto-approve' }),
    });
    expect(notify.create).not.toHaveBeenCalled();
  });

  it("onTimeout='autoReject': calls engine.decide('reject') + writes timeout-auto-reject log", async () => {
    const { def } = buildFixture('autoReject');
    const task = {
      id: 't1',
      status: 'pending',
      escalated: false,
      assigneeUserId: 'u1',
      nodeId: 'a1',
      nodeName: 'Approve',
      instanceId: 'inst-1',
      instance: {
        id: 'inst-1',
        status: 'running',
        orgId: 'o1',
        workflowVersion: { definition: def },
      },
    };
    const { processor, engine, prisma } = makeProcessor({ task });

    await processor.process({ data: { taskId: 't1' } } as any);

    expect(engine.decide).toHaveBeenCalledWith(
      't1',
      'reject',
      { userId: 'u1', orgId: 'o1' },
      expect.stringContaining('超时'),
    );
    expect(prisma.sysWorkflowLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'timeout-auto-reject' }),
    });
  });

  it("onTimeout='transferTo' with target: calls engine.transfer + writes timeout-transfer log", async () => {
    const { def } = buildFixture('transferTo', ['u-target']);
    const task = {
      id: 't1',
      status: 'pending',
      escalated: false,
      assigneeUserId: 'u1',
      nodeId: 'a1',
      nodeName: 'Approve',
      instanceId: 'inst-1',
      instance: {
        id: 'inst-1',
        status: 'running',
        orgId: 'o1',
        workflowVersion: { definition: def },
      },
    };
    const { processor, engine, prisma } = makeProcessor({ task });

    await processor.process({ data: { taskId: 't1' } } as any);

    expect(engine.transfer).toHaveBeenCalledWith(
      't1',
      'u-target',
      { userId: 'u1', orgId: 'o1' },
      expect.stringContaining('超时'),
    );
    expect(prisma.sysWorkflowLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'timeout-transfer',
        targetUserId: 'u-target',
      }),
    });
  });

  it("onTimeout='transferTo' with empty list: warns and no-ops (no transfer/log)", async () => {
    const { def } = buildFixture('transferTo', []);
    const task = {
      id: 't1',
      status: 'pending',
      escalated: false,
      assigneeUserId: 'u1',
      nodeId: 'a1',
      nodeName: 'Approve',
      instanceId: 'inst-1',
      instance: {
        id: 'inst-1',
        status: 'running',
        orgId: 'o1',
        workflowVersion: { definition: def },
      },
    };
    const { processor, engine, prisma } = makeProcessor({ task });

    await processor.process({ data: { taskId: 't1' } } as any);

    expect(engine.transfer).not.toHaveBeenCalled();
    // The "timeout-transfer" log should NOT be written when no target — but the
    // escalated flip already happened (idempotency above all).
    expect(prisma.sysWorkflowTask.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { escalated: true },
    });
    const transferLogs = prisma.sysWorkflowLog.create.mock.calls.filter(
      (c: any) => c[0].data.action === 'timeout-transfer',
    );
    expect(transferLogs).toHaveLength(0);
  });

  it('defaults to notify when cfg.onTimeout is unset', async () => {
    const { cfg, def } = buildFixture('notify');
    delete (cfg as any).onTimeout;
    const task = {
      id: 't1',
      status: 'pending',
      escalated: false,
      assigneeUserId: 'u1',
      nodeId: 'a1',
      nodeName: 'Approve',
      instanceId: 'inst-1',
      instance: {
        id: 'inst-1',
        status: 'running',
        orgId: 'o1',
        workflowVersion: { definition: def },
      },
    };
    const { processor, notify } = makeProcessor({ task });

    await processor.process({ data: { taskId: 't1' } } as any);

    expect(notify.create).toHaveBeenCalled();
  });

  it('engine error is re-thrown for bullmq retry', async () => {
    const { def } = buildFixture('autoApprove');
    const task = {
      id: 't1',
      status: 'pending',
      escalated: false,
      assigneeUserId: 'u1',
      nodeId: 'a1',
      nodeName: 'Approve',
      instanceId: 'inst-1',
      instance: {
        id: 'inst-1',
        status: 'running',
        orgId: 'o1',
        workflowVersion: { definition: def },
      },
    };
    const { processor, engine } = makeProcessor({ task });
    engine.decide.mockRejectedValueOnce(new Error('lock contention'));

    await expect(
      processor.process({ data: { taskId: 't1' } } as any),
    ).rejects.toThrow('lock contention');
  });
});
