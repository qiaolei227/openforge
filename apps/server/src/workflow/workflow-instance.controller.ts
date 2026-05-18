import { Controller, Get, Inject, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowUrgeService } from './workflow-urge.service';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

interface NodeTiming {
  nodeId: string;
  enteredAt: string | null;
  exitedAt: string | null;
  durationMs: number | null;
}

/**
 * Compute per-node timings + total elapsed from an instance's logs.
 *
 * Pairs each `node-enter` log with the next chronologically subsequent
 * `node-exit` log for the same nodeId. Supports re-entry (e.g. returnPrev)
 * by maintaining a per-node cursor through the exits list so each exit
 * is consumed at most once.
 */
function computeTimings(instance: {
  startedAt: Date | string;
  endedAt: Date | string | null;
  logs?: Array<{ action: string; nodeId: string | null; createdAt: Date | string }>;
}): { nodeDurations: NodeTiming[]; totalDurationMs: number | null } {
  const logs = instance.logs ?? [];
  const enters = logs.filter((l) => l.action === 'node-enter' && l.nodeId);
  const exits = logs.filter((l) => l.action === 'node-exit' && l.nodeId);

  const exitsByNode: Record<string, Date[]> = {};
  for (const ex of exits) {
    const key = ex.nodeId as string;
    (exitsByNode[key] ??= []).push(new Date(ex.createdAt));
  }
  const cursor: Record<string, number> = {};

  const nodeDurations: NodeTiming[] = enters.map((en) => {
    const nodeId = en.nodeId as string;
    const enteredAt = new Date(en.createdAt);
    const candidates = exitsByNode[nodeId] ?? [];
    let exitedAt: Date | null = null;
    while ((cursor[nodeId] ?? 0) < candidates.length) {
      const candidate = candidates[cursor[nodeId] ?? 0];
      cursor[nodeId] = (cursor[nodeId] ?? 0) + 1;
      if (candidate.getTime() >= enteredAt.getTime()) {
        exitedAt = candidate;
        break;
      }
    }
    return {
      nodeId,
      enteredAt: enteredAt.toISOString(),
      exitedAt: exitedAt ? exitedAt.toISOString() : null,
      durationMs: exitedAt ? exitedAt.getTime() - enteredAt.getTime() : null,
    };
  });

  const totalDurationMs = instance.endedAt
    ? new Date(instance.endedAt).getTime() - new Date(instance.startedAt).getTime()
    : null;

  return { nodeDurations, totalDurationMs };
}

@Controller('workflow-instances')
export class WorkflowInstanceController {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(WorkflowEngineService) private engine: WorkflowEngineService,
    @Inject(WorkflowUrgeService) private urge: WorkflowUrgeService,
  ) {}

  @Get(':id')
  @RequirePermission('sys:self', 'view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const instance = await this.prisma.sysWorkflowInstance.findUnique({
      where: { id },
      include: {
        tasks: { orderBy: { sortOrder: 'asc' } },
        logs: { orderBy: { createdAt: 'asc' } },
        workflowVersion: true,
        workflow: true,
      },
    });
    if (!instance) {
      throw new BusinessException(
        404,
        ErrorCodes.WORKFLOW_INSTANCE_NOT_FOUND,
        'Instance not found',
      );
    }
    return { ...instance, ...computeTimings(instance) };
  }

  /**
   * Return the latest workflow instance for a given record (prefer running),
   * or `null` if the record has never been submitted.
   *
   * Used by the form page's WorkflowSection — every record-detail view
   * unconditionally probes this endpoint and gracefully hides if null.
   */
  @Get('by-record/:recordId')
  @RequirePermission('sys:self', 'view')
  async getByRecord(@Param('recordId', ParseUUIDPipe) recordId: string) {
    const running = await this.prisma.sysWorkflowInstance.findFirst({
      where: { recordId, status: 'running' },
      include: {
        tasks: { orderBy: { sortOrder: 'asc' } },
        logs: { orderBy: { createdAt: 'asc' } },
        workflowVersion: true,
        workflow: true,
      },
    });
    if (running) return { ...running, ...computeTimings(running) };
    const latest = await this.prisma.sysWorkflowInstance.findFirst({
      where: { recordId },
      include: {
        tasks: { orderBy: { sortOrder: 'asc' } },
        logs: { orderBy: { createdAt: 'asc' } },
        workflowVersion: true,
        workflow: true,
      },
      orderBy: { startedAt: 'desc' },
    });
    if (!latest) return null;
    return { ...latest, ...computeTimings(latest) };
  }

  @Post(':id/withdraw')
  @RequirePermission('sys:self', 'edit')
  withdraw(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.engine.withdraw(id, { userId: req.user.userId, orgId: req.user.orgId });
  }

  @Post(':id/urge')
  @RequirePermission('sys:self', 'edit')
  urgeInstance(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.urge.urge(id, { userId: req.user.userId, orgId: req.user.orgId });
  }
}
