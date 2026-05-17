import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { WorkflowService } from '../workflow/workflow.service';
import { WorkflowEngineService } from '../workflow/workflow-engine.service';

type StatusAction = 'submit' | 'withdraw' | 'approve' | 'unapprove';

const TRANSITIONS: Record<StatusAction, { from: string[]; to: string }> = {
  submit:    { from: ['draft', 'reaudit'], to: 'submitted' },
  withdraw:  { from: ['submitted'],        to: 'draft' },
  approve:   { from: ['submitted'],        to: 'approved' },
  unapprove: { from: ['approved'],         to: 'reaudit' },
};

@Injectable()
export class DataStatusService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(WorkflowService) private workflowService: WorkflowService,
    @Inject(WorkflowEngineService) private engine: WorkflowEngineService,
  ) {}

  async transition(
    tableName: string,
    recordId: string,
    action: StatusAction,
    userId: string,
    isAdmin = false,
  ): Promise<void> {
    const rule = TRANSITIONS[action];
    if (!rule) {
      throw new BusinessException(400, ErrorCodes.DATA_VALIDATION_FAILED, `Unknown action: ${action}`);
    }

    // Engine hooks run BEFORE the data_status UPDATE. The engine uses its own
    // $transaction internally; we don't nest it inside the SELECT-FOR-UPDATE tx
    // below. Side effects (instance create / cancel / withdraw) commit
    // independently so a downstream UPDATE failure won't leave a half-started
    // workflow — but a SELECT-FOR-UPDATE failure won't roll back the engine
    // either. That's OK: the engine's listener is the source of truth for
    // data_status under workflow control (Task G4).

    if (action === 'submit') {
      await this.startWorkflowIfMatched(tableName, recordId, userId);
    } else if (action === 'withdraw') {
      const handled = await this.delegateWithdrawToEngine(recordId, userId);
      if (handled) return; // listener takes over — skip direct UPDATE
    } else if (action === 'unapprove') {
      await this.cancelInstanceForUnapprove(recordId);
      // fall through — DataStatusService still sets data_status='reaudit'
    }

    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT "data_status", "submitted_by", "created_by" FROM biz."${tableName}" WHERE "id" = $1::uuid FOR UPDATE`,
        recordId,
      );
      if (rows.length === 0) {
        throw new BusinessException(404, ErrorCodes.DATA_NOT_FOUND, 'Record not found');
      }

      const record = rows[0];
      if (!rule.from.includes(record.data_status)) {
        throw new BusinessException(
          409,
          ErrorCodes.DATA_STATUS_INVALID_TRANSITION,
          `Cannot ${action}: current status is ${record.data_status}, expected one of ${rule.from.join(', ')}`,
        );
      }

      if (action === 'withdraw' && !isAdmin && record.submitted_by !== userId) {
        throw new BusinessException(403, ErrorCodes.DATA_STATUS_NOT_SUBMITTER, 'Only submitter can withdraw');
      }

      if (action === 'submit') {
        await tx.$executeRawUnsafe(
          `UPDATE biz."${tableName}" SET "data_status" = $1, "submitted_by" = $2::uuid, "submitted_at" = NOW(), "updated_by" = $2::uuid, "updated_at" = NOW(), "version" = "version" + 1 WHERE "id" = $3::uuid`,
          rule.to,
          userId,
          recordId,
        );
      } else if (action === 'approve') {
        await tx.$executeRawUnsafe(
          `UPDATE biz."${tableName}" SET "data_status" = $1, "approved_by" = $2::uuid, "approved_at" = NOW(), "updated_by" = $2::uuid, "updated_at" = NOW(), "version" = "version" + 1 WHERE "id" = $3::uuid`,
          rule.to,
          userId,
          recordId,
        );
      } else if (action === 'unapprove') {
        await tx.$executeRawUnsafe(
          `UPDATE biz."${tableName}" SET "data_status" = $1, "approved_by" = NULL, "approved_at" = NULL, "updated_by" = $2::uuid, "updated_at" = NOW(), "version" = "version" + 1 WHERE "id" = $3::uuid`,
          rule.to,
          userId,
          recordId,
        );
      } else {
        await tx.$executeRawUnsafe(
          `UPDATE biz."${tableName}" SET "data_status" = $1, "updated_by" = $2::uuid, "updated_at" = NOW(), "version" = "version" + 1 WHERE "id" = $3::uuid`,
          rule.to,
          userId,
          recordId,
        );
      }
    });
  }

  /**
   * On submit, look up a matching workflow via WorkflowService.findMatching
   * and start it via the engine. Idempotent: if a running instance already
   * exists for this record, skip — the data_status UPDATE still proceeds.
   * If no workflow matches, that's fine — data_status still advances to
   * 'submitted' (workflows are optional per spec design).
   */
  private async startWorkflowIfMatched(
    tableName: string,
    recordId: string,
    userId: string,
  ): Promise<void> {
    const existing = await this.prisma.sysWorkflowInstance.findFirst({
      where: { recordId, status: 'running' },
    });
    if (existing) return;

    const model = await this.findModelByTableName(tableName);
    // If the table doesn't map to a sys_model row, there can't be a workflow
    // configured for it — skip silently. The subsequent data_status UPDATE
    // will fail with DATA_NOT_FOUND if the record truly doesn't exist.
    if (!model) return;
    const record = await this.fetchRecord(tableName, recordId);
    if (!record) return;

    const wf = await this.workflowService.findMatching(model.id, record);
    if (!wf) return;

    await this.engine.start(wf.id, recordId, {
      user: {
        userId,
        orgId: record.org_id ?? '00000000-0000-0000-0000-000000000000',
      },
      appId: model.appId,
      appCode: model.app.code,
      modelId: model.id,
      modelCode: model.code,
      record,
    });
  }

  /**
   * On withdraw, if there's a running instance, delegate to engine.withdraw
   * (the listener will set data_status='draft' via workflow.completed event).
   * Returns true if the engine handled it (caller should skip the direct
   * UPDATE); false if no workflow is involved and the caller should fall
   * through to the existing UPDATE path.
   */
  private async delegateWithdrawToEngine(
    recordId: string,
    userId: string,
  ): Promise<boolean> {
    const instance = await this.prisma.sysWorkflowInstance.findFirst({
      where: { recordId, status: 'running' },
    });
    if (!instance) return false;

    await this.engine.withdraw(instance.id, { userId, orgId: '' });
    return true;
  }

  /**
   * On unapprove, cancel the associated approved instance so that a future
   * resubmit can start a fresh instance. The direct UPDATE still proceeds to
   * set data_status='reaudit' — the listener no-ops on 'cancelled' so we
   * don't double-write data_status here.
   */
  private async cancelInstanceForUnapprove(recordId: string): Promise<void> {
    const instance = await this.prisma.sysWorkflowInstance.findFirst({
      where: { recordId, status: 'approved' },
    });
    if (!instance) return;
    await this.engine.cancel(instance.id, 'unapproved');
  }

  /**
   * tableName format is `{appCode}_{modelCode}` (both snake_case), but appCode
   * itself may contain underscores. Cleanest fix: load all (app, model) pairs
   * and find the unique match against the concatenation.
   */
  private async findModelByTableName(tableName: string) {
    const models = await this.prisma.sysModel.findMany({
      include: { app: true },
    });
    return models.find((m) => `${m.app.code}_${m.code}` === tableName) ?? null;
  }

  private async fetchRecord(tableName: string, recordId: string): Promise<any | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM biz."${tableName}" WHERE "id" = $1::uuid LIMIT 1`,
      recordId,
    );
    return rows[0] ?? null;
  }
}
