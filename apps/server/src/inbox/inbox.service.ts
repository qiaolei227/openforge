import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ListParams {
  appId?: string;
  orgId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Inbox query service for the current user.
 *
 * Five tabs are exposed:
 *  - pending      — tasks awaiting my decision (approve-nodes only)
 *  - done         — tasks I've already decided on (approved/rejected/transferred)
 *  - cc           — tasks where I was carbon-copied (nodeType=cc)
 *  - myInstances  — workflow instances I started (any status)
 *  - counts       — bulk count of all four for badge rendering
 *
 * All queries optionally narrow by appId / orgId so the inbox UI can be filtered
 * by the user's current workspace / current org.
 */
@Injectable()
export class InboxService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async pending(userId: string, params: ListParams) {
    return this.prisma.sysWorkflowTask.findMany({
      where: {
        assigneeUserId: userId,
        status: 'pending',
        nodeType: 'approve',
        instance: {
          status: 'running',
          ...(params.appId && { appId: params.appId }),
          ...(params.orgId && { orgId: params.orgId }),
        },
      },
      include: {
        instance: {
          include: {
            workflow: { include: { model: { include: { app: true } } } },
          },
        },
      },
      orderBy: { instance: { startedAt: 'desc' } },
      take: params.limit ?? 50,
      skip: params.offset ?? 0,
    });
  }

  async done(userId: string, params: ListParams) {
    const instanceFilter: any = {
      ...(params.appId && { appId: params.appId }),
      ...(params.orgId && { orgId: params.orgId }),
    };
    return this.prisma.sysWorkflowTask.findMany({
      where: {
        assigneeUserId: userId,
        status: { in: ['approved', 'rejected', 'transferred'] },
        nodeType: 'approve',
        ...(Object.keys(instanceFilter).length > 0 && { instance: instanceFilter }),
      },
      include: {
        instance: {
          include: {
            workflow: { include: { model: { include: { app: true } } } },
          },
        },
      },
      orderBy: { decisionAt: 'desc' },
      take: params.limit ?? 50,
      skip: params.offset ?? 0,
    });
  }

  async cc(userId: string, params: ListParams) {
    const instanceFilter: any = {
      ...(params.appId && { appId: params.appId }),
      ...(params.orgId && { orgId: params.orgId }),
    };
    return this.prisma.sysWorkflowTask.findMany({
      where: {
        assigneeUserId: userId,
        nodeType: 'cc',
        ...(Object.keys(instanceFilter).length > 0 && { instance: instanceFilter }),
      },
      include: {
        instance: {
          include: {
            workflow: { include: { model: { include: { app: true } } } },
          },
        },
      },
      orderBy: { instance: { startedAt: 'desc' } },
      take: params.limit ?? 50,
      skip: params.offset ?? 0,
    });
  }

  async myInstances(userId: string, params: ListParams) {
    return this.prisma.sysWorkflowInstance.findMany({
      where: {
        startedBy: userId,
        ...(params.appId && { appId: params.appId }),
        ...(params.orgId && { orgId: params.orgId }),
      },
      include: {
        workflow: { include: { model: { include: { app: true } } } },
        tasks: { where: { status: 'pending' }, take: 1 },
      },
      orderBy: { startedAt: 'desc' },
      take: params.limit ?? 50,
      skip: params.offset ?? 0,
    });
  }

  async counts(userId: string) {
    const [pending, done, cc, myInstances] = await Promise.all([
      this.prisma.sysWorkflowTask.count({
        where: {
          assigneeUserId: userId,
          status: 'pending',
          nodeType: 'approve',
          instance: { status: 'running' },
        },
      }),
      this.prisma.sysWorkflowTask.count({
        where: {
          assigneeUserId: userId,
          status: { in: ['approved', 'rejected', 'transferred'] },
          nodeType: 'approve',
        },
      }),
      this.prisma.sysWorkflowTask.count({
        where: { assigneeUserId: userId, nodeType: 'cc' },
      }),
      this.prisma.sysWorkflowInstance.count({ where: { startedBy: userId } }),
    ]);
    return { pending, done, cc, myInstances };
  }
}
