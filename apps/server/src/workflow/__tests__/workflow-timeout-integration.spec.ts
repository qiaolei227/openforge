import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkflowEngineService } from '../workflow-engine.service';
import { WorkflowTimeoutProcessor } from '../workflow-timeout.processor';
import { ApproveNodeConfig, WorkflowDefinition } from '../types';

/**
 * Phase J integration: engine schedules a timeout job, then the bullmq
 * processor fires (we invoke `processor.process` directly with the captured
 * payload) and routes to the right strategy.
 *
 * No real Redis worker is started — the timeoutQueue is a vi.fn() spy whose
 * `add()` captures the job payload + options. We then synthesise the Job
 * object that bullmq would have delivered and feed it to the processor.
 */

const baseCfg = (overrides: Partial<ApproveNodeConfig> = {}): ApproveNodeConfig => ({
  assigneeStrategy: 'fixed',
  assigneeConfig: { userIds: ['u-approver'] },
  mode: 'or',
  onEmpty: 'error',
  autoSkipDuplicates: false,
  autoSkipSubmitter: false,
  timeoutHours: 0.001, // ~3.6s — irrelevant because we manually invoke process()
  onTimeout: 'autoApprove',
  allowedActions: {
    approve: true,
    reject: true,
    transfer: true,
    addBefore: false,
    addAfter: false,
    returnPrev: false,
    returnStart: false,
  },
  ...overrides,
});

function buildDef(cfg: ApproveNodeConfig): WorkflowDefinition {
  return {
    nodes: [
      { id: 'start', type: 'start', name: 'Start', position: { x: 0, y: 0 }, config: {} },
      { id: 'a1', type: 'approve', name: 'Approve', position: { x: 0, y: 0 }, config: cfg },
      { id: 'end', type: 'end', name: 'End', position: { x: 0, y: 0 }, config: {} },
    ],
    edges: [
      { id: 'e1', from: 'start', to: 'a1' },
      { id: 'e2', from: 'a1', to: 'end' },
    ],
  };
}

function makeTx() {
  const state: { activeNodeIds: string[] } = { activeNodeIds: [] };
  const taskStore: any[] = [];
  const exitLogs: string[] = [];
  return {
    sysWorkflowInstance: {
      findUnique: vi.fn(async () => ({
        id: 'inst-1',
        status: 'running',
        orgId: 'o1',
        recordId: 'rec-1',
        startedBy: 'submitter',
        modelId: 'm1',
        activeNodeIds: [...state.activeNodeIds],
      })),
      update: vi.fn(async ({ data }: any) => {
        if (Array.isArray(data.activeNodeIds)) state.activeNodeIds = data.activeNodeIds;
        return {};
      }),
      create: vi.fn(async ({ data }: any) => ({ id: 'inst-1', ...data })),
    },
    sysWorkflowLog: {
      create: vi.fn(async ({ data }: any) => {
        if (data.action === 'node-exit' && data.nodeId) exitLogs.push(data.nodeId);
        return data;
      }),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
    },
    sysWorkflowTask: {
      create: vi.fn(async ({ data }: any) => {
        const t = { id: `task-${taskStore.length + 1}`, ...data };
        taskStore.push(t);
        return t;
      }),
      findUnique: vi.fn(async ({ where }: any) =>
        taskStore.find((t: any) => t.id === where.id) ?? null,
      ),
      findMany: vi.fn(async ({ where }: any) =>
        taskStore.filter(
          (t: any) =>
            t.instanceId === where.instanceId &&
            (!where.nodeId || t.nodeId === where.nodeId) &&
            (!where.status || t.status === where.status),
        ),
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const t = taskStore.find((x: any) => x.id === where.id);
        if (t) Object.assign(t, data);
        return t ?? null;
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    sysNotification: { create: vi.fn(async ({ data }: any) => data) },
    _taskStore: taskStore,
    _state: state,
    _exitLogs: exitLogs,
  };
}

describe('Phase J integration: scheduled → fired → engine action', () => {
  let bus: EventEmitter2;
  let timeoutQueue: any;
  let enginePrisma: any;
  let tx: any;
  let engine: WorkflowEngineService;

  beforeEach(() => {
    tx = makeTx();
    bus = new EventEmitter2();
    timeoutQueue = {
      add: vi.fn(async () => ({})),
      remove: vi.fn(async () => 1),
    };

    enginePrisma = {
      sysWorkflow: {
        findUnique: vi.fn(),
      },
      sysWorkflowTask: {
        findUnique: vi.fn(async ({ where }: any) => {
          const t = tx._taskStore.find((x: any) => x.id === where.id);
          if (!t) return null;
          return {
            ...t,
            instance: {
              id: 'inst-1',
              status: 'running',
              startedBy: 'submitter',
              modelId: 'm1',
              recordId: 'rec-1',
              orgId: 'o1',
              workflowVersion: { definition: tx._currentDef },
            },
          };
        }),
        count: vi.fn().mockResolvedValue(0),
      },
      sysWorkflowInstance: {
        findUnique: vi.fn(async () => ({
          id: 'inst-1',
          status: 'running',
          startedBy: 'submitter',
          modelId: 'm1',
          recordId: 'rec-1',
          orgId: 'o1',
        })),
      },
      $transaction: vi.fn(async (cb: any) => cb(tx)),
    };

    const resolver: any = {
      resolveWithFallback: vi.fn().mockResolvedValue({
        assignees: ['u-approver'],
        shouldSkip: false,
      }),
    };
    const lock: any = { withLock: vi.fn(async (_id: string, fn: any) => fn()) };
    const matcher: any = { match: vi.fn().mockReturnValue(true) };

    engine = new WorkflowEngineService(
      enginePrisma,
      bus,
      resolver,
      lock,
      matcher,
      timeoutQueue,
    );
  });

  it("schedules timeout job on start; processor onTimeout='autoApprove' invokes engine.decide(approve)", async () => {
    const cfg = baseCfg({ onTimeout: 'autoApprove', timeoutHours: 24 });
    const def = buildDef(cfg);
    tx._currentDef = def;
    enginePrisma.sysWorkflow.findUnique.mockResolvedValue({
      id: 'wf-1',
      currentVersion: { id: 'v1', definition: def },
    });

    await engine.start('wf-1', 'rec-1', {
      user: { userId: 'submitter', orgId: 'o1' },
      appId: 'a1',
      appCode: 'crm',
      modelId: 'm1',
      modelCode: 'lead',
      record: { id: 'rec-1' },
    });

    // Engine should have queued exactly one task-timeout
    expect(timeoutQueue.add).toHaveBeenCalledTimes(1);
    const addCall = timeoutQueue.add.mock.calls[0];
    expect(addCall[0]).toBe('task-timeout');
    const payload = addCall[1];
    const opts = addCall[2];
    expect(payload).toHaveProperty('taskId');
    expect(opts.jobId).toBe(`task-timeout-${payload.taskId}`);
    expect(opts.delay).toBe(24 * 3600 * 1000);

    // Now simulate bullmq firing the job → processor invokes engine.decide('approve')
    const processorPrisma: any = {
      sysWorkflowTask: {
        findUnique: vi.fn(async ({ where }: any) => {
          const t = tx._taskStore.find((x: any) => x.id === where.id);
          if (!t) return null;
          return {
            ...t,
            instance: {
              id: 'inst-1',
              status: 'running',
              orgId: 'o1',
              workflowVersion: { definition: def },
            },
          };
        }),
        update: vi.fn(async () => ({})),
      },
      sysWorkflowLog: { create: vi.fn(async () => ({})) },
    };
    const decideSpy = vi.spyOn(engine, 'decide').mockResolvedValue(undefined);
    const notify: any = { create: vi.fn() };

    const processor = new WorkflowTimeoutProcessor(processorPrisma, engine, notify);
    await processor.process({ data: { taskId: payload.taskId } } as any);

    expect(processorPrisma.sysWorkflowTask.update).toHaveBeenCalledWith({
      where: { id: payload.taskId },
      data: { escalated: true },
    });
    expect(decideSpy).toHaveBeenCalledWith(
      payload.taskId,
      'approve',
      expect.objectContaining({ userId: 'u-approver', orgId: 'o1' }),
      expect.any(String),
    );
    expect(processorPrisma.sysWorkflowLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'timeout-auto-approve' }),
    });
  });

  it("processor onTimeout='notify' delivers notification, no decide call", async () => {
    const cfg = baseCfg({ onTimeout: 'notify', timeoutHours: 1 });
    const def = buildDef(cfg);
    tx._currentDef = def;
    enginePrisma.sysWorkflow.findUnique.mockResolvedValue({
      id: 'wf-1',
      currentVersion: { id: 'v1', definition: def },
    });

    await engine.start('wf-1', 'rec-1', {
      user: { userId: 'submitter', orgId: 'o1' },
      appId: 'a1',
      appCode: 'crm',
      modelId: 'm1',
      modelCode: 'lead',
      record: { id: 'rec-1' },
    });
    const payload = timeoutQueue.add.mock.calls[0][1];

    const processorPrisma: any = {
      sysWorkflowTask: {
        findUnique: vi.fn(async () => ({
          id: payload.taskId,
          status: 'pending',
          escalated: false,
          assigneeUserId: 'u-approver',
          nodeId: 'a1',
          nodeName: 'Approve',
          instanceId: 'inst-1',
          instance: {
            id: 'inst-1',
            status: 'running',
            orgId: 'o1',
            workflowVersion: { definition: def },
          },
        })),
        update: vi.fn(async () => ({})),
      },
      sysWorkflowLog: { create: vi.fn(async () => ({})) },
    };
    const notify: any = { create: vi.fn().mockResolvedValue({}) };
    const decideSpy = vi.spyOn(engine, 'decide').mockResolvedValue(undefined);

    const processor = new WorkflowTimeoutProcessor(processorPrisma, engine, notify);
    await processor.process({ data: { taskId: payload.taskId } } as any);

    expect(notify.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'workflow_timeout' }),
    );
    expect(decideSpy).not.toHaveBeenCalled();
    expect(processorPrisma.sysWorkflowLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'timeout-notify' }),
    });
  });
});
