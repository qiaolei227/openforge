import { Injectable, HttpStatus, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';

export type DistAction = 'allocate' | 'revoke';

export interface ApplyArgs {
  user: { userId: string; orgId: string; isAdmin: boolean };
  recordIds: string[];
  changes: Array<{ orgId: string; action: DistAction }>;
}

export interface DistributionResult {
  recordId: string;
  orgId: string;
  action: DistAction;
  status: 'success' | 'failed';
  errorCode?: string;
  copyId?: string;
}

@Injectable()
export class DistributionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async applyChanges(
    appCode: string,
    modelCode: string,
    args: ApplyArgs,
  ): Promise<{ results: DistributionResult[]; summary: { succeeded: number; failed: number } }> {
    const model = await this.prisma.sysModel.findFirst({
      where: { code: modelCode, app: { code: appCode } },
      select: {
        id: true,
        dataScope: true,
        tableName: true,
        enableDataStatus: true,
        fields: { select: { id: true, columnName: true } },
      },
    });

    if (!model || model.dataScope !== 'distributed') {
      throw new BusinessException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCodes.MODEL_NOT_DISTRIBUTED,
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

    const results: DistributionResult[] = [];

    for (const recordId of args.recordIds) {
      const masterRows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM biz."${model.tableName}" WHERE id = $1::uuid`,
        recordId,
      );
      const master = masterRows[0];
      const masterValid = master && master.master_id === master.id;

      for (const change of args.changes) {
        if (!masterValid) {
          results.push({
            recordId,
            orgId: change.orgId,
            action: change.action,
            status: 'failed',
            errorCode: ErrorCodes.NOT_A_MASTER_RECORD,
          });
          continue;
        }

        const target = await this.prisma.sysOrganization.findUnique({
          where: { id: change.orgId },
        });

        if (!target) {
          results.push({
            recordId,
            orgId: change.orgId,
            action: change.action,
            status: 'failed',
            errorCode: ErrorCodes.COPY_NOT_FOUND,
          });
          continue;
        }

        if (target.parentId === null) {
          results.push({
            recordId,
            orgId: change.orgId,
            action: change.action,
            status: 'failed',
            errorCode: ErrorCodes.CANNOT_ALLOCATE_TO_ROOT,
          });
          continue;
        }

        try {
          const r =
            change.action === 'allocate'
              ? await this.allocate(model, recordId, change.orgId, args.user, master)
              : await this.revoke(model, recordId, change.orgId, args.user);
          results.push(r);
        } catch (e: any) {
          results.push({
            recordId,
            orgId: change.orgId,
            action: change.action,
            status: 'failed',
            errorCode: e.errorCode ?? 'UNKNOWN',
          });
        }
      }
    }

    const summary = {
      succeeded: results.filter((r) => r.status === 'success').length,
      failed: results.filter((r) => r.status === 'failed').length,
    };

    return { results, summary };
  }

  async getDistributionStatus(
    appCode: string,
    modelCode: string,
    recordIds: string[],
  ): Promise<Record<string, Array<{ orgId: string; copyId: string; isArchived: boolean; hasLocalEdits: boolean }>>> {
    const model = await this.prisma.sysModel.findFirst({
      where: { code: modelCode, app: { code: appCode } },
      select: {
        id: true,
        dataScope: true,
        tableName: true,
        fields: { select: { id: true, columnName: true } },
      },
    });

    if (!model || model.dataScope !== 'distributed') {
      throw new BusinessException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCodes.MODEL_NOT_DISTRIBUTED,
        '',
      );
    }

    const result: Record<string, Array<{ orgId: string; copyId: string; isArchived: boolean; hasLocalEdits: boolean }>> = {};
    for (const id of recordIds) result[id] = [];
    if (recordIds.length === 0) return result;

    const policies = await this.prisma.sysDistributionPolicy.findMany({
      where: { modelId: model.id },
      select: { fieldId: true, editable: true },
    });
    const editableFieldIds = new Set(
      policies.filter((p: any) => p.editable).map((p: any) => p.fieldId),
    );
    const editableCols = (model.fields as Array<{ id: string; columnName: string }>)
      .filter((f) => editableFieldIds.has(f.id))
      .map((f) => f.columnName);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM biz."${model.tableName}" WHERE master_id = ANY($1::uuid[])`,
      recordIds,
    );

    const byMaster: Record<string, any> = {};
    for (const row of rows) {
      if (row.master_id === row.id) byMaster[row.id] = row;
    }

    for (const row of rows) {
      if (row.master_id === row.id) continue;
      const master = byMaster[row.master_id];
      const hasLocalEdits = master
        ? editableCols.some((col) => row[col] !== master[col])
        : false;
      if (!result[row.master_id]) result[row.master_id] = [];
      result[row.master_id].push({
        orgId: row.org_id,
        copyId: row.id,
        isArchived: row.is_archived,
        hasLocalEdits,
      });
    }

    return result;
  }

  async getDistributionLog(
    appCode: string,
    modelCode: string,
    recordId: string,
    page: number = 1,
    pageSize: number = 20,
  ) {
    const model = await this.prisma.sysModel.findFirst({
      where: { code: modelCode, app: { code: appCode } },
      select: { id: true },
    });
    if (!model) {
      throw new BusinessException(HttpStatus.NOT_FOUND, ErrorCodes.MODEL_NOT_FOUND, '');
    }
    const safePage = Math.max(1, Math.floor(page));
    const safePageSize = Math.min(200, Math.max(1, Math.floor(pageSize)));
    const skip = (safePage - 1) * safePageSize;
    const [items, total] = await Promise.all([
      this.prisma.sysDistributionLog.findMany({
        where: { modelId: model.id, recordId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safePageSize,
      }),
      this.prisma.sysDistributionLog.count({
        where: { modelId: model.id, recordId },
      }),
    ]);
    return { items, total, page: safePage, pageSize: safePageSize };
  }

  private async allocate(
    model: any,
    recordId: string,
    orgId: string,
    user: { userId: string; orgId: string; isAdmin: boolean },
    master: any,
  ): Promise<DistributionResult> {
    const existing = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, is_archived FROM biz."${model.tableName}" WHERE master_id = $1::uuid AND org_id = $2::uuid AND id <> master_id`,
      recordId,
      orgId,
    );

    if (existing.length > 0) {
      const copy = existing[0];
      if (!copy.is_archived) {
        return {
          recordId,
          orgId,
          action: 'allocate',
          status: 'failed',
          errorCode: ErrorCodes.ALREADY_ALLOCATED,
        };
      }
      // Restore archived copy
      await this.prisma.$executeRawUnsafe(
        `UPDATE biz."${model.tableName}" SET is_archived = false, updated_at = now(), updated_by = $2::uuid WHERE id = $1::uuid`,
        copy.id,
        user.userId,
      );
      await this.prisma.sysDistributionLog.create({
        data: {
          modelId: model.id,
          recordId,
          action: 'allocate',
          sourceOrgId: user.orgId,
          targetOrgId: orgId,
          operatorId: user.userId,
        },
      });
      return { recordId, orgId, action: 'allocate', status: 'success', copyId: copy.id };
    }

    // INSERT new copy
    const newId = randomUUID();
    const cols = [
      'id',
      'org_id',
      'master_id',
      'is_archived',
      'version',
      'created_by',
      'updated_by',
    ];
    const vals: any[] = [newId, orgId, recordId, false, 1, user.userId, user.userId];

    if (model.enableDataStatus) {
      cols.push('data_status');
      vals.push('draft');
    }

    // Copy business field values from master
    for (const f of model.fields) {
      cols.push(f.columnName);
      vals.push(master[f.columnName]);
    }

    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const colsSql = cols.map((c) => `"${c}"`).join(', ');

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO biz."${model.tableName}" (${colsSql}) VALUES (${placeholders})`,
      ...vals,
    );

    await this.prisma.sysDistributionLog.create({
      data: {
        modelId: model.id,
        recordId,
        action: 'allocate',
        sourceOrgId: user.orgId,
        targetOrgId: orgId,
        operatorId: user.userId,
      },
    });

    return { recordId, orgId, action: 'allocate', status: 'success', copyId: newId };
  }

  private async revoke(
    model: any,
    recordId: string,
    orgId: string,
    user: { userId: string; orgId: string; isAdmin: boolean },
  ): Promise<DistributionResult> {
    const existing = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, is_archived FROM biz."${model.tableName}" WHERE master_id = $1::uuid AND org_id = $2::uuid AND id <> master_id`,
      recordId,
      orgId,
    );

    if (existing.length === 0) {
      return {
        recordId,
        orgId,
        action: 'revoke',
        status: 'failed',
        errorCode: ErrorCodes.COPY_NOT_FOUND,
      };
    }

    const copy = existing[0];
    await this.prisma.$executeRawUnsafe(
      `UPDATE biz."${model.tableName}" SET is_archived = true, updated_at = now(), updated_by = $2::uuid WHERE id = $1::uuid`,
      copy.id,
      user.userId,
    );

    await this.prisma.sysDistributionLog.create({
      data: {
        modelId: model.id,
        recordId,
        action: 'revoke',
        sourceOrgId: user.orgId,
        targetOrgId: orgId,
        operatorId: user.userId,
      },
    });

    return { recordId, orgId, action: 'revoke', status: 'success', copyId: copy.id };
  }
}
