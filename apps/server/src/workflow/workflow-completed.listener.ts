import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { ReadonlyPropagationService } from '../dynamic-data/readonly-propagation.service';

/**
 * Bridges the workflow engine back to the business record's `data_status`.
 *
 * Engine writes only to sys_workflow_* tables; the biz."{tableName}" row is
 * the responsibility of DataStatusService. After the engine emits
 * `workflow.completed`, this listener updates `data_status` (and approver
 * stamps when applicable) so the record's data_status stays in sync with
 * the workflow's final state.
 *
 * Status mapping:
 *  - approved  → data_status='approved' + approved_by/at from last approver
 *  - rejected  → data_status='draft'
 *  - returned  → data_status='draft'
 *  - withdrawn → data_status='draft'
 *  - cancelled → no-op (DataStatusService.unapprove sets data_status='reaudit'
 *                directly; for other rare cancel paths the record is left
 *                untouched intentionally)
 *
 * P2.3 K2: When the model is distributed (sys_model.data_scope='distributed'),
 * we also push the same state change to every non-archived copy via
 * ReadonlyPropagationService. The system-status whitelist there bypasses
 * the editable-field policy so copies stay in lockstep with the master.
 */
@Injectable()
export class WorkflowCompletedListener {
  private readonly logger = new Logger(WorkflowCompletedListener.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ReadonlyPropagationService)
    private readonlyPropagation: ReadonlyPropagationService,
  ) {}

  @OnEvent('workflow.completed')
  async onCompleted(payload: { instance: any; finalStatus: string }): Promise<void> {
    const { instance, finalStatus } = payload;
    if (!instance) {
      this.logger.warn('workflow.completed event missing instance payload');
      return;
    }

    let newDataStatus: string | null = null;
    if (finalStatus === 'approved') {
      newDataStatus = 'approved';
    } else if (
      finalStatus === 'rejected' ||
      finalStatus === 'returned' ||
      finalStatus === 'withdrawn'
    ) {
      newDataStatus = 'draft';
    } else {
      // cancelled (or any other terminal) → no-op
      return;
    }

    const model = await this.prisma.sysModel.findUnique({
      where: { id: instance.modelId },
      include: { app: true, fields: { select: { id: true, columnName: true } } },
    });
    if (!model) {
      this.logger.warn(`Model ${instance.modelId} not found for workflow completion`);
      return;
    }
    const tableName = `${model.app.code}_${model.code}`;

    let approverId: string | null = null;
    try {
      await this.prisma.$executeRawUnsafe(
        `UPDATE biz."${tableName}" SET "data_status" = $1, "updated_at" = NOW(), "version" = "version" + 1 WHERE "id" = $2::uuid`,
        newDataStatus,
        instance.recordId,
      );

      if (newDataStatus === 'approved') {
        approverId = await this.findLastApprover(instance.id);
        if (approverId) {
          await this.prisma.$executeRawUnsafe(
            `UPDATE biz."${tableName}" SET "approved_by" = $1::uuid, "approved_at" = NOW() WHERE "id" = $2::uuid`,
            approverId,
            instance.recordId,
          );
        } else {
          await this.prisma.$executeRawUnsafe(
            `UPDATE biz."${tableName}" SET "approved_at" = NOW() WHERE "id" = $1::uuid`,
            instance.recordId,
          );
        }
      }
    } catch (e) {
      this.logger.error(
        `Failed to update data_status for record ${instance.recordId} on table ${tableName}: ${(e as Error).message}`,
      );
      return;
    }

    // P2.3 K2: propagate to distributed-model copies.
    //
    // Done outside the master UPDATE because:
    //   1. The master UPDATE is non-transactional already (each statement
    //      commits independently — propagating inside a txn here would not
    //      give us cross-statement atomicity).
    //   2. A propagation failure should not roll back the master update —
    //      the master is the source of truth and the next workflow event
    //      (or a manual sync) can re-propagate.
    if ((model as any).dataScope !== 'distributed') return;
    try {
      const changes: Record<string, any> = { data_status: newDataStatus };
      if (newDataStatus === 'approved') {
        if (approverId) changes.approved_by = approverId;
        changes.approved_at = new Date();
      }
      await this.readonlyPropagation.propagate(
        this.prisma,
        {
          id: model.id,
          tableName,
          fields: (model as any).fields ?? [],
        },
        instance.recordId,
        changes,
      );
    } catch (e) {
      this.logger.error(
        `Failed to propagate workflow state to replicas of ${instance.recordId} on ${tableName}: ${(e as Error).message}`,
      );
    }
  }

  private async findLastApprover(instanceId: string): Promise<string | null> {
    const last = await this.prisma.sysWorkflowTask.findFirst({
      where: { instanceId, status: 'approved' },
      orderBy: { decisionAt: 'desc' },
      select: { assigneeUserId: true },
    });
    return last?.assigneeUserId ?? null;
  }
}
