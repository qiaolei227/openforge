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

  const service = new WorkflowEngineService(prisma, eventBus, resolver, lock, matcher);
  return { service, prisma, eventBus, resolver, lock, matcher };
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
