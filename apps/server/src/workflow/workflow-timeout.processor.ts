import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { NotificationService } from '../notification/notification.service';
import { ApproveNodeConfig, WorkflowDefinition } from './types';

/**
 * Consumes the `workflow-timeout` bullmq queue.
 *
 * Each scheduled job fires once a task's dueAt elapses. We re-read state from
 * the DB (the engine is the source of truth — a delayed job has been queued
 * for up to days and the task may have been decided, transferred, or
 * cancelled in the meantime), and then dispatch one of four onTimeout
 * strategies declared on the approve node config:
 *
 *  - notify       : send a reminder notification + log `timeout-notify`
 *  - autoApprove  : run engine.decide(..., 'approve') as the assignee
 *  - autoReject   : run engine.decide(..., 'reject') as the assignee
 *  - transferTo   : run engine.transfer(...) to the first configured target
 *
 * The `escalated` flag on sys_workflow_task is set first so a duplicate
 * delivery (bullmq has at-least-once semantics) is a no-op.
 */
@Processor('workflow-timeout')
export class WorkflowTimeoutProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowTimeoutProcessor.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(WorkflowEngineService) private engine: WorkflowEngineService,
    @Inject(NotificationService) private notify: NotificationService,
  ) {
    super();
  }

  async process(job: Job<{ taskId: string }>): Promise<void> {
    const { taskId } = job.data;
    const task = await this.prisma.sysWorkflowTask.findUnique({
      where: { id: taskId },
      include: { instance: { include: { workflowVersion: true } } },
    });
    if (!task) {
      this.logger.debug(`Timeout job for missing task ${taskId}; ignoring`);
      return;
    }
    if (task.status !== 'pending') return;
    if (task.instance.status !== 'running') return;
    if (task.escalated) return;

    const def = task.instance.workflowVersion.definition as unknown as WorkflowDefinition;
    const node = def.nodes.find((n) => n.id === task.nodeId);
    const cfg = node?.config as ApproveNodeConfig | undefined;
    const onTimeout = cfg?.onTimeout ?? 'notify';

    // Flip escalated *first* so concurrent / re-delivered jobs are no-ops.
    await this.prisma.sysWorkflowTask.update({
      where: { id: taskId },
      data: { escalated: true },
    });

    try {
      if (onTimeout === 'notify') {
        await this.notify.create({
          userId: task.assigneeUserId,
          orgId: task.instance.orgId,
          type: 'workflow_timeout',
          title: '审批超时提醒',
          body: `节点 "${task.nodeName}" 已超时，请尽快处理`,
          relatedType: 'workflow_task',
          relatedId: taskId,
          navigateTo: '/workspace/inbox',
        });
        await this.prisma.sysWorkflowLog.create({
          data: {
            instanceId: task.instanceId,
            taskId,
            action: 'timeout-notify',
            nodeId: task.nodeId,
          },
        });
      } else if (onTimeout === 'autoApprove') {
        await this.engine.decide(
          taskId,
          'approve',
          { userId: task.assigneeUserId, orgId: task.instance.orgId },
          '系统自动通过（超时）',
        );
        await this.prisma.sysWorkflowLog.create({
          data: {
            instanceId: task.instanceId,
            taskId,
            action: 'timeout-auto-approve',
            nodeId: task.nodeId,
          },
        });
      } else if (onTimeout === 'autoReject') {
        await this.engine.decide(
          taskId,
          'reject',
          { userId: task.assigneeUserId, orgId: task.instance.orgId },
          '系统自动驳回（超时）',
        );
        await this.prisma.sysWorkflowLog.create({
          data: {
            instanceId: task.instanceId,
            taskId,
            action: 'timeout-auto-reject',
            nodeId: task.nodeId,
          },
        });
      } else if (onTimeout === 'transferTo') {
        const target = cfg?.onTimeoutTransferUserIds?.[0];
        if (!target) {
          this.logger.warn(
            `Timeout transfer configured for task ${taskId} but no target user; skipping`,
          );
          return;
        }
        await this.engine.transfer(
          taskId,
          target,
          { userId: task.assigneeUserId, orgId: task.instance.orgId },
          '系统自动转交（超时）',
        );
        await this.prisma.sysWorkflowLog.create({
          data: {
            instanceId: task.instanceId,
            taskId,
            action: 'timeout-transfer',
            nodeId: task.nodeId,
            targetUserId: target,
          },
        });
      }
    } catch (e) {
      this.logger.error(
        `Timeout handler failed for task ${taskId}: ${(e as Error).message}`,
      );
      // Re-throw so bullmq retries per its default policy. The escalated flag
      // is already set, so the next attempt will short-circuit unless we
      // reset it. We deliberately don't reset — a single failed escalation
      // is preferable to a flapping retry loop firing duplicate state
      // transitions.
      throw e;
    }
  }
}
