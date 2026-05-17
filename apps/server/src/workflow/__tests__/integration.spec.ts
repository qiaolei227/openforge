import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkflowEngineService } from '../workflow-engine.service';
import { WorkflowCompletedListener } from '../workflow-completed.listener';
import { ApproveNodeConfig, WorkflowDefinition } from '../types';

/**
 * Phase G integration test — exercises the wiring across:
 *   engine.start → tasks created
 *   engine.decide(approve) on last task → completeInstance →
 *     workflow.completed event → WorkflowCompletedListener →
 *     UPDATE biz."{table}" SET data_status='approved'
 *
 * Uses a real EventEmitter2 so the listener subscribes via @OnEvent in the
 * same way as runtime. Prisma is mocked at the call surface used by each
 * service. We're not verifying engine internals (those are covered by
 * workflow-engine.service.spec.ts) — just that the listener actually fires
 * and writes data_status after the engine emits `workflow.completed`.
 */

function makeTx(initial: { activeNodeIds?: string[] } = {}) {
  const state = { activeNodeIds: initial.activeNodeIds ?? [] };
  const exitLogs: string[] = [];
  const taskStore: any[] = [];
  return {
    sysWorkflowInstance: {
      findUnique: vi.fn(async () => ({
        id: 'inst-1',
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
      create: vi.fn(async ({ data }: any) => ({
        id: 'inst-1',
        orgId: data.orgId,
        recordId: data.recordId,
        startedBy: data.startedBy,
        modelId: data.modelId,
        ...data,
      })),
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
        taskStore.find((t) => t.id === where.id) ?? null,
      ),
      findMany: vi.fn(async ({ where }: any) =>
        taskStore.filter((t) => t.instanceId === where.instanceId && t.nodeId === where.nodeId),
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const t = taskStore.find((x) => x.id === where.id);
        if (t) Object.assign(t, data);
        return t ?? null;
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    sysNotification: {
      create: vi.fn(async ({ data }: any) => data),
    },
    _taskStore: taskStore,
    _state: state,
  };
}

describe('Phase G integration: submit → approve → listener writes data_status', () => {
  let bus: EventEmitter2;
  let engine: WorkflowEngineService;
  let listener: WorkflowCompletedListener;
  let enginePrisma: any;
  let listenerPrisma: any;
  let resolver: any;
  let lock: any;
  let matcher: any;
  let tx: any;

  // Workflow def: start → approve(mode='or', single assignee 'u-approver') → end
  const approveCfg: ApproveNodeConfig = {
    assigneeStrategy: 'fixed',
    assigneeConfig: { userIds: ['u-approver'] },
    mode: 'or',
    onEmpty: 'error',
    autoSkipDuplicates: false,
    autoSkipSubmitter: false,
    allowedActions: {
      approve: true,
      reject: true,
      transfer: false,
      addBefore: false,
      addAfter: false,
      returnPrev: false,
      returnStart: false,
    },
  };

  const def: WorkflowDefinition = {
    nodes: [
      { id: 'start', type: 'start', name: 'Start', position: { x: 0, y: 0 }, config: {} },
      { id: 'a1', type: 'approve', name: 'Approve', position: { x: 0, y: 0 }, config: approveCfg },
      { id: 'end', type: 'end', name: 'End', position: { x: 0, y: 0 }, config: {} },
    ],
    edges: [
      { id: 'e1', from: 'start', to: 'a1' },
      { id: 'e2', from: 'a1', to: 'end' },
    ],
  };

  beforeEach(() => {
    tx = makeTx();
    bus = new EventEmitter2();
    enginePrisma = {
      sysWorkflow: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'wf-1',
          currentVersion: { id: 'v1', definition: def },
        }),
      },
      sysWorkflowTask: {
        // engine.decide loads the task with { include: { instance: { include: { workflowVersion: true } } } }
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
              workflowVersion: { id: 'v1', definition: def },
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
    resolver = {
      resolveWithFallback: vi.fn().mockResolvedValue({
        assignees: ['u-approver'],
        shouldSkip: false,
      }),
    };
    lock = { withLock: vi.fn(async (_id: string, fn: any) => fn()) };
    matcher = { match: vi.fn().mockReturnValue(true) };

    engine = new WorkflowEngineService(enginePrisma, bus, resolver, lock, matcher);

    listenerPrisma = {
      sysModel: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'm1',
          code: 'lead',
          app: { code: 'crm' },
        }),
      },
      sysWorkflowTask: {
        findFirst: vi.fn().mockResolvedValue({ assigneeUserId: 'u-approver' }),
      },
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    };
    listener = new WorkflowCompletedListener(listenerPrisma);

    // Wire @OnEvent manually since we're not booting Nest's container.
    bus.on('workflow.completed', (payload) => listener.onCompleted(payload as any));
  });

  it('approve path: emits workflow.completed → listener writes data_status="approved" to biz."crm_lead"', async () => {
    // 1) Start the workflow
    await engine.start('wf-1', 'rec-1', {
      user: { userId: 'submitter', orgId: 'o1' },
      appId: 'a1',
      appCode: 'crm',
      modelId: 'm1',
      modelCode: 'lead',
      record: { id: 'rec-1', amount: 5000 },
    });

    // engine.start should have created an instance + one approve task
    expect(tx.sysWorkflowInstance.create).toHaveBeenCalled();
    expect(tx.sysWorkflowTask.create).toHaveBeenCalled();
    const approverTask = tx._taskStore.find((t: any) => t.assigneeUserId === 'u-approver');
    expect(approverTask).toBeDefined();
    expect(approverTask.status).toBe('pending');

    // 2) Approver decides "approve"
    await engine.decide(approverTask.id, 'approve', { userId: 'u-approver', orgId: 'o1' }, 'looks good');

    // Wait one microtask for any async event handlers to flush.
    await new Promise((resolve) => setImmediate(resolve));

    // 3) Listener should have fired and written data_status='approved'
    expect(listenerPrisma.sysModel.findUnique).toHaveBeenCalledWith({
      where: { id: 'm1' },
      include: { app: true },
    });
    const calls = listenerPrisma.$executeRawUnsafe.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    // First call: data_status='approved'
    expect(calls[0][0]).toContain('biz."crm_lead"');
    expect(calls[0][0]).toContain('"data_status" = $1');
    expect(calls[0][1]).toBe('approved');
    expect(calls[0][2]).toBe('rec-1');
    // Second call: approved_by = 'u-approver'
    expect(calls[1][0]).toContain('"approved_by" = $1::uuid');
    expect(calls[1][1]).toBe('u-approver');
  });

  it('reject path: listener writes data_status="draft"', async () => {
    await engine.start('wf-1', 'rec-1', {
      user: { userId: 'submitter', orgId: 'o1' },
      appId: 'a1',
      appCode: 'crm',
      modelId: 'm1',
      modelCode: 'lead',
      record: { id: 'rec-1' },
    });

    const approverTask = tx._taskStore.find((t: any) => t.assigneeUserId === 'u-approver');

    await engine.decide(approverTask.id, 'reject', { userId: 'u-approver', orgId: 'o1' }, 'no');

    await new Promise((resolve) => setImmediate(resolve));

    const calls = listenerPrisma.$executeRawUnsafe.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][1]).toBe('draft');
    expect(calls[0][2]).toBe('rec-1');
    // No approved_by update on reject
    const approvedByCalls = calls.filter((c: any[]) => String(c[0]).includes('approved_by'));
    expect(approvedByCalls.length).toBe(0);
  });

  it('withdraw path: listener writes data_status="draft"', async () => {
    await engine.start('wf-1', 'rec-1', {
      user: { userId: 'submitter', orgId: 'o1' },
      appId: 'a1',
      appCode: 'crm',
      modelId: 'm1',
      modelCode: 'lead',
      record: { id: 'rec-1' },
    });

    await engine.withdraw('inst-1', { userId: 'submitter', orgId: 'o1' });

    await new Promise((resolve) => setImmediate(resolve));

    const calls = listenerPrisma.$executeRawUnsafe.mock.calls;
    const draftCalls = calls.filter((c: any[]) => c[1] === 'draft');
    expect(draftCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('cancel path: listener is a no-op (data_status managed by DataStatusService.unapprove)', async () => {
    await engine.start('wf-1', 'rec-1', {
      user: { userId: 'submitter', orgId: 'o1' },
      appId: 'a1',
      appCode: 'crm',
      modelId: 'm1',
      modelCode: 'lead',
      record: { id: 'rec-1' },
    });

    listenerPrisma.$executeRawUnsafe.mockClear();
    await engine.cancel('inst-1', 'unapproved');

    await new Promise((resolve) => setImmediate(resolve));

    expect(listenerPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
