import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';

type StatusAction = 'submit' | 'withdraw' | 'approve' | 'reject' | 'unapprove' | 'revise';

const TRANSITIONS: Record<StatusAction, { from: string; to: string }> = {
  submit:    { from: 'draft',            to: 'submitted' },
  withdraw:  { from: 'submitted',        to: 'draft' },
  approve:   { from: 'submitted',        to: 'approved' },
  reject:    { from: 'submitted',        to: 'pending_revision' },
  unapprove: { from: 'approved',         to: 'draft' },
  revise:    { from: 'pending_revision', to: 'draft' },
};

@Injectable()
export class DataStatusService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async transition(
    tableName: string,
    recordId: string,
    action: StatusAction,
    userId: string,
  ): Promise<void> {
    const rule = TRANSITIONS[action];
    if (!rule) {
      throw new BusinessException(400, ErrorCodes.DATA_VALIDATION_FAILED, `Unknown action: ${action}`);
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
      if (record.data_status !== rule.from) {
        throw new BusinessException(
          409,
          ErrorCodes.DATA_STATUS_INVALID_TRANSITION,
          `Cannot ${action}: current status is ${record.data_status}, expected ${rule.from}`,
        );
      }

      if (action === 'withdraw' && record.submitted_by !== userId) {
        throw new BusinessException(403, ErrorCodes.DATA_STATUS_NOT_SUBMITTER, 'Only submitter can withdraw');
      }

      if (action === 'submit') {
        await tx.$executeRawUnsafe(
          `UPDATE biz."${tableName}" SET "data_status" = $1, "submitted_by" = $2::uuid, "submitted_at" = NOW(), "updated_by" = $2::uuid, "updated_at" = NOW(), "version" = "version" + 1 WHERE "id" = $3::uuid`,
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
}
