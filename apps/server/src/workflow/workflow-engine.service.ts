import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { AssigneeResolverService } from './assignee-resolver.service';
import { WorkflowLockHelper } from './workflow-lock.helper';
import { WorkflowConditionMatcher } from './workflow-condition-matcher.service';
import {
  ApproveNodeConfig,
  CcNodeConfig,
  ConditionNodeConfig,
  ParallelJoinConfig,
  WorkflowDefinition,
  WorkflowNode,
} from './types';

/**
 * Build the bullmq jobId for a task's timeout job. Stable so we can both
 * dedup on add() and remove on decision/cancellation.
 */
function timeoutJobId(taskId: string): string {
  return `task-timeout-${taskId}`;
}

export interface StartContext {
  user: { userId: string; orgId: string };
  appId: string;
  appCode: string;
  modelId: string;
  modelCode: string;
  record: Record<string, any>;
}

type EnterCtx = {
  user: { userId: string; orgId: string };
  appCode: string;
  modelCode: string;
  record: Record<string, any>;
};

/**
 * Workflow state machine engine.
 *
 * Public read-path API:
 *  - start(workflowId, recordId, ctx): create instance, log submit, enter the start node, advance.
 *
 * Internal node dispatch (all run inside a single $transaction):
 *  - enterNodesInTx — dispatches by node type (start/approve/cc/condition/parallel-fork/parallel-join/end).
 *  - checkJoinInTx — fires when an incoming branch reaches a parallel-join.
 *  - completeInstance / failInstance — terminal states.
 *
 * Notifications are written via raw tx.sysNotification.create() so they land
 * inside the same transaction. The realtime channel is fed by the explicit
 * `workflow.inbox.new` / `workflow.state.changed` events we emit after the
 * row is created — that avoids emitting NotificationService's
 * `notification.created` from inside a not-yet-committed tx.
 */
@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventEmitter2) private eventBus: EventEmitter2,
    @Inject(AssigneeResolverService) private resolver: AssigneeResolverService,
    @Inject(WorkflowLockHelper) private lock: WorkflowLockHelper,
    @Inject(WorkflowConditionMatcher) private matcher: WorkflowConditionMatcher,
    @Optional()
    @InjectQueue('workflow-timeout')
    private timeoutQueue: Queue | null = null,
  ) {}

  /**
   * Schedule a bullmq delayed job to fire when an approve task's dueAt elapses.
   * No-op when the queue isn't wired (tests) or when no timeout is configured.
   */
  private async scheduleTimeoutJob(taskId: string, timeoutHours: number | undefined | null): Promise<void> {
    if (!this.timeoutQueue) return;
    if (!timeoutHours || timeoutHours <= 0) return;
    try {
      await this.timeoutQueue.add(
        'task-timeout',
        { taskId },
        {
          delay: timeoutHours * 3600 * 1000,
          jobId: timeoutJobId(taskId),
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    } catch (e) {
      this.logger.warn(`Failed to schedule timeout job for task ${taskId}: ${(e as Error).message}`);
    }
  }

  /**
   * Remove queued timeout jobs for tasks that are no longer pending. Best-effort:
   * the job may have already fired (which is fine — the processor double-checks
   * task status before acting).
   */
  private async removeTimeoutJobs(taskIds: string[]): Promise<void> {
    if (!this.timeoutQueue || taskIds.length === 0) return;
    await Promise.all(
      taskIds.map((id) =>
        this.timeoutQueue!.remove(timeoutJobId(id)).catch(() => {
          /* job already fired or absent */
        }),
      ),
    );
  }

  /**
   * Start a workflow instance for a record.
   *
   * Wraps creation + initial advance in a single $transaction so that the
   * instance row, the entry logs, and the first batch of tasks all commit
   * together (or roll back together if any node entry fails).
   */
  async start(workflowId: string, recordId: string, ctx: StartContext) {
    const wf = await this.prisma.sysWorkflow.findUnique({
      where: { id: workflowId },
      include: { currentVersion: true },
    });
    if (!wf) {
      throw new BusinessException(404, ErrorCodes.WORKFLOW_NOT_FOUND, 'Workflow not found');
    }
    if (!wf.currentVersion) {
      throw new BusinessException(
        400,
        ErrorCodes.WORKFLOW_VERSION_NOT_FOUND,
        'Workflow has no active version',
      );
    }

    const def = wf.currentVersion.definition as unknown as WorkflowDefinition;
    const startNode = def.nodes.find((n) => n.type === 'start');
    if (!startNode) {
      throw new BusinessException(
        400,
        ErrorCodes.WORKFLOW_INVALID_DEFINITION,
        'Workflow missing start node',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const instance = await tx.sysWorkflowInstance.create({
        data: {
          workflowId,
          versionId: wf.currentVersion!.id,
          modelId: ctx.modelId,
          appId: ctx.appId,
          recordId,
          orgId: ctx.user.orgId,
          status: 'running',
          activeNodeIds: [],
          startedBy: ctx.user.userId,
        },
      });

      await tx.sysWorkflowLog.create({
        data: {
          instanceId: instance.id,
          action: 'submit',
          operatorUserId: ctx.user.userId,
          nodeId: startNode.id,
        },
      });
      await tx.sysWorkflowLog.create({
        data: {
          instanceId: instance.id,
          action: 'node-enter',
          nodeId: startNode.id,
          operatorUserId: null,
        },
      });
      await tx.sysWorkflowLog.create({
        data: {
          instanceId: instance.id,
          action: 'node-exit',
          nodeId: startNode.id,
          operatorUserId: null,
        },
      });

      const outgoing = def.edges
        .filter((e) => e.from === startNode.id)
        .map((e) => e.to);

      await this.enterNodesInTx(tx, instance, def, outgoing, {
        user: ctx.user,
        appCode: ctx.appCode,
        modelCode: ctx.modelCode,
        record: ctx.record,
      });

      return instance;
    });
  }

  /**
   * Enter a set of nodes inside an active transaction.
   *
   * Each node writes its own `node-enter` log on arrival; pass-through nodes
   * (start/condition/fork) immediately write `node-exit` and recurse. Approve
   * and parallel-join nodes are "stop-and-wait" — they push themselves onto
   * `activeNodeIds` and return.
   *
   * `visited` guards against accidental cycles in malformed graphs.
   */
  private async enterNodesInTx(
    tx: any,
    instance: any,
    def: WorkflowDefinition,
    nodeIds: string[],
    ctx: EnterCtx,
    visited: Set<string> = new Set(),
  ): Promise<void> {
    for (const nodeId of nodeIds) {
      if (visited.has(nodeId)) {
        this.logger.warn(
          `Cycle detected entering node ${nodeId} in instance ${instance.id}; skipping`,
        );
        continue;
      }
      visited.add(nodeId);

      const node = def.nodes.find((n) => n.id === nodeId);
      if (!node) {
        throw new BusinessException(
          400,
          ErrorCodes.WORKFLOW_INVALID_DEFINITION,
          `Node not found: ${nodeId}`,
        );
      }

      await tx.sysWorkflowLog.create({
        data: { instanceId: instance.id, action: 'node-enter', nodeId: node.id, operatorUserId: null },
      });

      switch (node.type) {
        case 'start':
          // Defensive: start is normally consumed by start(), but accept pass-through.
          await this.writeExitLog(tx, instance.id, node.id);
          await this.enterNodesInTx(tx, instance, def, this.outgoing(def, node.id), ctx, visited);
          break;

        case 'end':
          await this.completeInstance(tx, instance, 'approved', ctx.record);
          return;

        case 'condition':
          await this.handleConditionNode(tx, instance, def, node, ctx, visited);
          break;

        case 'parallel-fork':
          await this.writeExitLog(tx, instance.id, node.id);
          await this.enterNodesInTx(tx, instance, def, this.outgoing(def, node.id), ctx, visited);
          break;

        case 'parallel-join':
          await this.handleJoinEntry(tx, instance, def, node, ctx);
          break;

        case 'cc':
          await this.handleCcNode(tx, instance, def, node, ctx, visited);
          break;

        case 'approve':
          await this.handleApproveNode(tx, instance, def, node, ctx, visited);
          break;

        default:
          throw new BusinessException(
            400,
            ErrorCodes.WORKFLOW_INVALID_DEFINITION,
            `Unknown node type: ${(node as any).type}`,
          );
      }
    }
  }

  private async handleConditionNode(
    tx: any,
    instance: any,
    def: WorkflowDefinition,
    node: WorkflowNode,
    ctx: EnterCtx,
    visited: Set<string>,
  ): Promise<void> {
    const cfg = node.config as ConditionNodeConfig;
    const branches = cfg.branches ?? [];

    let matched = branches.find((b) => this.matcher.match(b.condition, ctx.record));
    if (!matched) {
      matched = branches.find((b) => b.isDefault);
    }
    if (!matched) {
      await this.failInstance(tx, instance, ErrorCodes.WORKFLOW_CONDITION_NO_MATCH);
      return;
    }

    await this.writeExitLog(tx, instance.id, node.id);
    await this.enterNodesInTx(tx, instance, def, [matched.targetNodeId], ctx, visited);
  }

  private async handleJoinEntry(
    tx: any,
    instance: any,
    def: WorkflowDefinition,
    node: WorkflowNode,
    ctx: EnterCtx,
  ): Promise<void> {
    const refreshed = await tx.sysWorkflowInstance.findUnique({ where: { id: instance.id } });
    const newActive = Array.from(new Set([...(refreshed?.activeNodeIds ?? []), node.id]));
    await tx.sysWorkflowInstance.update({
      where: { id: instance.id },
      data: { activeNodeIds: newActive },
    });
    await this.checkJoinInTx(tx, instance, node.id, def, ctx);
  }

  private async handleCcNode(
    tx: any,
    instance: any,
    def: WorkflowDefinition,
    node: WorkflowNode,
    ctx: EnterCtx,
    visited: Set<string>,
  ): Promise<void> {
    const cfg = node.config as CcNodeConfig;
    const { assignees } = await this.resolver.resolveWithFallback({
      strategy: cfg.assigneeStrategy,
      config: cfg.assigneeConfig,
      ctx: {
        record: ctx.record,
        submitter: ctx.user,
        instance: { id: instance.id },
      },
      // cc never blocks the flow: empty assignees just means "no one was notified".
      onEmpty: 'pass',
      autoSkipDuplicates: false,
      autoSkipSubmitter: false,
    });

    let recipients = assignees;
    if (cfg.dedupAcrossInstance && recipients.length > 0) {
      const existing = await tx.sysWorkflowTask.findMany({
        where: {
          instanceId: instance.id,
          nodeType: 'cc',
          assigneeUserId: { in: recipients },
        },
        select: { assigneeUserId: true },
      });
      const seen = new Set(existing.map((t: any) => t.assigneeUserId));
      recipients = recipients.filter((u) => !seen.has(u));
    }

    for (const userId of recipients) {
      await tx.sysWorkflowTask.create({
        data: {
          instanceId: instance.id,
          nodeId: node.id,
          nodeName: node.name,
          nodeType: 'cc',
          mode: 'cc',
          assigneeUserId: userId,
          status: 'pending',
        },
      });
      await tx.sysNotification.create({
        data: {
          userId,
          orgId: instance.orgId,
          type: 'workflow_cc',
          title: `抄送: ${node.name}`,
          relatedType: 'workflow_instance',
          relatedId: instance.id,
          navigateTo: `/workspace/${ctx.appCode}/${ctx.modelCode}/${instance.recordId}`,
        },
      });
    }

    await this.writeExitLog(tx, instance.id, node.id);
    await this.enterNodesInTx(tx, instance, def, this.outgoing(def, node.id), ctx, visited);
  }

  private async handleApproveNode(
    tx: any,
    instance: any,
    def: WorkflowDefinition,
    node: WorkflowNode,
    ctx: EnterCtx,
    visited: Set<string>,
  ): Promise<void> {
    const cfg = node.config as ApproveNodeConfig;
    const { assignees, shouldSkip } = await this.resolver.resolveWithFallback({
      strategy: cfg.assigneeStrategy,
      config: cfg.assigneeConfig,
      ctx: {
        record: ctx.record,
        submitter: ctx.user,
        instance: { id: instance.id },
      },
      onEmpty: cfg.onEmpty,
      fallbackUserIds: cfg.fallbackUserIds,
      autoSkipDuplicates: cfg.autoSkipDuplicates,
      autoSkipSubmitter: cfg.autoSkipSubmitter,
    });

    if (shouldSkip) {
      await tx.sysWorkflowLog.create({
        data: { instanceId: instance.id, action: 'node-skip', nodeId: node.id, operatorUserId: null },
      });
      await this.writeExitLog(tx, instance.id, node.id);
      await this.enterNodesInTx(tx, instance, def, this.outgoing(def, node.id), ctx, visited);
      return;
    }

    const dueAt = cfg.timeoutHours
      ? new Date(Date.now() + cfg.timeoutHours * 3600 * 1000)
      : null;

    // sequential: only first assignee gets a task; remaining are queued via Phase F-2 decide().
    // and / or: every assignee gets a task; Phase F-2's decide() resolves the aggregate outcome.
    const initialAssignees =
      cfg.mode === 'sequential' ? assignees.slice(0, 1) : assignees;

    let sortOrder = 0;
    for (const userId of initialAssignees) {
      const task = await tx.sysWorkflowTask.create({
        data: {
          instanceId: instance.id,
          nodeId: node.id,
          nodeName: node.name,
          nodeType: 'approve',
          mode: cfg.mode,
          assigneeUserId: userId,
          status: 'pending',
          sortOrder: sortOrder++,
          dueAt,
        },
      });

      await tx.sysNotification.create({
        data: {
          userId,
          orgId: instance.orgId,
          type: 'workflow_task',
          title: `审批: ${node.name}`,
          relatedType: 'workflow_task',
          relatedId: task.id,
          navigateTo: `/workspace/${ctx.appCode}/${ctx.modelCode}/${instance.recordId}`,
        },
      });

      await this.scheduleTimeoutJob(task.id, cfg.timeoutHours);

      this.eventBus.emit('workflow.inbox.new', {
        userId,
        taskId: task.id,
        instanceId: instance.id,
        nodeName: node.name,
      });
    }

    // Push approve node onto activeNodeIds (stop-and-wait).
    const refreshed = await tx.sysWorkflowInstance.findUnique({ where: { id: instance.id } });
    const newActive = Array.from(new Set([...(refreshed?.activeNodeIds ?? []), node.id]));
    await tx.sysWorkflowInstance.update({
      where: { id: instance.id },
      data: { activeNodeIds: newActive },
    });
  }

  /**
   * Called when an incoming branch reaches a parallel-join.
   *
   * AND mode: only advance once every incoming branch has logged a node-exit.
   * OR mode: advance on first arrival, then cancel pending tasks of the
   * still-unfinished incoming branches.
   */
  private async checkJoinInTx(
    tx: any,
    instance: any,
    joinNodeId: string,
    def: WorkflowDefinition,
    ctx: EnterCtx,
  ): Promise<void> {
    const joinNode = def.nodes.find((n) => n.id === joinNodeId);
    if (!joinNode) return;
    const cfg = joinNode.config as ParallelJoinConfig;
    const incomingNodeIds = def.edges
      .filter((e) => e.to === joinNodeId)
      .map((e) => e.from);

    const exits = await tx.sysWorkflowLog.findMany({
      where: {
        instanceId: instance.id,
        action: 'node-exit',
        nodeId: { in: incomingNodeIds },
      },
    });
    const exitedSet = new Set(exits.map((e: any) => e.nodeId));
    const allDone = incomingNodeIds.every((n) => exitedSet.has(n));
    const anyDone = incomingNodeIds.some((n) => exitedSet.has(n));

    const shouldAdvance = cfg.joinMode === 'and' ? allDone : anyDone;
    if (!shouldAdvance) return;

    const refreshed = await tx.sysWorkflowInstance.findUnique({ where: { id: instance.id } });
    const newActive = (refreshed?.activeNodeIds ?? []).filter((n: string) => n !== joinNodeId);
    await tx.sysWorkflowInstance.update({
      where: { id: instance.id },
      data: { activeNodeIds: newActive },
    });

    if (cfg.joinMode === 'or') {
      const unfinished = incomingNodeIds.filter((n) => !exitedSet.has(n));
      if (unfinished.length > 0) {
        await tx.sysWorkflowTask.updateMany({
          where: {
            instanceId: instance.id,
            nodeId: { in: unfinished },
            status: 'pending',
          },
          data: { status: 'cancelled' },
        });
      }
    }

    await this.writeExitLog(tx, instance.id, joinNodeId);
    await this.enterNodesInTx(tx, instance, def, this.outgoing(def, joinNodeId), ctx);
  }

  private async completeInstance(
    tx: any,
    instance: any,
    finalStatus: 'approved' | 'rejected',
    record: Record<string, any>,
  ): Promise<void> {
    await tx.sysWorkflowInstance.update({
      where: { id: instance.id },
      data: {
        status: finalStatus,
        endedAt: new Date(),
        finalSnapshot: record ? this.snapshotRecord(record) : null,
        activeNodeIds: [],
      },
    });
    await tx.sysWorkflowLog.create({
      data: {
        instanceId: instance.id,
        action: finalStatus === 'approved' ? 'node-exit' : 'cancel',
        nodeId: null,
        operatorUserId: null,
      },
    });
    await tx.sysNotification.create({
      data: {
        userId: instance.startedBy,
        orgId: instance.orgId,
        type: 'workflow_state',
        title: finalStatus === 'approved' ? '审批已通过' : '审批已驳回',
        relatedType: 'workflow_instance',
        relatedId: instance.id,
      },
    });

    this.eventBus.emit('workflow.completed', { instance, finalStatus });
    this.eventBus.emit('workflow.state.changed', {
      userId: instance.startedBy,
      instanceId: instance.id,
      newStatus: finalStatus,
    });
  }

  private async failInstance(tx: any, instance: any, errorCode: string): Promise<void> {
    await tx.sysWorkflowInstance.update({
      where: { id: instance.id },
      data: { status: 'cancelled', endedAt: new Date(), activeNodeIds: [] },
    });
    await tx.sysWorkflowLog.create({
      data: {
        instanceId: instance.id,
        action: 'cancel',
        operatorUserId: null,
        data: { errorCode },
      },
    });
    this.eventBus.emit('workflow.completed', { instance, finalStatus: 'cancelled' });
  }

  private snapshotRecord(record: Record<string, any>): Record<string, any> {
    // Phase F-2 may add per-node visibleFields filtering; for now store as-is.
    return record;
  }

  private outgoing(def: WorkflowDefinition, nodeId: string): string[] {
    return def.edges.filter((e) => e.from === nodeId).map((e) => e.to);
  }

  private async writeExitLog(tx: any, instanceId: string, nodeId: string): Promise<void> {
    await tx.sysWorkflowLog.create({
      data: { instanceId, action: 'node-exit', nodeId, operatorUserId: null },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Write path (Phase F-2)
  //
  //  All public mutators below run inside `lock.withLock(instanceId, …)` to
  //  serialize state transitions per instance, then a Prisma `$transaction`
  //  so that task/log/instance writes commit atomically. Authorization checks
  //  (task ownership, instance running, action allowedActions) happen first,
  //  outside the lock, to fail fast without blocking other operations.
  //
  //  Notifications go through `tx.sysNotification.create` so they're part of
  //  the same txn. The realtime channel is fed by the explicit
  //  `workflow.inbox.new` / `workflow.inbox.done` / `workflow.state.changed`
  //  events emitted after the txn callback returns.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Approve or reject a pending task.
   *
   * approve  → mark task approved, then try to advance the node:
   *   - mode=and: advances only when every sibling task is approved/skipped/cancelled.
   *   - mode=or:  advances on first approval, cancels remaining pending siblings.
   *   - mode=sequential: creates the next assignee's task, or advances if last.
   *
   * reject   → cancel all pending tasks on the instance and complete it as 'rejected'.
   *            (Per spec §3.2 a single reject fails the whole instance, regardless of mode.)
   */
  async decide(
    taskId: string,
    decision: 'approve' | 'reject',
    user: { userId: string; orgId: string },
    comment?: string,
  ): Promise<void> {
    const task = await this.prisma.sysWorkflowTask.findUnique({
      where: { id: taskId },
      include: { instance: { include: { workflowVersion: true } } },
    });
    if (!task) {
      throw new BusinessException(404, ErrorCodes.WORKFLOW_TASK_NOT_FOUND, 'Task not found');
    }
    if (task.status !== 'pending') {
      throw new BusinessException(
        409,
        ErrorCodes.WORKFLOW_TASK_NOT_PENDING,
        'Task already processed',
      );
    }
    if (task.assigneeUserId !== user.userId) {
      throw new BusinessException(
        403,
        ErrorCodes.WORKFLOW_TASK_NOT_ASSIGNEE,
        'Not your task',
      );
    }
    if (task.instance.status !== 'running') {
      throw new BusinessException(
        409,
        ErrorCodes.WORKFLOW_INSTANCE_NOT_RUNNING,
        'Instance not running',
      );
    }

    const def = task.instance.workflowVersion.definition as unknown as WorkflowDefinition;
    const node = def.nodes.find((n) => n.id === task.nodeId);
    const cfg = node?.config as ApproveNodeConfig | undefined;
    if (decision === 'approve' && cfg?.allowedActions?.approve === false) {
      throw new BusinessException(
        403,
        ErrorCodes.WORKFLOW_ACTION_NOT_ALLOWED,
        'Approve not allowed on this node',
      );
    }
    if (decision === 'reject' && cfg?.allowedActions?.reject === false) {
      throw new BusinessException(
        403,
        ErrorCodes.WORKFLOW_ACTION_NOT_ALLOWED,
        'Reject not allowed on this node',
      );
    }

    let timeoutsToRemove: string[] = [];
    await this.lock.withLock(task.instanceId, async () => {
      await this.prisma.$transaction(async (tx) => {
        // Double-check under lock: another worker might have decided already.
        const fresh = await tx.sysWorkflowTask.findUnique({ where: { id: taskId } });
        if (!fresh || fresh.status !== 'pending') {
          throw new BusinessException(
            409,
            ErrorCodes.WORKFLOW_TASK_NOT_PENDING,
            'Task already processed',
          );
        }

        const snapshot = this.snapshotRecord({});

        await tx.sysWorkflowTask.update({
          where: { id: taskId },
          data: {
            status: decision === 'approve' ? 'approved' : 'rejected',
            decisionAt: new Date(),
            comment: comment ?? null,
            snapshot,
          },
        });
        await tx.sysWorkflowLog.create({
          data: {
            instanceId: task.instanceId,
            taskId,
            action: decision,
            nodeId: task.nodeId,
            operatorUserId: user.userId,
            comment: comment ?? null,
          },
        });

        this.eventBus.emit('workflow.inbox.done', { userId: user.userId, taskId });

        if (decision === 'reject') {
          // Collect remaining pending taskIds *before* cancelling so we can
          // pull their bullmq jobs after the txn body returns.
          const pendingBefore = await tx.sysWorkflowTask.findMany({
            where: { instanceId: task.instanceId, status: 'pending' },
            select: { id: true },
          });
          await this.cancelPendingTasks(tx, task.instanceId);
          await this.completeInstance(tx, task.instance, 'rejected', null as any);
          timeoutsToRemove = [taskId, ...pendingBefore.map((t: any) => t.id)];
          return;
        }

        timeoutsToRemove = [taskId];
        await this.tryAdvanceInTx(tx, task.instance, task.nodeId, def, user);
      });
    });
    // Pull queued timeout jobs *after* the txn commits — bullmq lives on Redis,
    // so doing this inside the txn would leak deletes on rollback.
    await this.removeTimeoutJobs(timeoutsToRemove);
  }

  /**
   * After an approval, decide whether the node is complete based on aggregate
   * sibling-task state, and either spawn the next assignee (sequential),
   * cancel-and-advance (or), wait (and), or exit + recurse to outgoing edges.
   *
   * Also handles the "add-before" re-creation: if the just-approved task was
   * an addBefore (has parentTaskId), spawn a fresh task for the parent's
   * original assignee at the parent's sortOrder. This lets the original
   * approver still make their decision after the inserted signer agrees.
   */
  private async tryAdvanceInTx(
    tx: any,
    instance: any,
    nodeId: string,
    def: WorkflowDefinition,
    user: { userId: string; orgId: string },
  ): Promise<void> {
    const node = def.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== 'approve') return;

    const cfg = node.config as ApproveNodeConfig;
    const tasks: any[] = await tx.sysWorkflowTask.findMany({
      where: { instanceId: instance.id, nodeId },
      orderBy: { sortOrder: 'asc' },
    });

    // Add-before re-creation: if the most recently approved task was an
    // addBefore insert, materialise a fresh task for the parent's original
    // assignee at the parent's sortOrder. The parent task itself was
    // cancelled at add-before time.
    const lastApproved = [...tasks]
      .filter((t) => t.status === 'approved')
      .sort(
        (a, b) => new Date(b.decisionAt ?? 0).getTime() - new Date(a.decisionAt ?? 0).getTime(),
      )[0];
    if (lastApproved?.addedPosition === 'before' && lastApproved.parentTaskId) {
      const parent = await tx.sysWorkflowTask.findUnique({
        where: { id: lastApproved.parentTaskId },
      });
      // Only re-create if the parent is still in a cancelled (replaced) state and
      // we haven't already revived it (idempotency: check for any pending task
      // for the parent's assignee at the parent's sortOrder).
      if (parent && parent.status === 'cancelled') {
        const existingRevival = tasks.find(
          (t) =>
            t.assigneeUserId === parent.assigneeUserId &&
            t.sortOrder === parent.sortOrder &&
            t.id !== parent.id &&
            t.status === 'pending',
        );
        if (!existingRevival) {
          const revived = await tx.sysWorkflowTask.create({
            data: {
              instanceId: instance.id,
              nodeId,
              nodeName: node.name,
              nodeType: 'approve',
              mode: parent.mode,
              assigneeUserId: parent.assigneeUserId,
              status: 'pending',
              sortOrder: parent.sortOrder,
              dueAt: parent.dueAt,
            },
          });
          await tx.sysNotification.create({
            data: {
              userId: parent.assigneeUserId,
              orgId: instance.orgId,
              type: 'workflow_task',
              title: `审批: ${node.name}`,
              relatedType: 'workflow_task',
              relatedId: revived.id,
            },
          });
          // Revived task carries the parent's original timeout; schedule a fresh
          // job so it still escalates if the original assignee doesn't decide.
          await this.scheduleTimeoutJob(revived.id, cfg.timeoutHours);
          this.eventBus.emit('workflow.inbox.new', {
            userId: parent.assigneeUserId,
            taskId: revived.id,
            instanceId: instance.id,
            nodeName: node.name,
          });
          // Don't fall through — node is now waiting for the revived task.
          return;
        }
      }
    }

    let nodeDone = false;
    let nodeRejected = false;

    if (cfg.mode === 'and') {
      nodeDone = tasks.every(
        (t) => t.status === 'approved' || t.status === 'skipped' || t.status === 'cancelled',
      );
      nodeRejected = tasks.some((t) => t.status === 'rejected');
    } else if (cfg.mode === 'or') {
      nodeDone = tasks.some((t) => t.status === 'approved');
      nodeRejected = tasks.every(
        (t) => t.status === 'rejected' || t.status === 'cancelled',
      );
    } else if (cfg.mode === 'sequential') {
      const decided = tasks.filter((t) => t.status !== 'pending');
      const latest = decided[decided.length - 1];
      if (!latest) return;

      if (latest.status === 'rejected') {
        nodeRejected = true;
      } else if (latest.status === 'approved') {
        // Resolve full assignee list and find the next un-decided assignee.
        const resolved = await this.resolver.resolveWithFallback({
          strategy: cfg.assigneeStrategy,
          config: cfg.assigneeConfig,
          ctx: {
            record: {},
            submitter: { userId: instance.startedBy, orgId: instance.orgId },
            instance: { id: instance.id },
          },
          onEmpty: cfg.onEmpty,
          fallbackUserIds: cfg.fallbackUserIds,
          autoSkipDuplicates: cfg.autoSkipDuplicates,
          autoSkipSubmitter: cfg.autoSkipSubmitter,
        });
        const allAssignees = resolved.assignees;
        const decidedAssigneeIds = decided.map((t) => t.assigneeUserId);
        const next = allAssignees.find((u) => !decidedAssigneeIds.includes(u));
        if (next) {
          const nextSortOrder = (tasks[tasks.length - 1]?.sortOrder ?? 0) + 1;
          const newTask = await tx.sysWorkflowTask.create({
            data: {
              instanceId: instance.id,
              nodeId,
              nodeName: node.name,
              nodeType: 'approve',
              mode: 'sequential',
              assigneeUserId: next,
              status: 'pending',
              sortOrder: nextSortOrder,
              dueAt: cfg.timeoutHours
                ? new Date(Date.now() + cfg.timeoutHours * 3600 * 1000)
                : null,
            },
          });
          await tx.sysNotification.create({
            data: {
              userId: next,
              orgId: instance.orgId,
              type: 'workflow_task',
              title: `审批: ${node.name}`,
              relatedType: 'workflow_task',
              relatedId: newTask.id,
            },
          });
          await this.scheduleTimeoutJob(newTask.id, cfg.timeoutHours);
          this.eventBus.emit('workflow.inbox.new', {
            userId: next,
            taskId: newTask.id,
            instanceId: instance.id,
            nodeName: node.name,
          });
          return;
        }
        nodeDone = true;
      }
    }

    if (nodeRejected) {
      await this.cancelPendingTasks(tx, instance.id);
      await this.completeInstance(tx, instance, 'rejected', null as any);
      return;
    }

    if (nodeDone) {
      if (cfg.mode === 'or') {
        await tx.sysWorkflowTask.updateMany({
          where: { instanceId: instance.id, nodeId, status: 'pending' },
          data: { status: 'cancelled' },
        });
      }

      await tx.sysWorkflowLog.create({
        data: {
          instanceId: instance.id,
          action: 'node-exit',
          nodeId,
          operatorUserId: null,
        },
      });
      const refreshed = await tx.sysWorkflowInstance.findUnique({
        where: { id: instance.id },
      });
      const newActive = (refreshed?.activeNodeIds ?? []).filter((n: string) => n !== nodeId);
      await tx.sysWorkflowInstance.update({
        where: { id: instance.id },
        data: { activeNodeIds: newActive },
      });

      const outgoing = def.edges.filter((e) => e.from === nodeId).map((e) => e.to);
      // Engine doesn't have appCode/modelCode in context here; controllers in
      // Phase G can plumb them through if richer notifications are needed.
      await this.enterNodesInTx(tx, instance, def, outgoing, {
        user,
        appCode: '',
        modelCode: '',
        record: {},
      });
    }
  }

  /**
   * Reassign a pending task to another user. The original task is marked
   * `transferred` (audit-visible); a new pending task with the same sortOrder
   * and dueAt is created for the new assignee, carrying `transferredFromUserId`.
   */
  async transfer(
    taskId: string,
    newUserId: string,
    user: { userId: string; orgId: string },
    comment?: string,
  ): Promise<void> {
    if (newUserId === user.userId) {
      throw new BusinessException(
        400,
        ErrorCodes.WORKFLOW_ADD_SIGNER_SELF,
        'Cannot transfer to self',
      );
    }
    const task = await this.prisma.sysWorkflowTask.findUnique({
      where: { id: taskId },
      include: { instance: { include: { workflowVersion: true } } },
    });
    if (!task) {
      throw new BusinessException(404, ErrorCodes.WORKFLOW_TASK_NOT_FOUND, 'Task not found');
    }
    if (task.status !== 'pending') {
      throw new BusinessException(
        409,
        ErrorCodes.WORKFLOW_TASK_NOT_PENDING,
        'Task already processed',
      );
    }
    if (task.assigneeUserId !== user.userId) {
      throw new BusinessException(
        403,
        ErrorCodes.WORKFLOW_TASK_NOT_ASSIGNEE,
        'Not your task',
      );
    }
    if (task.instance.status !== 'running') {
      throw new BusinessException(
        409,
        ErrorCodes.WORKFLOW_INSTANCE_NOT_RUNNING,
        'Instance not running',
      );
    }
    const def = task.instance.workflowVersion.definition as unknown as WorkflowDefinition;
    const node = def.nodes.find((n) => n.id === task.nodeId);
    const cfg = node?.config as ApproveNodeConfig | undefined;
    if (cfg?.allowedActions?.transfer === false) {
      throw new BusinessException(
        403,
        ErrorCodes.WORKFLOW_ACTION_NOT_ALLOWED,
        'Transfer not allowed on this node',
      );
    }

    let newTaskId: string | null = null;
    await this.lock.withLock(task.instanceId, async () => {
      await this.prisma.$transaction(async (tx) => {
        await tx.sysWorkflowTask.update({
          where: { id: taskId },
          data: {
            status: 'transferred',
            decisionAt: new Date(),
            comment: comment ?? null,
          },
        });
        const newTask = await tx.sysWorkflowTask.create({
          data: {
            instanceId: task.instanceId,
            nodeId: task.nodeId,
            nodeName: task.nodeName,
            nodeType: 'approve',
            mode: task.mode,
            assigneeUserId: newUserId,
            status: 'pending',
            sortOrder: task.sortOrder,
            transferredFromUserId: user.userId,
            dueAt: task.dueAt,
          },
        });
        newTaskId = newTask.id;
        await tx.sysWorkflowLog.create({
          data: {
            instanceId: task.instanceId,
            taskId: newTask.id,
            action: 'transfer',
            nodeId: task.nodeId,
            operatorUserId: user.userId,
            targetUserId: newUserId,
            comment: comment ?? null,
          },
        });
        await tx.sysNotification.create({
          data: {
            userId: newUserId,
            orgId: task.instance.orgId,
            type: 'workflow_task',
            title: `转交审批: ${task.nodeName}`,
            relatedType: 'workflow_task',
            relatedId: newTask.id,
          },
        });
        this.eventBus.emit('workflow.inbox.new', {
          userId: newUserId,
          taskId: newTask.id,
          instanceId: task.instanceId,
          nodeName: task.nodeName,
        });
        this.eventBus.emit('workflow.inbox.done', { userId: user.userId, taskId });
      });
    });
    // Old task's job goes away; new task inherits the same dueAt so we
    // re-derive a timeoutHours delta for the bullmq schedule.
    await this.removeTimeoutJobs([taskId]);
    if (newTaskId && task.dueAt) {
      const ms = new Date(task.dueAt).getTime() - Date.now();
      if (ms > 0 && this.timeoutQueue) {
        await this.timeoutQueue
          .add(
            'task-timeout',
            { taskId: newTaskId },
            {
              delay: ms,
              jobId: timeoutJobId(newTaskId),
              removeOnComplete: true,
              removeOnFail: false,
            },
          )
          .catch((e: any) =>
            this.logger.warn(`Failed to schedule timeout for transferred task ${newTaskId}: ${e.message}`),
          );
      }
    }
  }

  /**
   * Add a co-signer either before or after the current assignee.
   *
   * - before: cancel self task (will be revived by tryAdvanceInTx once the
   *   added signer approves) + create a new task at sortOrder-1 with
   *   parentTaskId pointing to self.
   * - after:  self task stays pending, new task at sortOrder+1.
   */
  async addSigner(
    taskId: string,
    position: 'before' | 'after',
    newUserId: string,
    user: { userId: string; orgId: string },
    comment?: string,
  ): Promise<void> {
    if (newUserId === user.userId) {
      throw new BusinessException(
        400,
        ErrorCodes.WORKFLOW_ADD_SIGNER_SELF,
        'Cannot add yourself',
      );
    }
    const task = await this.prisma.sysWorkflowTask.findUnique({
      where: { id: taskId },
      include: { instance: { include: { workflowVersion: true } } },
    });
    if (!task) {
      throw new BusinessException(404, ErrorCodes.WORKFLOW_TASK_NOT_FOUND, 'Task not found');
    }
    if (task.status !== 'pending') {
      throw new BusinessException(
        409,
        ErrorCodes.WORKFLOW_TASK_NOT_PENDING,
        'Task already processed',
      );
    }
    if (task.assigneeUserId !== user.userId) {
      throw new BusinessException(
        403,
        ErrorCodes.WORKFLOW_TASK_NOT_ASSIGNEE,
        'Not your task',
      );
    }
    if (task.instance.status !== 'running') {
      throw new BusinessException(
        409,
        ErrorCodes.WORKFLOW_INSTANCE_NOT_RUNNING,
        'Instance not running',
      );
    }
    const def = task.instance.workflowVersion.definition as unknown as WorkflowDefinition;
    const node = def.nodes.find((n) => n.id === task.nodeId);
    const cfg = node?.config as ApproveNodeConfig | undefined;
    const allowKey = position === 'before' ? 'addBefore' : 'addAfter';
    if (cfg?.allowedActions?.[allowKey] === false) {
      throw new BusinessException(
        403,
        ErrorCodes.WORKFLOW_ACTION_NOT_ALLOWED,
        `Add signer (${position}) not allowed`,
      );
    }

    let newTaskId: string | null = null;
    await this.lock.withLock(task.instanceId, async () => {
      await this.prisma.$transaction(async (tx) => {
        if (position === 'before') {
          await tx.sysWorkflowTask.update({
            where: { id: taskId },
            data: {
              status: 'cancelled',
              decisionAt: new Date(),
              comment: 'replaced by add-before',
            },
          });
        }
        const newTask = await tx.sysWorkflowTask.create({
          data: {
            instanceId: task.instanceId,
            nodeId: task.nodeId,
            nodeName: task.nodeName,
            nodeType: 'approve',
            mode: task.mode,
            assigneeUserId: newUserId,
            status: 'pending',
            sortOrder: position === 'before' ? task.sortOrder - 1 : task.sortOrder + 1,
            parentTaskId: taskId,
            addedByUserId: user.userId,
            addedPosition: position,
            dueAt: task.dueAt,
          },
        });
        newTaskId = newTask.id;
        await tx.sysWorkflowLog.create({
          data: {
            instanceId: task.instanceId,
            taskId: newTask.id,
            action: position === 'before' ? 'add-before' : 'add-after',
            nodeId: task.nodeId,
            operatorUserId: user.userId,
            targetUserId: newUserId,
            comment: comment ?? null,
          },
        });
        await tx.sysNotification.create({
          data: {
            userId: newUserId,
            orgId: task.instance.orgId,
            type: 'workflow_task',
            title: `加签审批: ${task.nodeName}`,
            relatedType: 'workflow_task',
            relatedId: newTask.id,
          },
        });
        this.eventBus.emit('workflow.inbox.new', {
          userId: newUserId,
          taskId: newTask.id,
          instanceId: task.instanceId,
          nodeName: task.nodeName,
        });
        if (position === 'before') {
          this.eventBus.emit('workflow.inbox.done', { userId: user.userId, taskId });
        }
      });
    });
    if (position === 'before') {
      // The original assignee's task is cancelled; remove its queued timeout.
      // (The revived task created later in tryAdvanceInTx will get its own.)
      await this.removeTimeoutJobs([taskId]);
    }
    if (newTaskId && task.dueAt) {
      const ms = new Date(task.dueAt).getTime() - Date.now();
      if (ms > 0 && this.timeoutQueue) {
        await this.timeoutQueue
          .add(
            'task-timeout',
            { taskId: newTaskId },
            {
              delay: ms,
              jobId: timeoutJobId(newTaskId),
              removeOnComplete: true,
              removeOnFail: false,
            },
          )
          .catch((e: any) =>
            this.logger.warn(`Failed to schedule timeout for added-signer task ${newTaskId}: ${e.message}`),
          );
      }
    }
  }

  /**
   * Return a task to either the previous node ('prev') or the submitter ('start').
   *
   *  - prev:  cancel current node's pending tasks, pop it from activeNodeIds,
   *           write `return-prev` log, and re-enter the most recently exited
   *           prior node (lookup by the latest node-exit log whose nodeId differs).
   *  - start: cancel all pending tasks, mark instance status='returned', notify
   *           the submitter, emit completed + state.changed.
   */
  async returnTask(
    taskId: string,
    mode: 'prev' | 'start',
    user: { userId: string; orgId: string },
    comment: string,
  ): Promise<void> {
    const task = await this.prisma.sysWorkflowTask.findUnique({
      where: { id: taskId },
      include: { instance: { include: { workflowVersion: true } } },
    });
    if (!task) {
      throw new BusinessException(404, ErrorCodes.WORKFLOW_TASK_NOT_FOUND, 'Task not found');
    }
    if (task.status !== 'pending') {
      throw new BusinessException(
        409,
        ErrorCodes.WORKFLOW_TASK_NOT_PENDING,
        'Task already processed',
      );
    }
    if (task.assigneeUserId !== user.userId) {
      throw new BusinessException(
        403,
        ErrorCodes.WORKFLOW_TASK_NOT_ASSIGNEE,
        'Not your task',
      );
    }
    if (task.instance.status !== 'running') {
      throw new BusinessException(
        409,
        ErrorCodes.WORKFLOW_INSTANCE_NOT_RUNNING,
        'Instance not running',
      );
    }
    const def = task.instance.workflowVersion.definition as unknown as WorkflowDefinition;
    const node = def.nodes.find((n) => n.id === task.nodeId);
    const cfg = node?.config as ApproveNodeConfig | undefined;
    const allowKey = mode === 'prev' ? 'returnPrev' : 'returnStart';
    if (cfg?.allowedActions?.[allowKey] === false) {
      throw new BusinessException(
        403,
        ErrorCodes.WORKFLOW_ACTION_NOT_ALLOWED,
        `Return (${mode}) not allowed on this node`,
      );
    }

    let pendingIdsForCleanup: string[] = [];
    await this.lock.withLock(task.instanceId, async () => {
      await this.prisma.$transaction(async (tx) => {
        if (mode === 'start') {
          const pendingBefore = await tx.sysWorkflowTask.findMany({
            where: { instanceId: task.instanceId, status: 'pending' },
            select: { id: true },
          });
          pendingIdsForCleanup = pendingBefore.map((t: any) => t.id);
          await this.cancelPendingTasks(tx, task.instanceId);
          await tx.sysWorkflowInstance.update({
            where: { id: task.instanceId },
            data: { status: 'returned', endedAt: new Date(), activeNodeIds: [] },
          });
          await tx.sysWorkflowLog.create({
            data: {
              instanceId: task.instanceId,
              taskId,
              action: 'return-start',
              nodeId: task.nodeId,
              operatorUserId: user.userId,
              comment,
            },
          });
          await tx.sysNotification.create({
            data: {
              userId: task.instance.startedBy,
              orgId: task.instance.orgId,
              type: 'workflow_state',
              title: `审批退回: ${task.nodeName}`,
              body: comment,
              relatedType: 'workflow_instance',
              relatedId: task.instanceId,
            },
          });
          this.eventBus.emit('workflow.completed', {
            instance: task.instance,
            finalStatus: 'returned',
          });
          this.eventBus.emit('workflow.state.changed', {
            userId: task.instance.startedBy,
            instanceId: task.instanceId,
            newStatus: 'returned',
          });
          this.eventBus.emit('workflow.inbox.done', { userId: user.userId, taskId });
          return;
        }

        // mode === 'prev'
        const pendingNodeTasks = await tx.sysWorkflowTask.findMany({
          where: {
            instanceId: task.instanceId,
            nodeId: task.nodeId,
            status: 'pending',
          },
          select: { id: true },
        });
        pendingIdsForCleanup = pendingNodeTasks.map((t: any) => t.id);

        const prevExit = await tx.sysWorkflowLog.findFirst({
          where: {
            instanceId: task.instanceId,
            action: 'node-exit',
            nodeId: { not: null },
            NOT: { nodeId: task.nodeId },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!prevExit?.nodeId) {
          throw new BusinessException(
            400,
            ErrorCodes.WORKFLOW_RETURN_NO_PREVIOUS,
            'No previous node to return to',
          );
        }
        await tx.sysWorkflowTask.updateMany({
          where: { instanceId: task.instanceId, nodeId: task.nodeId, status: 'pending' },
          data: { status: 'cancelled' },
        });
        const refreshed = await tx.sysWorkflowInstance.findUnique({
          where: { id: task.instanceId },
        });
        const newActive = (refreshed?.activeNodeIds ?? []).filter(
          (n: string) => n !== task.nodeId,
        );
        await tx.sysWorkflowInstance.update({
          where: { id: task.instanceId },
          data: { activeNodeIds: newActive },
        });
        await tx.sysWorkflowLog.create({
          data: {
            instanceId: task.instanceId,
            taskId,
            action: 'return-prev',
            nodeId: task.nodeId,
            operatorUserId: user.userId,
            comment,
          },
        });
        this.eventBus.emit('workflow.inbox.done', { userId: user.userId, taskId });

        await this.enterNodesInTx(tx, task.instance, def, [prevExit.nodeId], {
          user: { userId: task.instance.startedBy, orgId: task.instance.orgId },
          appCode: '',
          modelCode: '',
          record: {},
        });
      });
    });
    await this.removeTimeoutJobs(pendingIdsForCleanup);
  }

  /**
   * Submitter-initiated withdrawal of a running instance.
   *
   * Forbidden once any task has been approved — at that point the original
   * intent has been partially validated and the operation must go through
   * `cancel()` (admin / system) or the unapprove flow in Phase G.
   */
  async withdraw(instanceId: string, user: { userId: string; orgId: string }): Promise<void> {
    const instance = await this.prisma.sysWorkflowInstance.findUnique({
      where: { id: instanceId },
    });
    if (!instance) {
      throw new BusinessException(
        404,
        ErrorCodes.WORKFLOW_INSTANCE_NOT_FOUND,
        'Instance not found',
      );
    }
    if (instance.status !== 'running') {
      throw new BusinessException(
        409,
        ErrorCodes.WORKFLOW_INSTANCE_NOT_RUNNING,
        'Instance not running',
      );
    }
    if (instance.startedBy !== user.userId) {
      throw new BusinessException(
        403,
        ErrorCodes.WORKFLOW_TASK_NOT_ASSIGNEE,
        'Only submitter can withdraw',
      );
    }
    const approvedCount = await this.prisma.sysWorkflowTask.count({
      where: { instanceId, status: 'approved' },
    });
    if (approvedCount > 0) {
      throw new BusinessException(
        409,
        ErrorCodes.WORKFLOW_WITHDRAW_HAS_APPROVAL,
        'Cannot withdraw — some tasks already approved',
      );
    }

    let pendingIds: string[] = [];
    await this.lock.withLock(instanceId, async () => {
      await this.prisma.$transaction(async (tx) => {
        const pendingBefore = await tx.sysWorkflowTask.findMany({
          where: { instanceId, status: 'pending' },
          select: { id: true },
        });
        pendingIds = pendingBefore.map((t: any) => t.id);
        await this.cancelPendingTasks(tx, instanceId);
        await tx.sysWorkflowInstance.update({
          where: { id: instanceId },
          data: { status: 'withdrawn', endedAt: new Date(), activeNodeIds: [] },
        });
        await tx.sysWorkflowLog.create({
          data: { instanceId, action: 'withdraw', operatorUserId: user.userId },
        });
        this.eventBus.emit('workflow.completed', { instance, finalStatus: 'withdrawn' });
        this.eventBus.emit('workflow.state.changed', {
          userId: instance.startedBy,
          instanceId,
          newStatus: 'withdrawn',
        });
      });
    });
    await this.removeTimeoutJobs(pendingIds);
  }

  /**
   * System-initiated cancellation. Used by the Phase G `unapprove` flow when
   * an already-approved record is being moved back to reaudit and any
   * still-running instance must be cleaned up.
   *
   * Idempotent: silently no-ops on an already-ended instance.
   */
  async cancel(instanceId: string, reason: string): Promise<void> {
    const instance = await this.prisma.sysWorkflowInstance.findUnique({
      where: { id: instanceId },
    });
    if (!instance) {
      throw new BusinessException(
        404,
        ErrorCodes.WORKFLOW_INSTANCE_NOT_FOUND,
        'Instance not found',
      );
    }
    if (instance.status !== 'running') return;

    let pendingIds: string[] = [];
    await this.lock.withLock(instanceId, async () => {
      await this.prisma.$transaction(async (tx) => {
        const pendingBefore = await tx.sysWorkflowTask.findMany({
          where: { instanceId, status: 'pending' },
          select: { id: true },
        });
        pendingIds = pendingBefore.map((t: any) => t.id);
        await this.cancelPendingTasks(tx, instanceId);
        await tx.sysWorkflowInstance.update({
          where: { id: instanceId },
          data: { status: 'cancelled', endedAt: new Date(), activeNodeIds: [] },
        });
        await tx.sysWorkflowLog.create({
          data: {
            instanceId,
            action: 'cancel',
            operatorUserId: null,
            data: { reason },
          },
        });
        this.eventBus.emit('workflow.completed', { instance, finalStatus: 'cancelled' });
      });
    });
    await this.removeTimeoutJobs(pendingIds);
  }

  /** Mass-cancel all still-pending tasks for an instance. */
  private async cancelPendingTasks(tx: any, instanceId: string): Promise<void> {
    await tx.sysWorkflowTask.updateMany({
      where: { instanceId, status: 'pending' },
      data: { status: 'cancelled' },
    });
  }
}
