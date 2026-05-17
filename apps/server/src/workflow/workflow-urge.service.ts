import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { NotificationService } from '../notification/notification.service';

const URGE_COOLDOWN_MS = 24 * 3600 * 1000;

/**
 * Submitter-initiated urge (催办).
 *
 * Spec §3.6: the submitter can ping all pending-task assignees of a running
 * instance. Cooldown 24h since the most recent urge across the pending tasks
 * to prevent spam. Each call writes a single `urge` log row and one
 * `workflow_urge` notification per pending assignee.
 */
@Injectable()
export class WorkflowUrgeService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(NotificationService) private notify: NotificationService,
  ) {}

  async urge(instanceId: string, user: { userId: string; orgId: string }) {
    const instance = await this.prisma.sysWorkflowInstance.findUnique({
      where: { id: instanceId },
      include: { tasks: { where: { status: 'pending' } } },
    });
    if (!instance) {
      throw new BusinessException(
        404,
        ErrorCodes.WORKFLOW_INSTANCE_NOT_FOUND,
        'Instance not found',
      );
    }
    if (instance.startedBy !== user.userId) {
      throw new BusinessException(
        403,
        ErrorCodes.WORKFLOW_TASK_NOT_ASSIGNEE,
        'Only the submitter can urge',
      );
    }
    if (instance.status !== 'running') {
      throw new BusinessException(
        409,
        ErrorCodes.WORKFLOW_INSTANCE_NOT_RUNNING,
        'Instance not running',
      );
    }
    const pending = instance.tasks;
    if (!pending.length) {
      throw new BusinessException(
        409,
        ErrorCodes.WORKFLOW_INSTANCE_NOT_RUNNING,
        'No pending tasks to urge',
      );
    }

    const lastUrged = pending.reduce<number>(
      (max, t) => Math.max(max, t.urgedAt?.getTime() ?? 0),
      0,
    );
    if (lastUrged > 0 && Date.now() - lastUrged < URGE_COOLDOWN_MS) {
      throw new BusinessException(
        429,
        ErrorCodes.WORKFLOW_URGE_TOO_FREQUENT,
        'Wait 24h between urges',
      );
    }

    const now = new Date();
    await this.prisma.sysWorkflowTask.updateMany({
      where: { id: { in: pending.map((t) => t.id) } },
      data: { urgedAt: now },
    });
    await this.prisma.sysWorkflowLog.create({
      data: { instanceId, action: 'urge', operatorUserId: user.userId },
    });
    await Promise.all(
      pending.map((t) =>
        this.notify.create({
          userId: t.assigneeUserId,
          orgId: instance.orgId,
          type: 'workflow_urge',
          title: '催办：请尽快处理审批',
          relatedType: 'workflow_task',
          relatedId: t.id,
          navigateTo: '/workspace/inbox',
        }),
      ),
    );
    return { ok: true, urgedTasks: pending.length };
  }
}
