import { Injectable, CanActivate, ExecutionContext, HttpStatus, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';

@Injectable()
export class DistributedGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const { method, params, user } = req;
    const { appCode, modelCode, id: recordId } = params ?? {};
    if (!appCode || !modelCode) return true;

    const model = await this.prisma.sysModel.findFirst({
      where: { code: modelCode, app: { code: appCode } },
      select: {
        id: true,
        dataScope: true,
        tableName: true,
        fields: { select: { id: true, columnName: true, name: true } },
      },
    });
    if (!model || model.dataScope !== 'distributed') return true;
    if (user?.isAdmin) return true;

    // Rule 1 (B1): non-root create master rejection.
    // Only apply to actual master-create paths (bare POST /data and POST /data/batch).
    // Other POST routes on the same controller (/query, /distribute, /distribution-status,
    // /:id/sync, /fill-missing-copies) are not master-creates and have their own semantics
    // and permission checks.
    if (method === 'POST' && !recordId && this.isMasterCreatePath(req)) {
      const isRoot = await this.isRootOrg(user.orgId);
      if (!isRoot) {
        throw new BusinessException(
          HttpStatus.FORBIDDEN,
          ErrorCodes.CANNOT_CREATE_COPY_DIRECTLY,
          '',
        );
      }
    }

    // Rule 2 (B2): readonly field write rejection on copies.
    // Only applies to PUT/PATCH on an existing record (has :id, is a direct record update path).
    if (
      (method === 'PUT' || method === 'PATCH') &&
      recordId &&
      this.isRecordUpdatePath(req)
    ) {
      const body = req.body ?? {};
      const bodyKeys = Object.keys(body);
      if (bodyKeys.length === 0) return true; // no field writes (archive/status subroutes)

      const fieldRows: Array<{ id: string; columnName: string; name: string }> =
        model.fields ?? [];
      if (fieldRows.length === 0) return true; // model has no user fields

      const policies = await this.prisma.sysDistributionPolicy.findMany({
        where: { modelId: model.id },
        select: { fieldId: true, editable: true },
      });

      // Check if the record is a copy (master_id !== id)
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; master_id: string }>>(
        `SELECT id, master_id FROM biz."${model.tableName}" WHERE id = $1::uuid`,
        recordId,
      );
      if (!rows[0]) return true; // record not found → let service raise 404
      const isCopy = rows[0].master_id !== rows[0].id;
      if (!isCopy) return true; // master record: root-org can always edit its own fields

      const editableSet = new Set(
        policies.filter((p) => p.editable).map((p) => p.fieldId),
      );
      const fieldByCol = new Map(fieldRows.map((f) => [f.columnName, f]));

      for (const key of bodyKeys) {
        const f = fieldByCol.get(key);
        if (!f) continue; // unknown / system field — not our concern
        if (!editableSet.has(f.id)) {
          throw new BusinessException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            ErrorCodes.FIELD_READONLY_BY_MASTER,
            JSON.stringify({ fieldName: f.name }),
          );
        }
      }
    }

    return true;
  }

  private isMasterCreatePath(req: any): boolean {
    const routePath: string | undefined = req.route?.path;
    if (!routePath) return true; // fallback (tests without express route): assume bare create
    return /\/data$/.test(routePath) || /\/data\/batch$/.test(routePath);
  }

  /**
   * Returns true when the route is a direct record update (PUT/PATCH /:id),
   * and false for sub-routes like /:id/archive, /:id/status, /:id/sync
   * which do not perform user-field writes.
   */
  private isRecordUpdatePath(req: any): boolean {
    const routePath: string | undefined = req.route?.path;
    if (!routePath) return true; // fallback: assume direct update
    // Exclude known sub-routes that aren't user-field writes
    if (/\/:id\/(archive|status|sync)/.test(routePath)) return false;
    return /\/:id$/.test(routePath);
  }

  private async isRootOrg(orgId: string | undefined | null): Promise<boolean> {
    if (!orgId) return false;
    const org = await this.prisma.sysOrganization.findUnique({ where: { id: orgId } });
    return !!org && org.parentId === null;
  }
}
