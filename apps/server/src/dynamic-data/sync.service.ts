import { Injectable, HttpStatus, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';

export const SYNC_PHRASES = {
  force_push: '强制覆盖',
  backfill: '策略回填',
} as const;

export interface SyncArgs {
  user: { userId: string; orgId: string; isAdmin: boolean };
  action: 'force_push' | 'backfill';
  fieldColumns: string[];
  confirmationPhrase: string;
}

@Injectable()
export class SyncService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async sync(
    appCode: string,
    modelCode: string,
    recordId: string,
    args: SyncArgs,
  ): Promise<{ affected: number; fieldCount: number }> {
    const model = await this.prisma.sysModel.findFirst({
      where: { code: modelCode, app: { code: appCode } },
      select: {
        id: true,
        dataScope: true,
        tableName: true,
        fields: { select: { id: true, columnName: true, name: true } },
      },
    });
    if (!model || model.dataScope !== 'distributed') {
      throw new BusinessException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCodes.MODEL_NOT_DISTRIBUTED,
        '',
      );
    }

    if (SYNC_PHRASES[args.action] !== args.confirmationPhrase) {
      throw new BusinessException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.CONFIRMATION_MISMATCH,
        '',
      );
    }

    if (!args.user.isAdmin) {
      const currentOrg = await this.prisma.sysOrganization.findUnique({
        where: { id: args.user.orgId },
      });
      if (!currentOrg || currentOrg.parentId !== null) {
        throw new BusinessException(
          HttpStatus.FORBIDDEN,
          ErrorCodes.DISTRIBUTE_REQUIRES_ROOT_ORG,
          '',
        );
      }
    }

    // Validate fieldColumns against model fields
    const fieldByCol = new Map(
      (model.fields as Array<{ id: string; columnName: string; name: string }>).map((f) => [f.columnName, f]),
    );
    for (const col of args.fieldColumns) {
      if (!fieldByCol.has(col)) {
        throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          ErrorCodes.FIELD_READONLY_BY_MASTER,
          JSON.stringify({ fieldName: col }),
        );
      }
    }

    // force_push: restrict to editable fields only
    if (args.action === 'force_push') {
      const policies = await this.prisma.sysDistributionPolicy.findMany({
        where: { modelId: model.id },
        select: { fieldId: true, editable: true },
      });
      const editableSet = new Set(
        (policies as Array<{ fieldId: string; editable: boolean }>)
          .filter((p) => p.editable)
          .map((p) => p.fieldId),
      );
      for (const col of args.fieldColumns) {
        const field = fieldByCol.get(col)!;
        if (!editableSet.has(field.id)) {
          throw new BusinessException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            ErrorCodes.FIELD_READONLY_BY_MASTER,
            JSON.stringify({ fieldName: field.name }),
          );
        }
      }
    }

    // Fetch master record — must exist and have master_id = id
    const masterRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM biz."${model.tableName}" WHERE id = $1::uuid AND master_id = id`,
      recordId,
    );
    if (masterRows.length === 0) {
      throw new BusinessException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCodes.NOT_A_MASTER_RECORD,
        '',
      );
    }
    const master = masterRows[0];

    // Fetch non-archived copies with the affected columns
    const colList = args.fieldColumns.map((c) => `"${c}"`).join(', ');
    const copyCols = args.fieldColumns.length > 0 ? `, ${colList}` : '';
    const copies = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, org_id${copyCols} FROM biz."${model.tableName}" WHERE master_id = $1::uuid AND id <> master_id AND is_archived = false`,
      recordId,
    );

    const setClauses = args.fieldColumns.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
    const values = args.fieldColumns.map((c) => master[c]);
    const logEntries: any[] = [];
    await Promise.all(
      copies.map((copy) =>
        this.prisma.$executeRawUnsafe(
          `UPDATE biz."${model.tableName}" SET ${setClauses}, updated_at = now(), updated_by = $${args.fieldColumns.length + 1}::uuid WHERE id = $${args.fieldColumns.length + 2}::uuid`,
          ...values,
          args.user.userId,
          copy.id,
        ),
      ),
    );
    for (const copy of copies) {
      for (const col of args.fieldColumns) {
        logEntries.push({
          modelId: model.id,
          recordId,
          action: args.action,
          sourceOrgId: args.user.orgId,
          targetOrgId: copy.org_id,
          fieldColumn: col,
          beforeValue: { value: copy[col] },
          afterValue: { value: master[col] },
          operatorId: args.user.userId,
        });
      }
    }
    if (logEntries.length > 0) {
      await this.prisma.sysDistributionLog.createMany({ data: logEntries });
    }

    return { affected: copies.length, fieldCount: args.fieldColumns.length };
  }
}
