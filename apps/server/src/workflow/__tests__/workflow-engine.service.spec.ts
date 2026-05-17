import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowEngineService } from '../workflow-engine.service';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import {
  ApproveNodeConfig,
  CcNodeConfig,
  ConditionNodeConfig,
  ParallelJoinConfig,
  WorkflowDefinition,
} from '../types';

/**
 * Build a minimal Prisma transaction client double.
 *
 * Each call to one of the model methods is recorded as a vi.fn() so tests can
 * inspect what the engine wrote. `sysWorkflowInstance.findUnique` returns the
 * current "activeNodeIds" so push/pop logic stays consistent across calls.
 */
function makeTx(initial: { activeNodeIds?: string[] } = {}) {
  const state = { activeNodeIds: initial.activeNodeIds ?? [] };
  const exitLogs: string[] = [];
  const tx = {
    sysWorkflowInstance: {
      findUnique: vi.fn(async () => ({ activeNodeIds: [...state.activeNodeIds] })),
      update: vi.fn(async ({ data }: any) => {
        if (Array.isArray(data.activeNodeIds)) {
          state.activeNodeIds = data.activeNodeIds;
        }
        return {};
      }),
      create: vi.fn(async ({ data }: any) => ({ id: 'inst-new', ...data })),
    },
    sysWorkflowLog: {
      create: vi.fn(async ({ data }: any) => {
        if (data.action === 'node-exit' && data.nodeId) {
          exitLogs.push(data.nodeId);
        }
        return data;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        if (where?.action !== 'node-exit') return [];
        const wanted: string[] = where.nodeId?.in ?? [];
        return exitLogs.filter((n) => wanted.includes(n)).map((nodeId) => ({ nodeId }));
      }),
    },
    sysWorkflowTask: {
      create: vi.fn(async ({ data }: any) => ({ id: `task-${Math.random()}`, ...data })),
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    sysNotification: {
      create: vi.fn(async ({ data }: any) => data),
    },
    _state: state,
    _exitLogs: exitLogs,
  };
  return tx;
}

function makeDef(
  nodes: Array<{ id: string; type: any; name?: string; config?: any }>,
  edges: Array<{ from: string; to: string }>,
): WorkflowDefinition {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      name: n.name ?? n.id,
      position: { x: 0, y: 0 },
      config: n.config ?? {},
    })),
    edges: edges.map((e, i) => ({ id: `e${i}`, from: e.from, to: e.to })),
  };
}

function makeService() {
  const prisma: any = {
    sysWorkflow: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: any) => cb(makeTx())),
  };
  const eventBus: any = { emit: vi.fn() };
  const resolver: any = { resolveWithFallback: vi.fn() };
  const lock: any = { withLock: vi.fn() };
  const matcher: any = { match: vi.fn() };
  const timeoutQueue: any = {
    add: vi.fn(async () => ({})),
    remove: vi.fn(async () => 1),
  };

  const service = new WorkflowEngineService(
    prisma,
    eventBus,
    resolver,
    lock,
    matcher,
    timeoutQueue,
  );
  return { service, prisma, eventBus, resolver, lock, matcher, timeoutQueue };
}

describe('WorkflowEngineService.start', () => {
  it('throws WORKFLOW_NOT_FOUND when workflow missing', async () => {
    const { service, prisma } = makeService();
    prisma.sysWorkflow.findUnique.mockResolvedValue(null);
    await expect(
      service.start('wf-1', 'rec-1', {
        user: { userId: 'u1', orgId: 'o1' },
        appId: 'a1',
        appCode: 'sales',
        modelId: 'm1',
        modelCode: 'lead',
        record: {},
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_NOT_FOUND });
  });

  it('throws WORKFLOW_VERSION_NOT_FOUND when no active version', async () => {
    const { service, prisma } = makeService();
    prisma.sysWorkflow.findUnique.mockResolvedValue({ id: 'wf-1', currentVersion: null });
    await expect(
      service.start('wf-1', 'rec-1', {
        user: { userId: 'u1', orgId: 'o1' },
        appId: 'a1',
        appCode: 'sales',
        modelId: 'm1',
        modelCode: 'lead',
        record: {},
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_VERSION_NOT_FOUND });
  });

  it('throws WORKFLOW_INVALID_DEFINITION when version has no start node', async () => {
    const { service, prisma } = makeService();
    prisma.sysWorkflow.findUnique.mockResolvedValue({
      id: 'wf-1',
      currentVersion: {
        id: 'v1',
        definition: { nodes: [], edges: [] },
      },
    });
    await expect(
      service.start('wf-1', 'rec-1', {
        user: { userId: 'u1', orgId: 'o1' },
        appId: 'a1',
        appCode: 'sales',
        modelId: 'm1',
        modelCode: 'lead',
        record: {},
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_INVALID_DEFINITION });
  });

  it('happy path: creates instance, writes submit + node-enter + node-exit logs, calls enterNodesInTx with outgoing', async () => {
    const { service, prisma } = makeService();
    const def = makeDef(
      [
        { id: 'start', type: 'start' },
        { id: 'n1', type: 'end' },
      ],
      [{ from: 'start', to: 'n1' }],
    );
    prisma.sysWorkflow.findUnique.mockResolvedValue({
      id: 'wf-1',
      currentVersion: { id: 'v1', definition: def },
    });

    const tx = makeTx();
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const enterSpy = vi.spyOn(service as any, 'enterNodesInTx').mockResolvedValue(undefined);

    const instance = await service.start('wf-1', 'rec-1', {
      user: { userId: 'u1', orgId: 'o1' },
      appId: 'a1',
      appCode: 'sales',
      modelId: 'm1',
      modelCode: 'lead',
      record: { x: 1 },
    });

    expect(tx.sysWorkflowInstance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workflowId: 'wf-1',
        versionId: 'v1',
        modelId: 'm1',
        appId: 'a1',
        recordId: 'rec-1',
        orgId: 'o1',
        status: 'running',
        activeNodeIds: [],
        startedBy: 'u1',
      }),
    });

    const actions = tx.sysWorkflowLog.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toEqual(['submit', 'node-enter', 'node-exit']);

    expect(enterSpy).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 'inst-new' }),
      def,
      ['n1'],
      expect.objectContaining({ user: { userId: 'u1', orgId: 'o1' } }),
    );

    expect(instance).toBeDefined();
  });
});

describe('WorkflowEngineService.enterNodesInTx — approve node', () => {
  it("mode='and' with 2 assignees creates 2 tasks, 2 notifications, emits 2 inbox.new events", async () => {
    const { service, resolver, eventBus } = makeService();
    resolver.resolveWithFallback.mockResolvedValue({
      assignees: ['ua', 'ub'],
      shouldSkip: false,
    });

    const approveConfig: ApproveNodeConfig = {
      assigneeStrategy: 'fixed',
      assigneeConfig: { userIds: ['ua', 'ub'] },
      mode: 'and',
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

    const def = makeDef([{ id: 'a1', type: 'approve', config: approveConfig }], []);
    const tx = makeTx();
    const instance = { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' };

    await (service as any).enterNodesInTx(tx, instance, def, ['a1'], {
      user: { userId: 'u1', orgId: 'o1' },
      appCode: 'sales',
      modelCode: 'lead',
      record: {},
    });

    expect(tx.sysWorkflowTask.create).toHaveBeenCalledTimes(2);
    expect(tx.sysNotification.create).toHaveBeenCalledTimes(2);

    const inboxEvents = eventBus.emit.mock.calls.filter(
      (c: any) => c[0] === 'workflow.inbox.new',
    );
    expect(inboxEvents).toHaveLength(2);
    expect(inboxEvents[0][1]).toMatchObject({ userId: 'ua', instanceId: 'inst-1' });
    expect(inboxEvents[1][1]).toMatchObject({ userId: 'ub', instanceId: 'inst-1' });

    // approve node should push itself onto activeNodeIds (stop-and-wait)
    expect(tx._state.activeNodeIds).toContain('a1');
  });

  it("mode='or' with 2 assignees creates 2 tasks (same as 'and' at entry time)", async () => {
    const { service, resolver } = makeService();
    resolver.resolveWithFallback.mockResolvedValue({
      assignees: ['ua', 'ub'],
      shouldSkip: false,
    });

    const cfg: ApproveNodeConfig = {
      assigneeStrategy: 'fixed',
      assigneeConfig: {},
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

    const def = makeDef([{ id: 'a1', type: 'approve', config: cfg }], []);
    const tx = makeTx();
    await (service as any).enterNodesInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      def,
      ['a1'],
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    expect(tx.sysWorkflowTask.create).toHaveBeenCalledTimes(2);
  });

  it("mode='sequential' creates only 1 task (first assignee)", async () => {
    const { service, resolver } = makeService();
    resolver.resolveWithFallback.mockResolvedValue({
      assignees: ['ua', 'ub', 'uc'],
      shouldSkip: false,
    });

    const cfg: ApproveNodeConfig = {
      assigneeStrategy: 'fixed',
      assigneeConfig: {},
      mode: 'sequential',
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

    const def = makeDef([{ id: 'a1', type: 'approve', config: cfg }], []);
    const tx = makeTx();
    await (service as any).enterNodesInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      def,
      ['a1'],
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    expect(tx.sysWorkflowTask.create).toHaveBeenCalledTimes(1);
    expect(tx.sysWorkflowTask.create.mock.calls[0][0].data.assigneeUserId).toBe('ua');
  });

  it('shouldSkip=true: no tasks, no notifications, writes node-skip + node-exit, recurses to outgoing', async () => {
    const { service, resolver, eventBus } = makeService();
    resolver.resolveWithFallback.mockResolvedValue({ assignees: [], shouldSkip: true });

    const cfg: ApproveNodeConfig = {
      assigneeStrategy: 'fixed',
      assigneeConfig: {},
      mode: 'and',
      onEmpty: 'pass',
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

    const def = makeDef(
      [
        { id: 'a1', type: 'approve', config: cfg },
        { id: 'end1', type: 'end' },
      ],
      [{ from: 'a1', to: 'end1' }],
    );
    const tx = makeTx();
    await (service as any).enterNodesInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      def,
      ['a1'],
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    expect(tx.sysWorkflowTask.create).not.toHaveBeenCalled();
    expect(tx.sysNotification.create).toHaveBeenCalledTimes(1); // only end-state submitter notify
    const actions = tx.sysWorkflowLog.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toContain('node-skip');
    expect(actions).toContain('node-exit');
    // end node fired
    expect(eventBus.emit).toHaveBeenCalledWith(
      'workflow.completed',
      expect.objectContaining({ finalStatus: 'approved' }),
    );
  });

  it('sets dueAt when timeoutHours configured', async () => {
    const { service, resolver } = makeService();
    resolver.resolveWithFallback.mockResolvedValue({ assignees: ['ua'], shouldSkip: false });

    const cfg: ApproveNodeConfig = {
      assigneeStrategy: 'fixed',
      assigneeConfig: {},
      mode: 'and',
      onEmpty: 'error',
      autoSkipDuplicates: false,
      autoSkipSubmitter: false,
      timeoutHours: 24,
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

    const def = makeDef([{ id: 'a1', type: 'approve', config: cfg }], []);
    const tx = makeTx();
    const before = Date.now();
    await (service as any).enterNodesInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      def,
      ['a1'],
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    const taskData = tx.sysWorkflowTask.create.mock.calls[0][0].data;
    expect(taskData.dueAt).toBeInstanceOf(Date);
    const dueAtMs = (taskData.dueAt as Date).getTime();
    expect(dueAtMs).toBeGreaterThanOrEqual(before + 24 * 3600 * 1000 - 5);
  });
});

describe('WorkflowEngineService.enterNodesInTx — cc node', () => {
  it('creates tasks + notifications + recurses to outgoing', async () => {
    const { service, resolver, eventBus } = makeService();
    resolver.resolveWithFallback.mockResolvedValue({
      assignees: ['ua', 'ub'],
      shouldSkip: false,
    });

    const cfg: CcNodeConfig = {
      assigneeStrategy: 'fixed',
      assigneeConfig: { userIds: ['ua', 'ub'] },
      dedupAcrossInstance: false,
    };

    const def = makeDef(
      [
        { id: 'cc1', type: 'cc', config: cfg },
        { id: 'end1', type: 'end' },
      ],
      [{ from: 'cc1', to: 'end1' }],
    );
    const tx = makeTx();
    await (service as any).enterNodesInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      def,
      ['cc1'],
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    expect(tx.sysWorkflowTask.create).toHaveBeenCalledTimes(2);
    expect(tx.sysWorkflowTask.create.mock.calls[0][0].data).toMatchObject({
      nodeType: 'cc',
      mode: 'cc',
      assigneeUserId: 'ua',
    });
    // cc creates 2 cc notifications + 1 final approval notification (end fired)
    expect(tx.sysNotification.create).toHaveBeenCalledTimes(3);
    const ccTitles = tx.sysNotification.create.mock.calls
      .map((c: any) => c[0].data.title)
      .filter((t: string) => t.startsWith('抄送'));
    expect(ccTitles).toHaveLength(2);
    // end ran → completion event
    expect(eventBus.emit).toHaveBeenCalledWith(
      'workflow.completed',
      expect.objectContaining({ finalStatus: 'approved' }),
    );
  });

  it('dedupAcrossInstance=true skips users with existing cc tasks on this instance', async () => {
    const { service, resolver } = makeService();
    resolver.resolveWithFallback.mockResolvedValue({
      assignees: ['ua', 'ub'],
      shouldSkip: false,
    });

    const cfg: CcNodeConfig = {
      assigneeStrategy: 'fixed',
      assigneeConfig: {},
      dedupAcrossInstance: true,
    };

    const def = makeDef(
      [
        { id: 'cc1', type: 'cc', config: cfg },
        { id: 'end1', type: 'end' },
      ],
      [{ from: 'cc1', to: 'end1' }],
    );
    const tx = makeTx();
    tx.sysWorkflowTask.findMany.mockResolvedValueOnce([{ assigneeUserId: 'ua' }] as any);
    await (service as any).enterNodesInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      def,
      ['cc1'],
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    // Only 'ub' should produce a cc task
    const ccTasks = tx.sysWorkflowTask.create.mock.calls.filter(
      (c: any) => c[0].data.nodeType === 'cc',
    );
    expect(ccTasks).toHaveLength(1);
    expect(ccTasks[0][0].data.assigneeUserId).toBe('ub');
  });
});

describe('WorkflowEngineService.enterNodesInTx — condition node', () => {
  it('recurses to matched branch only', async () => {
    const { service, matcher } = makeService();
    const cfg: ConditionNodeConfig = {
      branches: [
        { name: 'high', condition: { op: 'and', conditions: [] }, targetNodeId: 'high-tgt' },
        { name: 'low', condition: { op: 'and', conditions: [] }, targetNodeId: 'low-tgt' },
      ],
    };
    matcher.match
      .mockReturnValueOnce(false) // first branch
      .mockReturnValueOnce(true); // second branch

    const def = makeDef(
      [
        { id: 'c1', type: 'condition', config: cfg },
        { id: 'high-tgt', type: 'end' },
        { id: 'low-tgt', type: 'end' },
      ],
      [],
    );
    const tx = makeTx();
    const completeSpy = vi.spyOn(service as any, 'completeInstance').mockResolvedValue(undefined);

    await (service as any).enterNodesInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      def,
      ['c1'],
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    // condition matched second branch → low-tgt is reached → completeInstance called
    expect(completeSpy).toHaveBeenCalledTimes(1);
    const actions = tx.sysWorkflowLog.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toContain('node-exit'); // condition exit log
    expect(tx._exitLogs).toContain('c1');
  });

  it('falls back to isDefault branch when no condition matches', async () => {
    const { service, matcher } = makeService();
    const cfg: ConditionNodeConfig = {
      branches: [
        { name: 'high', condition: { op: 'and', conditions: [] }, targetNodeId: 'high-tgt' },
        {
          name: 'default',
          condition: { op: 'and', conditions: [] },
          targetNodeId: 'def-tgt',
          isDefault: true,
        },
      ],
    };
    matcher.match.mockReturnValue(false);

    const def = makeDef(
      [
        { id: 'c1', type: 'condition', config: cfg },
        { id: 'high-tgt', type: 'end' },
        { id: 'def-tgt', type: 'end' },
      ],
      [],
    );
    const tx = makeTx();
    const completeSpy = vi.spyOn(service as any, 'completeInstance').mockResolvedValue(undefined);

    await (service as any).enterNodesInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      def,
      ['c1'],
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    expect(completeSpy).toHaveBeenCalled();
  });

  it('calls failInstance when no branch matches and no default', async () => {
    const { service, matcher } = makeService();
    const cfg: ConditionNodeConfig = {
      branches: [
        { name: 'high', condition: { op: 'and', conditions: [] }, targetNodeId: 'high-tgt' },
      ],
    };
    matcher.match.mockReturnValue(false);

    const def = makeDef(
      [
        { id: 'c1', type: 'condition', config: cfg },
        { id: 'high-tgt', type: 'end' },
      ],
      [],
    );
    const tx = makeTx();
    const failSpy = vi.spyOn(service as any, 'failInstance').mockResolvedValue(undefined);

    await (service as any).enterNodesInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      def,
      ['c1'],
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    expect(failSpy).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 'inst-1' }),
      ErrorCodes.WORKFLOW_CONDITION_NO_MATCH,
    );
  });
});

describe('WorkflowEngineService.enterNodesInTx — parallel-fork', () => {
  it('recurses to all outgoing nodes', async () => {
    const { service, resolver } = makeService();
    resolver.resolveWithFallback.mockResolvedValue({ assignees: ['ua'], shouldSkip: false });

    const approveCfg: ApproveNodeConfig = {
      assigneeStrategy: 'fixed',
      assigneeConfig: {},
      mode: 'and',
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

    const def = makeDef(
      [
        { id: 'fork', type: 'parallel-fork' },
        { id: 'a1', type: 'approve', config: approveCfg },
        { id: 'a2', type: 'approve', config: approveCfg },
      ],
      [
        { from: 'fork', to: 'a1' },
        { from: 'fork', to: 'a2' },
      ],
    );
    const tx = makeTx();
    await (service as any).enterNodesInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      def,
      ['fork'],
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    // Both branches launched → 2 approve tasks
    expect(tx.sysWorkflowTask.create).toHaveBeenCalledTimes(2);
    expect(tx._state.activeNodeIds.sort()).toEqual(['a1', 'a2']);
    expect(tx._exitLogs).toContain('fork');
  });
});

describe('WorkflowEngineService.enterNodesInTx — end node', () => {
  it('calls completeInstance with approved', async () => {
    const { service, eventBus } = makeService();
    const def = makeDef([{ id: 'end1', type: 'end' }], []);
    const tx = makeTx();

    await (service as any).enterNodesInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1', startedBy: 'u1' },
      def,
      ['end1'],
      {
        user: { userId: 'u1', orgId: 'o1' },
        appCode: 'sales',
        modelCode: 'lead',
        record: { foo: 'bar' },
      },
    );

    expect(tx.sysWorkflowInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inst-1' },
        data: expect.objectContaining({
          status: 'approved',
          finalSnapshot: { foo: 'bar' },
          activeNodeIds: [],
        }),
      }),
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      'workflow.completed',
      expect.objectContaining({ finalStatus: 'approved' }),
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      'workflow.state.changed',
      expect.objectContaining({ newStatus: 'approved' }),
    );
  });
});

describe('WorkflowEngineService.checkJoinInTx', () => {
  it("AND join: 2 incoming, 1 exited → does NOT advance", async () => {
    const { service } = makeService();
    const cfg: ParallelJoinConfig = { joinMode: 'and' };
    const def = makeDef(
      [
        { id: 'b1', type: 'approve' },
        { id: 'b2', type: 'approve' },
        { id: 'join', type: 'parallel-join', config: cfg },
        { id: 'end1', type: 'end' },
      ],
      [
        { from: 'b1', to: 'join' },
        { from: 'b2', to: 'join' },
        { from: 'join', to: 'end1' },
      ],
    );
    const tx = makeTx({ activeNodeIds: ['join'] });
    tx._exitLogs.push('b1'); // only one branch exited

    await (service as any).checkJoinInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      'join',
      def,
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    // Should not write a node-exit for the join nor change activeNodeIds
    expect(tx._exitLogs).not.toContain('join');
    expect(tx._state.activeNodeIds).toContain('join');
  });

  it('AND join: 2 incoming, 2 exited → advances + writes node-exit + recurses outgoing', async () => {
    const { service, eventBus } = makeService();
    const cfg: ParallelJoinConfig = { joinMode: 'and' };
    const def = makeDef(
      [
        { id: 'b1', type: 'approve' },
        { id: 'b2', type: 'approve' },
        { id: 'join', type: 'parallel-join', config: cfg },
        { id: 'end1', type: 'end' },
      ],
      [
        { from: 'b1', to: 'join' },
        { from: 'b2', to: 'join' },
        { from: 'join', to: 'end1' },
      ],
    );
    const tx = makeTx({ activeNodeIds: ['join'] });
    tx._exitLogs.push('b1', 'b2');

    await (service as any).checkJoinInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1', startedBy: 'u1' },
      'join',
      def,
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    expect(tx._exitLogs).toContain('join');
    expect(tx._state.activeNodeIds).not.toContain('join');
    // end node ran → completion event
    expect(eventBus.emit).toHaveBeenCalledWith(
      'workflow.completed',
      expect.objectContaining({ finalStatus: 'approved' }),
    );
  });

  it('OR join: 2 incoming, 1 exited → advances + cancels pending tasks of unfinished branches', async () => {
    const { service } = makeService();
    const cfg: ParallelJoinConfig = { joinMode: 'or' };
    const def = makeDef(
      [
        { id: 'b1', type: 'approve' },
        { id: 'b2', type: 'approve' },
        { id: 'join', type: 'parallel-join', config: cfg },
        { id: 'end1', type: 'end' },
      ],
      [
        { from: 'b1', to: 'join' },
        { from: 'b2', to: 'join' },
        { from: 'join', to: 'end1' },
      ],
    );
    const tx = makeTx({ activeNodeIds: ['join'] });
    tx._exitLogs.push('b1');

    await (service as any).checkJoinInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1', startedBy: 'u1' },
      'join',
      def,
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    expect(tx.sysWorkflowTask.updateMany).toHaveBeenCalledWith({
      where: {
        instanceId: 'inst-1',
        nodeId: { in: ['b2'] },
        status: 'pending',
      },
      data: { status: 'cancelled' },
    });
    expect(tx._exitLogs).toContain('join');
  });

  it('OR join: 2 incoming, 0 exited → does NOT advance', async () => {
    const { service } = makeService();
    const cfg: ParallelJoinConfig = { joinMode: 'or' };
    const def = makeDef(
      [
        { id: 'b1', type: 'approve' },
        { id: 'b2', type: 'approve' },
        { id: 'join', type: 'parallel-join', config: cfg },
      ],
      [
        { from: 'b1', to: 'join' },
        { from: 'b2', to: 'join' },
      ],
    );
    const tx = makeTx({ activeNodeIds: ['join'] });

    await (service as any).checkJoinInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      'join',
      def,
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    expect(tx._exitLogs).not.toContain('join');
    expect(tx.sysWorkflowTask.updateMany).not.toHaveBeenCalled();
  });
});

describe('WorkflowEngineService.completeInstance / failInstance', () => {
  it('completeInstance approved: updates status, writes node-exit log, creates notification, emits 2 events', async () => {
    const { service, eventBus } = makeService();
    const tx = makeTx();
    const instance = { id: 'inst-1', orgId: 'o1', startedBy: 'u1', recordId: 'rec-1' };
    await (service as any).completeInstance(tx, instance, 'approved', { x: 1 });

    expect(tx.sysWorkflowInstance.update).toHaveBeenCalledWith({
      where: { id: 'inst-1' },
      data: expect.objectContaining({
        status: 'approved',
        finalSnapshot: { x: 1 },
        activeNodeIds: [],
      }),
    });
    expect(tx.sysWorkflowLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        instanceId: 'inst-1',
        action: 'node-exit',
        nodeId: null,
      }),
    });
    expect(tx.sysNotification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        type: 'workflow_state',
        title: '审批已通过',
      }),
    });
    expect(eventBus.emit).toHaveBeenCalledWith(
      'workflow.completed',
      expect.objectContaining({ finalStatus: 'approved' }),
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      'workflow.state.changed',
      expect.objectContaining({ newStatus: 'approved', instanceId: 'inst-1' }),
    );
  });

  it("completeInstance rejected: action='cancel' + title 已驳回", async () => {
    const { service } = makeService();
    const tx = makeTx();
    const instance = { id: 'inst-1', orgId: 'o1', startedBy: 'u1', recordId: 'rec-1' };
    await (service as any).completeInstance(tx, instance, 'rejected', {});

    const logCall = tx.sysWorkflowLog.create.mock.calls[0][0];
    expect(logCall.data.action).toBe('cancel');
    const notifyCall = tx.sysNotification.create.mock.calls[0][0];
    expect(notifyCall.data.title).toBe('审批已驳回');
  });

  it('failInstance: status=cancelled + log with errorCode in data', async () => {
    const { service, eventBus } = makeService();
    const tx = makeTx();
    await (service as any).failInstance(
      tx,
      { id: 'inst-1', orgId: 'o1', startedBy: 'u1' },
      ErrorCodes.WORKFLOW_CONDITION_NO_MATCH,
    );

    expect(tx.sysWorkflowInstance.update).toHaveBeenCalledWith({
      where: { id: 'inst-1' },
      data: expect.objectContaining({ status: 'cancelled', activeNodeIds: [] }),
    });
    expect(tx.sysWorkflowLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'cancel',
        data: { errorCode: ErrorCodes.WORKFLOW_CONDITION_NO_MATCH },
      }),
    });
    expect(eventBus.emit).toHaveBeenCalledWith(
      'workflow.completed',
      expect.objectContaining({ finalStatus: 'cancelled' }),
    );
  });
});

describe('WorkflowEngineService.enterNodesInTx — cycle guard', () => {
  it('skips already-visited nodes within a single call', async () => {
    const { service } = makeService();
    const def = makeDef(
      [
        { id: 'fork', type: 'parallel-fork' },
        { id: 'end1', type: 'end' },
      ],
      [
        { from: 'fork', to: 'end1' },
        { from: 'fork', to: 'fork' }, // self-loop (malformed)
      ],
    );
    const tx = makeTx();
    const completeSpy = vi.spyOn(service as any, 'completeInstance').mockResolvedValue(undefined);

    await (service as any).enterNodesInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      def,
      ['fork'],
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    // end ran once; self-loop was skipped
    expect(completeSpy).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
//  Write-path tests (Phase F-2)
//
//  Build a Prisma double rich enough for the write methods: the engine
//  re-reads the task inside the txn (`findUnique`), counts approvals
//  (`count`), and queries `node-exit` logs (`findFirst`). We let `withLock`
//  run the fn synchronously and `$transaction` invoke its callback with our
//  fake tx so we exercise the txn body directly.
// ─────────────────────────────────────────────────────────────────────────

function makeWriteService(opts: {
  task?: any;
  taskById?: Record<string, any>;
  approvedTaskCount?: number;
  prevExit?: { nodeId: string } | null;
  instance?: any;
  nodeTasksByNode?: Record<string, any[]>;
}) {
  const taskStore: Record<string, any> = { ...(opts.taskById ?? {}) };
  if (opts.task) taskStore[opts.task.id] = opts.task;

  const tx: any = {
    sysWorkflowInstance: {
      findUnique: vi.fn(async () => ({ activeNodeIds: opts.instance?.activeNodeIds ?? [] })),
      update: vi.fn(async () => ({})),
    },
    sysWorkflowTask: {
      findUnique: vi.fn(async ({ where }: any) => taskStore[where.id] ?? null),
      findMany: vi.fn(async ({ where }: any) => {
        if (opts.nodeTasksByNode && where?.nodeId) {
          return opts.nodeTasksByNode[where.nodeId] ?? [];
        }
        return [];
      }),
      update: vi.fn(async ({ where, data }: any) => {
        if (taskStore[where.id]) Object.assign(taskStore[where.id], data);
        return taskStore[where.id];
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async ({ data }: any) => ({ id: `new-task-${Math.random()}`, ...data })),
    },
    sysWorkflowLog: {
      create: vi.fn(async ({ data }: any) => data),
      findFirst: vi.fn(async () => opts.prevExit ?? null),
    },
    sysNotification: {
      create: vi.fn(async ({ data }: any) => data),
    },
    _taskStore: taskStore,
  };

  const prisma: any = {
    sysWorkflow: { findUnique: vi.fn() },
    sysWorkflowTask: {
      findUnique: vi.fn(async ({ where }: any) => taskStore[where.id] ?? null),
      count: vi.fn(async () => opts.approvedTaskCount ?? 0),
    },
    sysWorkflowInstance: {
      findUnique: vi.fn(async () => opts.instance ?? null),
    },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  };
  const eventBus: any = { emit: vi.fn() };
  const resolver: any = { resolveWithFallback: vi.fn() };
  const lock: any = { withLock: vi.fn(async (_id: string, fn: any) => fn()) };
  const matcher: any = { match: vi.fn() };
  const timeoutQueue: any = {
    add: vi.fn(async () => ({})),
    remove: vi.fn(async () => 1),
  };

  const service = new WorkflowEngineService(
    prisma,
    eventBus,
    resolver,
    lock,
    matcher,
    timeoutQueue,
  );
  return { service, prisma, eventBus, resolver, lock, matcher, tx, taskStore, timeoutQueue };
}

const ALLOW_ALL = {
  approve: true,
  reject: true,
  transfer: true,
  addBefore: true,
  addAfter: true,
  returnPrev: true,
  returnStart: true,
};

function approveCfg(overrides: Partial<ApproveNodeConfig> = {}): ApproveNodeConfig {
  return {
    assigneeStrategy: 'fixed',
    assigneeConfig: {},
    mode: 'and',
    onEmpty: 'error',
    autoSkipDuplicates: false,
    autoSkipSubmitter: false,
    allowedActions: { ...ALLOW_ALL },
    ...overrides,
  };
}

function buildInstanceWithApproveNode(overrides: {
  nodeId?: string;
  mode?: 'and' | 'or' | 'sequential';
  allowed?: Partial<typeof ALLOW_ALL>;
  outgoing?: Array<{ to: string; toType?: any }>;
} = {}) {
  const nodeId = overrides.nodeId ?? 'a1';
  const cfg = approveCfg({
    mode: overrides.mode ?? 'and',
    allowedActions: { ...ALLOW_ALL, ...(overrides.allowed ?? {}) },
  });
  const outgoing = overrides.outgoing ?? [];
  const def: WorkflowDefinition = makeDef(
    [
      { id: nodeId, type: 'approve', name: 'Approve A', config: cfg },
      ...outgoing.map((o) => ({ id: o.to, type: o.toType ?? 'end', name: o.to })),
    ],
    outgoing.map((o) => ({ from: nodeId, to: o.to })),
  );
  const instance = {
    id: 'inst-1',
    orgId: 'o1',
    startedBy: 'submitter-1',
    status: 'running',
    activeNodeIds: [nodeId],
    workflowVersion: { definition: def },
  };
  return { def, instance, cfg };
}

describe('WorkflowEngineService.decide — authorization', () => {
  it('throws WORKFLOW_TASK_NOT_FOUND when task missing', async () => {
    const { service } = makeWriteService({});
    await expect(
      service.decide('missing', 'approve', { userId: 'u1', orgId: 'o1' }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_TASK_NOT_FOUND });
  });

  it('throws WORKFLOW_TASK_NOT_PENDING when status != pending', async () => {
    const { instance } = buildInstanceWithApproveNode();
    const task = {
      id: 't1',
      status: 'approved',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      instance,
    };
    const { service } = makeWriteService({ task });
    await expect(
      service.decide('t1', 'approve', { userId: 'u1', orgId: 'o1' }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_TASK_NOT_PENDING });
  });

  it('throws WORKFLOW_TASK_NOT_ASSIGNEE when not the assignee', async () => {
    const { instance } = buildInstanceWithApproveNode();
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'someone-else',
      instanceId: instance.id,
      nodeId: 'a1',
      instance,
    };
    const { service } = makeWriteService({ task });
    await expect(
      service.decide('t1', 'approve', { userId: 'u1', orgId: 'o1' }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_TASK_NOT_ASSIGNEE });
  });

  it('throws WORKFLOW_INSTANCE_NOT_RUNNING when instance is done', async () => {
    const { instance } = buildInstanceWithApproveNode();
    instance.status = 'approved';
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      instance,
    };
    const { service } = makeWriteService({ task });
    await expect(
      service.decide('t1', 'approve', { userId: 'u1', orgId: 'o1' }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_INSTANCE_NOT_RUNNING });
  });

  it('throws WORKFLOW_ACTION_NOT_ALLOWED when allowedActions.approve=false', async () => {
    const { instance } = buildInstanceWithApproveNode({ allowed: { approve: false } });
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      instance,
    };
    const { service } = makeWriteService({ task });
    await expect(
      service.decide('t1', 'approve', { userId: 'u1', orgId: 'o1' }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_ACTION_NOT_ALLOWED });
  });

  it('throws WORKFLOW_ACTION_NOT_ALLOWED when allowedActions.reject=false', async () => {
    const { instance } = buildInstanceWithApproveNode({ allowed: { reject: false } });
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      instance,
    };
    const { service } = makeWriteService({ task });
    await expect(
      service.decide('t1', 'reject', { userId: 'u1', orgId: 'o1' }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_ACTION_NOT_ALLOWED });
  });
});

describe('WorkflowEngineService.decide — approve flow', () => {
  it("mode='and' with 2 tasks, only 1 approved → does NOT advance, no completeInstance", async () => {
    const { instance } = buildInstanceWithApproveNode({ mode: 'and' });
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      sortOrder: 0,
      mode: 'and',
      instance,
    };
    // After update: t1 approved, t2 still pending
    const sibling = { id: 't2', status: 'pending', assigneeUserId: 'u2', sortOrder: 1 };
    const { service, tx, eventBus } = makeWriteService({
      task,
      nodeTasksByNode: { a1: [task, sibling] },
    });
    // Simulate the in-txn update by having findMany return t1 as approved
    tx.sysWorkflowTask.findMany.mockImplementation(async () => [
      { ...task, status: 'approved' },
      sibling,
    ]);

    const enterSpy = vi.spyOn(service as any, 'enterNodesInTx').mockResolvedValue(undefined);
    const completeSpy = vi
      .spyOn(service as any, 'completeInstance')
      .mockResolvedValue(undefined);

    await service.decide('t1', 'approve', { userId: 'u1', orgId: 'o1' });

    expect(enterSpy).not.toHaveBeenCalled();
    expect(completeSpy).not.toHaveBeenCalled();
    // task got updated
    expect(tx.sysWorkflowTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({ status: 'approved' }),
      }),
    );
    // inbox done event for current user
    expect(eventBus.emit).toHaveBeenCalledWith(
      'workflow.inbox.done',
      expect.objectContaining({ userId: 'u1', taskId: 't1' }),
    );
  });

  it("mode='and' all approved → exits node + recurses to outgoing via enterNodesInTx", async () => {
    const { instance } = buildInstanceWithApproveNode({
      mode: 'and',
      outgoing: [{ to: 'end1' }],
    });
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      sortOrder: 0,
      mode: 'and',
      instance,
    };
    const sibling = { id: 't2', status: 'approved', assigneeUserId: 'u2', sortOrder: 1 };
    const { service, tx } = makeWriteService({
      task,
      nodeTasksByNode: { a1: [task, sibling] },
    });
    tx.sysWorkflowTask.findMany.mockImplementation(async () => [
      { ...task, status: 'approved' },
      sibling,
    ]);
    const enterSpy = vi.spyOn(service as any, 'enterNodesInTx').mockResolvedValue(undefined);

    await service.decide('t1', 'approve', { userId: 'u1', orgId: 'o1' });

    expect(enterSpy).toHaveBeenCalledWith(
      tx,
      instance,
      expect.anything(),
      ['end1'],
      expect.objectContaining({ user: { userId: 'u1', orgId: 'o1' } }),
    );
    // node-exit log written
    const exitLog = tx.sysWorkflowLog.create.mock.calls.find(
      (c: any) => c[0].data.action === 'node-exit',
    );
    expect(exitLog).toBeDefined();
  });

  it("mode='or' first approval → cancels remaining pending + advances", async () => {
    const { instance } = buildInstanceWithApproveNode({
      mode: 'or',
      outgoing: [{ to: 'end1' }],
    });
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      sortOrder: 0,
      mode: 'or',
      instance,
    };
    const sibling = { id: 't2', status: 'pending', assigneeUserId: 'u2', sortOrder: 1 };
    const { service, tx } = makeWriteService({
      task,
      nodeTasksByNode: { a1: [task, sibling] },
    });
    tx.sysWorkflowTask.findMany.mockImplementation(async () => [
      { ...task, status: 'approved' },
      sibling,
    ]);
    const enterSpy = vi.spyOn(service as any, 'enterNodesInTx').mockResolvedValue(undefined);

    await service.decide('t1', 'approve', { userId: 'u1', orgId: 'o1' });

    // siblings cancelled
    expect(tx.sysWorkflowTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          instanceId: 'inst-1',
          nodeId: 'a1',
          status: 'pending',
        }),
        data: { status: 'cancelled' },
      }),
    );
    expect(enterSpy).toHaveBeenCalled();
  });

  it("mode='sequential' approval → creates next assignee's task, does not advance", async () => {
    const { instance } = buildInstanceWithApproveNode({ mode: 'sequential' });
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'ua',
      instanceId: instance.id,
      nodeId: 'a1',
      sortOrder: 0,
      mode: 'sequential',
      instance,
    };
    const { service, tx, resolver, eventBus } = makeWriteService({
      task,
      nodeTasksByNode: { a1: [task] },
    });
    tx.sysWorkflowTask.findMany.mockImplementation(async () => [
      { ...task, status: 'approved' },
    ]);
    resolver.resolveWithFallback.mockResolvedValue({
      assignees: ['ua', 'ub', 'uc'],
      shouldSkip: false,
    });
    const enterSpy = vi.spyOn(service as any, 'enterNodesInTx').mockResolvedValue(undefined);

    await service.decide('t1', 'approve', { userId: 'ua', orgId: 'o1' });

    // Next task created for 'ub' with sortOrder 1
    const createdTasks = tx.sysWorkflowTask.create.mock.calls;
    expect(createdTasks).toHaveLength(1);
    expect(createdTasks[0][0].data).toMatchObject({
      assigneeUserId: 'ub',
      sortOrder: 1,
      mode: 'sequential',
      status: 'pending',
    });
    expect(eventBus.emit).toHaveBeenCalledWith(
      'workflow.inbox.new',
      expect.objectContaining({ userId: 'ub' }),
    );
    // node did NOT advance
    expect(enterSpy).not.toHaveBeenCalled();
  });

  it("mode='sequential' last assignee approves → advances to outgoing", async () => {
    const { instance } = buildInstanceWithApproveNode({
      mode: 'sequential',
      outgoing: [{ to: 'end1' }],
    });
    const t1 = {
      id: 't1',
      status: 'approved',
      assigneeUserId: 'ua',
      sortOrder: 0,
      mode: 'sequential',
    };
    const t2 = {
      id: 't2',
      status: 'pending',
      assigneeUserId: 'ub',
      instanceId: instance.id,
      nodeId: 'a1',
      sortOrder: 1,
      mode: 'sequential',
      instance,
    };
    const { service, tx, resolver } = makeWriteService({
      task: t2,
      nodeTasksByNode: { a1: [t1, t2] },
    });
    tx.sysWorkflowTask.findMany.mockImplementation(async () => [
      t1,
      { ...t2, status: 'approved' },
    ]);
    resolver.resolveWithFallback.mockResolvedValue({
      assignees: ['ua', 'ub'],
      shouldSkip: false,
    });
    const enterSpy = vi.spyOn(service as any, 'enterNodesInTx').mockResolvedValue(undefined);

    await service.decide('t2', 'approve', { userId: 'ub', orgId: 'o1' });

    expect(enterSpy).toHaveBeenCalledWith(
      tx,
      instance,
      expect.anything(),
      ['end1'],
      expect.anything(),
    );
  });
});

describe('WorkflowEngineService.decide — reject flow', () => {
  it('reject cancels pending tasks + calls completeInstance with rejected', async () => {
    const { instance } = buildInstanceWithApproveNode();
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      sortOrder: 0,
      mode: 'and',
      instance,
    };
    const { service, tx } = makeWriteService({ task });
    const completeSpy = vi
      .spyOn(service as any, 'completeInstance')
      .mockResolvedValue(undefined);

    await service.decide('t1', 'reject', { userId: 'u1', orgId: 'o1' }, 'NG');

    expect(tx.sysWorkflowTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({ status: 'rejected', comment: 'NG' }),
      }),
    );
    // pending cancellation broadcast
    expect(tx.sysWorkflowTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { instanceId: 'inst-1', status: 'pending' },
        data: { status: 'cancelled' },
      }),
    );
    expect(completeSpy).toHaveBeenCalledWith(tx, instance, 'rejected', null);
  });
});

describe('WorkflowEngineService.transfer', () => {
  it('throws ADD_SIGNER_SELF when transferring to self', async () => {
    const { instance } = buildInstanceWithApproveNode();
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      instance,
    };
    const { service } = makeWriteService({ task });
    await expect(
      service.transfer('t1', 'u1', { userId: 'u1', orgId: 'o1' }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_ADD_SIGNER_SELF });
  });

  it('throws ACTION_NOT_ALLOWED when transfer disabled', async () => {
    const { instance } = buildInstanceWithApproveNode({ allowed: { transfer: false } });
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      instance,
    };
    const { service } = makeWriteService({ task });
    await expect(
      service.transfer('t1', 'u2', { userId: 'u1', orgId: 'o1' }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_ACTION_NOT_ALLOWED });
  });

  it('throws TASK_NOT_FOUND when task missing', async () => {
    const { service } = makeWriteService({});
    await expect(
      service.transfer('missing', 'u2', { userId: 'u1', orgId: 'o1' }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_TASK_NOT_FOUND });
  });

  it('happy path: original → transferred, new task pending for newUserId', async () => {
    const { instance } = buildInstanceWithApproveNode();
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      nodeName: 'Approve A',
      mode: 'and',
      sortOrder: 0,
      dueAt: null,
      instance,
    };
    const { service, tx, eventBus } = makeWriteService({ task });

    await service.transfer('t1', 'u2', { userId: 'u1', orgId: 'o1' }, 'fyi');

    expect(tx.sysWorkflowTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({ status: 'transferred', comment: 'fyi' }),
      }),
    );
    expect(tx.sysWorkflowTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assigneeUserId: 'u2',
          transferredFromUserId: 'u1',
          status: 'pending',
          nodeId: 'a1',
          sortOrder: 0,
        }),
      }),
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      'workflow.inbox.new',
      expect.objectContaining({ userId: 'u2' }),
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      'workflow.inbox.done',
      expect.objectContaining({ userId: 'u1', taskId: 't1' }),
    );
  });
});

describe('WorkflowEngineService.addSigner', () => {
  it('throws ADD_SIGNER_SELF when adding self', async () => {
    const { service } = makeWriteService({});
    await expect(
      service.addSigner('t1', 'before', 'u1', { userId: 'u1', orgId: 'o1' }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_ADD_SIGNER_SELF });
  });

  it('throws ACTION_NOT_ALLOWED when addBefore disabled', async () => {
    const { instance } = buildInstanceWithApproveNode({ allowed: { addBefore: false } });
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      instance,
    };
    const { service } = makeWriteService({ task });
    await expect(
      service.addSigner('t1', 'before', 'u2', { userId: 'u1', orgId: 'o1' }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_ACTION_NOT_ALLOWED });
  });

  it('before: cancels self + creates new task at sortOrder-1 with parentTaskId=self', async () => {
    const { instance } = buildInstanceWithApproveNode();
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      nodeName: 'Approve A',
      mode: 'and',
      sortOrder: 5,
      dueAt: null,
      instance,
    };
    const { service, tx, eventBus } = makeWriteService({ task });
    await service.addSigner('t1', 'before', 'u2', { userId: 'u1', orgId: 'o1' });

    expect(tx.sysWorkflowTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({ status: 'cancelled' }),
      }),
    );
    expect(tx.sysWorkflowTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assigneeUserId: 'u2',
          sortOrder: 4,
          parentTaskId: 't1',
          addedPosition: 'before',
          addedByUserId: 'u1',
          status: 'pending',
        }),
      }),
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      'workflow.inbox.done',
      expect.objectContaining({ userId: 'u1', taskId: 't1' }),
    );
    const logActions = tx.sysWorkflowLog.create.mock.calls.map((c: any) => c[0].data.action);
    expect(logActions).toContain('add-before');
  });

  it('after: self remains pending, new task at sortOrder+1', async () => {
    const { instance } = buildInstanceWithApproveNode();
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      nodeName: 'Approve A',
      mode: 'and',
      sortOrder: 5,
      dueAt: null,
      instance,
    };
    const { service, tx } = makeWriteService({ task });
    await service.addSigner('t1', 'after', 'u2', { userId: 'u1', orgId: 'o1' });

    // self NOT updated
    expect(tx.sysWorkflowTask.update).not.toHaveBeenCalled();
    expect(tx.sysWorkflowTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assigneeUserId: 'u2',
          sortOrder: 6,
          parentTaskId: 't1',
          addedPosition: 'after',
        }),
      }),
    );
    const logActions = tx.sysWorkflowLog.create.mock.calls.map((c: any) => c[0].data.action);
    expect(logActions).toContain('add-after');
  });
});

describe('WorkflowEngineService.returnTask', () => {
  it('throws ACTION_NOT_ALLOWED when returnStart disabled', async () => {
    const { instance } = buildInstanceWithApproveNode({ allowed: { returnStart: false } });
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      instance,
    };
    const { service } = makeWriteService({ task });
    await expect(
      service.returnTask('t1', 'start', { userId: 'u1', orgId: 'o1' }, 'nope'),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_ACTION_NOT_ALLOWED });
  });

  it("'start': cancels pending, status='returned', emits 3 events", async () => {
    const { instance } = buildInstanceWithApproveNode();
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      nodeName: 'Approve A',
      instance,
    };
    const { service, tx, eventBus } = makeWriteService({ task });
    await service.returnTask('t1', 'start', { userId: 'u1', orgId: 'o1' }, 'please redo');

    expect(tx.sysWorkflowTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { instanceId: 'inst-1', status: 'pending' },
        data: { status: 'cancelled' },
      }),
    );
    expect(tx.sysWorkflowInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inst-1' },
        data: expect.objectContaining({
          status: 'returned',
          activeNodeIds: [],
        }),
      }),
    );
    const events = eventBus.emit.mock.calls.map((c: any) => c[0]);
    expect(events).toContain('workflow.completed');
    expect(events).toContain('workflow.state.changed');
    expect(events).toContain('workflow.inbox.done');
  });

  it("'prev': cancels current node tasks + writes return-prev log + calls enterNodesInTx with prev node", async () => {
    const { instance } = buildInstanceWithApproveNode({ outgoing: [{ to: 'end1' }] });
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      nodeName: 'Approve A',
      instance,
    };
    const { service, tx } = makeWriteService({
      task,
      prevExit: { nodeId: 'prev-node' },
      instance: { activeNodeIds: ['a1'] },
    });
    const enterSpy = vi.spyOn(service as any, 'enterNodesInTx').mockResolvedValue(undefined);

    await service.returnTask('t1', 'prev', { userId: 'u1', orgId: 'o1' }, 'go back');

    expect(tx.sysWorkflowTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { instanceId: 'inst-1', nodeId: 'a1', status: 'pending' },
        data: { status: 'cancelled' },
      }),
    );
    const actions = tx.sysWorkflowLog.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toContain('return-prev');
    expect(enterSpy).toHaveBeenCalledWith(
      tx,
      instance,
      expect.anything(),
      ['prev-node'],
      expect.objectContaining({
        user: { userId: 'submitter-1', orgId: 'o1' },
      }),
    );
  });

  it("'prev' throws WORKFLOW_RETURN_NO_PREVIOUS when no prior node-exit log", async () => {
    const { instance } = buildInstanceWithApproveNode();
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      nodeName: 'Approve A',
      instance,
    };
    const { service } = makeWriteService({ task, prevExit: null });
    await expect(
      service.returnTask('t1', 'prev', { userId: 'u1', orgId: 'o1' }, 'go back'),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_RETURN_NO_PREVIOUS });
  });
});

describe('WorkflowEngineService.withdraw', () => {
  it('throws INSTANCE_NOT_FOUND when missing', async () => {
    const { service } = makeWriteService({ instance: null });
    await expect(
      service.withdraw('missing', { userId: 'u1', orgId: 'o1' }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_INSTANCE_NOT_FOUND });
  });

  it('throws INSTANCE_NOT_RUNNING when already done', async () => {
    const { service } = makeWriteService({
      instance: { id: 'inst-1', status: 'approved', startedBy: 'u1' },
    });
    await expect(
      service.withdraw('inst-1', { userId: 'u1', orgId: 'o1' }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_INSTANCE_NOT_RUNNING });
  });

  it('throws TASK_NOT_ASSIGNEE when not submitter', async () => {
    const { service } = makeWriteService({
      instance: { id: 'inst-1', status: 'running', startedBy: 'submitter' },
    });
    await expect(
      service.withdraw('inst-1', { userId: 'u1', orgId: 'o1' }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_TASK_NOT_ASSIGNEE });
  });

  it('throws WITHDRAW_HAS_APPROVAL when any task already approved', async () => {
    const { service } = makeWriteService({
      instance: { id: 'inst-1', status: 'running', startedBy: 'u1', orgId: 'o1' },
      approvedTaskCount: 1,
    });
    await expect(
      service.withdraw('inst-1', { userId: 'u1', orgId: 'o1' }),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.WORKFLOW_WITHDRAW_HAS_APPROVAL });
  });

  it('happy path: cancels pending, status=withdrawn, emits 2 events', async () => {
    const { service, tx, eventBus } = makeWriteService({
      instance: { id: 'inst-1', status: 'running', startedBy: 'u1', orgId: 'o1' },
      approvedTaskCount: 0,
    });
    await service.withdraw('inst-1', { userId: 'u1', orgId: 'o1' });

    expect(tx.sysWorkflowTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { instanceId: 'inst-1', status: 'pending' },
        data: { status: 'cancelled' },
      }),
    );
    expect(tx.sysWorkflowInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inst-1' },
        data: expect.objectContaining({
          status: 'withdrawn',
          activeNodeIds: [],
        }),
      }),
    );
    const events = eventBus.emit.mock.calls.map((c: any) => c[0]);
    expect(events).toContain('workflow.completed');
    expect(events).toContain('workflow.state.changed');
  });
});

describe('WorkflowEngineService.cancel', () => {
  it('throws INSTANCE_NOT_FOUND when missing', async () => {
    const { service } = makeWriteService({ instance: null });
    await expect(service.cancel('missing', 'no reason')).rejects.toMatchObject({
      errorCode: ErrorCodes.WORKFLOW_INSTANCE_NOT_FOUND,
    });
  });

  it('is a no-op (idempotent) on already-ended instance', async () => {
    const { service, tx } = makeWriteService({
      instance: { id: 'inst-1', status: 'approved', startedBy: 'u1' },
    });
    await service.cancel('inst-1', 'unapprove');
    // no updates issued
    expect(tx.sysWorkflowInstance.update).not.toHaveBeenCalled();
  });

  it('happy path: cancels pending, status=cancelled, emits completed event', async () => {
    const { service, tx, eventBus } = makeWriteService({
      instance: { id: 'inst-1', status: 'running', startedBy: 'u1', orgId: 'o1' },
    });
    await service.cancel('inst-1', 'admin unapprove');

    expect(tx.sysWorkflowTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { instanceId: 'inst-1', status: 'pending' },
        data: { status: 'cancelled' },
      }),
    );
    expect(tx.sysWorkflowInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inst-1' },
        data: expect.objectContaining({ status: 'cancelled' }),
      }),
    );
    const logCall = tx.sysWorkflowLog.create.mock.calls.find(
      (c: any) => c[0].data.action === 'cancel',
    );
    expect(logCall?.[0].data.data).toEqual({ reason: 'admin unapprove' });
    expect(eventBus.emit).toHaveBeenCalledWith(
      'workflow.completed',
      expect.objectContaining({ finalStatus: 'cancelled' }),
    );
  });
});

describe('WorkflowEngineService.tryAdvanceInTx — add-before re-creation', () => {
  it('after addBefore task is approved, spawns a fresh task for parent assignee at parent sortOrder', async () => {
    const { instance } = buildInstanceWithApproveNode({ mode: 'and' });
    // The just-approved "addBefore" task and its cancelled parent
    const parentTask = {
      id: 'parent-t',
      status: 'cancelled',
      assigneeUserId: 'u1',
      sortOrder: 5,
      mode: 'and',
      dueAt: null,
    };
    const addedBeforeTask = {
      id: 'added-t',
      status: 'approved',
      assigneeUserId: 'u2',
      sortOrder: 4,
      mode: 'and',
      parentTaskId: 'parent-t',
      addedPosition: 'before',
      decisionAt: new Date(),
    };
    const { service, tx, eventBus } = makeWriteService({
      taskById: { 'parent-t': parentTask, 'added-t': addedBeforeTask },
      nodeTasksByNode: { a1: [addedBeforeTask, parentTask] },
    });
    const enterSpy = vi.spyOn(service as any, 'enterNodesInTx').mockResolvedValue(undefined);

    // Call tryAdvanceInTx directly
    await (service as any).tryAdvanceInTx(
      tx,
      instance,
      'a1',
      instance.workflowVersion.definition,
      { userId: 'u2', orgId: 'o1' },
    );

    // Should create a revived task for parent's assignee at parent's sortOrder
    expect(tx.sysWorkflowTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assigneeUserId: 'u1',
          sortOrder: 5,
          status: 'pending',
          mode: 'and',
        }),
      }),
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      'workflow.inbox.new',
      expect.objectContaining({ userId: 'u1' }),
    );
    // node did NOT advance — waiting for the revived task
    expect(enterSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
//  Phase J: bullmq timeout job scheduling/cancellation
//
//  These tests don't run a real bullmq worker — they assert the engine's
//  contract with the queue: an `add()` call when an approve task is created
//  with `timeoutHours`, and a `remove()` call when that task transitions out
//  of `pending` via any of the engine's mutators.
// ─────────────────────────────────────────────────────────────────────────

describe('WorkflowEngineService — timeout job scheduling (Phase J)', () => {
  it('approve node with timeoutHours: schedules bullmq job with correct delay + jobId', async () => {
    const { service, resolver, timeoutQueue } = makeService();
    resolver.resolveWithFallback.mockResolvedValue({ assignees: ['ua'], shouldSkip: false });

    const cfg: ApproveNodeConfig = {
      assigneeStrategy: 'fixed',
      assigneeConfig: {},
      mode: 'and',
      onEmpty: 'error',
      autoSkipDuplicates: false,
      autoSkipSubmitter: false,
      timeoutHours: 24,
      allowedActions: ALLOW_ALL,
    };
    const def = makeDef([{ id: 'a1', type: 'approve', config: cfg }], []);
    const tx = makeTx();
    // Stable task id so we can assert on jobId
    tx.sysWorkflowTask.create = vi.fn(async ({ data }: any) => ({ id: 'task-fixed', ...data })) as any;

    await (service as any).enterNodesInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      def,
      ['a1'],
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    expect(timeoutQueue.add).toHaveBeenCalledTimes(1);
    const [name, payload, opts] = timeoutQueue.add.mock.calls[0];
    expect(name).toBe('task-timeout');
    expect(payload).toEqual({ taskId: 'task-fixed' });
    expect(opts.jobId).toBe('task-timeout-task-fixed');
    expect(opts.delay).toBe(24 * 3600 * 1000);
    expect(opts.removeOnComplete).toBe(true);
  });

  it('approve node without timeoutHours: does NOT schedule', async () => {
    const { service, resolver, timeoutQueue } = makeService();
    resolver.resolveWithFallback.mockResolvedValue({ assignees: ['ua'], shouldSkip: false });

    const cfg: ApproveNodeConfig = {
      assigneeStrategy: 'fixed',
      assigneeConfig: {},
      mode: 'and',
      onEmpty: 'error',
      autoSkipDuplicates: false,
      autoSkipSubmitter: false,
      allowedActions: ALLOW_ALL,
    };
    const def = makeDef([{ id: 'a1', type: 'approve', config: cfg }], []);
    const tx = makeTx();
    await (service as any).enterNodesInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      def,
      ['a1'],
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    expect(timeoutQueue.add).not.toHaveBeenCalled();
  });

  it('approve node with timeoutHours=0: does NOT schedule', async () => {
    const { service, resolver, timeoutQueue } = makeService();
    resolver.resolveWithFallback.mockResolvedValue({ assignees: ['ua'], shouldSkip: false });

    const cfg: ApproveNodeConfig = {
      assigneeStrategy: 'fixed',
      assigneeConfig: {},
      mode: 'and',
      onEmpty: 'error',
      autoSkipDuplicates: false,
      autoSkipSubmitter: false,
      timeoutHours: 0,
      allowedActions: ALLOW_ALL,
    };
    const def = makeDef([{ id: 'a1', type: 'approve', config: cfg }], []);
    const tx = makeTx();
    await (service as any).enterNodesInTx(
      tx,
      { id: 'inst-1', orgId: 'o1', recordId: 'rec-1' },
      def,
      ['a1'],
      { user: { userId: 'u1', orgId: 'o1' }, appCode: 'sales', modelCode: 'lead', record: {} },
    );

    expect(timeoutQueue.add).not.toHaveBeenCalled();
  });

  it('decide(approve): removes timeout job for the decided task', async () => {
    const { instance } = buildInstanceWithApproveNode({ mode: 'and' });
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      sortOrder: 0,
      mode: 'and',
      instance,
    };
    const sibling = { id: 't2', status: 'pending', assigneeUserId: 'u2', sortOrder: 1 };
    const { service, tx, timeoutQueue } = makeWriteService({
      task,
      nodeTasksByNode: { a1: [task, sibling] },
    });
    tx.sysWorkflowTask.findMany.mockImplementation(async () => [
      { ...task, status: 'approved' },
      sibling,
    ]);

    await service.decide('t1', 'approve', { userId: 'u1', orgId: 'o1' });

    expect(timeoutQueue.remove).toHaveBeenCalledWith('task-timeout-t1');
  });

  it('decide(reject): removes timeout jobs for decided task + all still-pending tasks', async () => {
    const { instance } = buildInstanceWithApproveNode({ mode: 'and' });
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      sortOrder: 0,
      mode: 'and',
      instance,
    };
    const sibling = { id: 't2', status: 'pending', assigneeUserId: 'u2' };
    const { service, tx, timeoutQueue } = makeWriteService({ task });
    // The reject path queries pending tasks before cancelling them
    tx.sysWorkflowTask.findMany.mockImplementation(async ({ where }: any) => {
      if (where?.status === 'pending') return [sibling];
      return [];
    });

    await service.decide('t1', 'reject', { userId: 'u1', orgId: 'o1' });

    const removedJobIds = timeoutQueue.remove.mock.calls.map((c: any) => c[0]);
    expect(removedJobIds).toContain('task-timeout-t1');
    expect(removedJobIds).toContain('task-timeout-t2');
  });

  it('transfer: removes old job + schedules a new one based on inherited dueAt', async () => {
    const future = new Date(Date.now() + 12 * 3600 * 1000);
    const { instance } = buildInstanceWithApproveNode();
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      nodeName: 'Approve A',
      mode: 'and',
      sortOrder: 0,
      dueAt: future,
      instance,
    };
    const { service, tx, timeoutQueue } = makeWriteService({ task });
    tx.sysWorkflowTask.create = vi.fn(async ({ data }: any) => ({
      id: 'new-task-id',
      ...data,
    }));

    await service.transfer('t1', 'u2', { userId: 'u1', orgId: 'o1' });

    expect(timeoutQueue.remove).toHaveBeenCalledWith('task-timeout-t1');
    expect(timeoutQueue.add).toHaveBeenCalledTimes(1);
    const opts = timeoutQueue.add.mock.calls[0][2];
    expect(opts.jobId).toBe('task-timeout-new-task-id');
    expect(opts.delay).toBeGreaterThan(0);
  });

  it('addSigner before: removes self job + schedules new task job when dueAt set', async () => {
    const future = new Date(Date.now() + 6 * 3600 * 1000);
    const { instance } = buildInstanceWithApproveNode();
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      nodeName: 'Approve A',
      mode: 'and',
      sortOrder: 5,
      dueAt: future,
      instance,
    };
    const { service, tx, timeoutQueue } = makeWriteService({ task });
    tx.sysWorkflowTask.create = vi.fn(async ({ data }: any) => ({
      id: 'added-task',
      ...data,
    }));

    await service.addSigner('t1', 'before', 'u2', { userId: 'u1', orgId: 'o1' });

    expect(timeoutQueue.remove).toHaveBeenCalledWith('task-timeout-t1');
    expect(timeoutQueue.add).toHaveBeenCalledTimes(1);
    expect(timeoutQueue.add.mock.calls[0][2].jobId).toBe('task-timeout-added-task');
  });

  it('addSigner after: does NOT remove self job (self still pending), schedules new', async () => {
    const future = new Date(Date.now() + 6 * 3600 * 1000);
    const { instance } = buildInstanceWithApproveNode();
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      nodeName: 'Approve A',
      mode: 'and',
      sortOrder: 5,
      dueAt: future,
      instance,
    };
    const { service, tx, timeoutQueue } = makeWriteService({ task });
    tx.sysWorkflowTask.create = vi.fn(async ({ data }: any) => ({
      id: 'after-task',
      ...data,
    }));

    await service.addSigner('t1', 'after', 'u2', { userId: 'u1', orgId: 'o1' });

    expect(timeoutQueue.remove).not.toHaveBeenCalled();
    expect(timeoutQueue.add).toHaveBeenCalledTimes(1);
  });

  it('withdraw: removes timeout jobs for all pending tasks', async () => {
    const { service, tx, timeoutQueue } = makeWriteService({
      instance: { id: 'inst-1', status: 'running', startedBy: 'u1', orgId: 'o1' },
      approvedTaskCount: 0,
    });
    tx.sysWorkflowTask.findMany.mockImplementation(async () => [
      { id: 't1' },
      { id: 't2' },
    ]);

    await service.withdraw('inst-1', { userId: 'u1', orgId: 'o1' });

    const removed = timeoutQueue.remove.mock.calls.map((c: any) => c[0]);
    expect(removed).toContain('task-timeout-t1');
    expect(removed).toContain('task-timeout-t2');
  });

  it('cancel: removes timeout jobs for all pending tasks', async () => {
    const { service, tx, timeoutQueue } = makeWriteService({
      instance: { id: 'inst-1', status: 'running', startedBy: 'u1', orgId: 'o1' },
    });
    tx.sysWorkflowTask.findMany.mockImplementation(async () => [{ id: 't1' }, { id: 't3' }]);

    await service.cancel('inst-1', 'admin');

    const removed = timeoutQueue.remove.mock.calls.map((c: any) => c[0]);
    expect(removed).toContain('task-timeout-t1');
    expect(removed).toContain('task-timeout-t3');
  });

  it("returnTask 'prev': removes pending timeout jobs of the current node", async () => {
    const { instance } = buildInstanceWithApproveNode();
    const task = {
      id: 't1',
      status: 'pending',
      assigneeUserId: 'u1',
      instanceId: instance.id,
      nodeId: 'a1',
      nodeName: 'Approve A',
      instance,
    };
    const { service, tx, timeoutQueue } = makeWriteService({
      task,
      prevExit: { nodeId: 'prev-node' },
    });
    tx.sysWorkflowTask.findMany.mockImplementation(async ({ where }: any) => {
      if (where?.status === 'pending') return [{ id: 't1' }, { id: 'sibling' }];
      return [];
    });
    vi.spyOn(service as any, 'enterNodesInTx').mockResolvedValue(undefined);

    await service.returnTask('t1', 'prev', { userId: 'u1', orgId: 'o1' }, 'go back');

    const removed = timeoutQueue.remove.mock.calls.map((c: any) => c[0]);
    expect(removed).toContain('task-timeout-t1');
    expect(removed).toContain('task-timeout-sibling');
  });
});
