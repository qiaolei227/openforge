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

    if (
      (method === 'PUT' || method === 'PATCH') &&
      recordId &&
      this.isRecordUpdatePath(req)
    ) {
      const body = req.body ?? {};
      const bodyKeys = Object.keys(body);
      if (bodyKeys.length === 0) return true;

      const fieldRows = model.fields ?? [];
      if (fieldRows.length === 0) return true;

      const [policies, rows] = await Promise.all([
        this.prisma.sysDistributionPolicy.findMany({
          where: { modelId: model.id },
          select: { fieldId: true, editable: true },
        }),
        this.prisma.$queryRawUnsafe<Array<{ id: string; master_id: string }>>(
          `SELECT id, master_id FROM biz."${model.tableName}" WHERE id = $1::uuid`,
          recordId,
        ),
      ]);
      if (!rows[0]) return true;
      if (rows[0].master_id === rows[0].id) return true;

      const editableSet = new Set(
        policies.filter((p) => p.editable).map((p) => p.fieldId),
      );
      const fieldByCol = new Map(fieldRows.map((f) => [f.columnName, f]));

      for (const key of bodyKeys) {
        const f = fieldByCol.get(key);
        if (!f) continue;
        if (!editableSet.has(f.id)) {
          throw new BusinessException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            ErrorCodes.FIELD_READONLY_BY_MASTER,
            JSON.stringify({ fieldName: f.name }),
          );
        }
      }
    }

    if (method === 'DELETE' && recordId) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; master_id: string }>>(
        `SELECT id, master_id FROM biz."${model.tableName}" WHERE id = $1::uuid`,
        recordId,
      );
      if (rows[0] && rows[0].master_id !== rows[0].id) {
        throw new BusinessException(
          HttpStatus.FORBIDDEN,
          ErrorCodes.CANNOT_DELETE_COPY,
          '',
        );
      }
    }

    return true;
  }

  private isMasterCreatePath(req: any): boolean {
    const routePath: string | undefined = req.route?.path;
    if (!routePath) return true;
    return /\/data$/.test(routePath) || /\/data\/batch$/.test(routePath);
  }

  private isRecordUpdatePath(req: any): boolean {
    const routePath: string | undefined = req.route?.path;
    if (!routePath) return true;
    if (/\/:id\/(archive|status|sync)/.test(routePath)) return false;
    return /\/:id$/.test(routePath);
  }

  private async isRootOrg(orgId: string | undefined | null): Promise<boolean> {
    if (!orgId) return false;
    const org = await this.prisma.sysOrganization.findUnique({ where: { id: orgId } });
    return !!org && org.parentId === null;
  }
}
