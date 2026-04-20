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
      select: { id: true, dataScope: true, tableName: true },
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
    // Rules 2 and 3 come in B2/B3 tasks
    return true;
  }

  private isMasterCreatePath(req: any): boolean {
    const routePath: string | undefined = req.route?.path;
    if (!routePath) return true; // fallback (tests without express route): assume bare create
    return /\/data$/.test(routePath) || /\/data\/batch$/.test(routePath);
  }

  private async isRootOrg(orgId: string | undefined | null): Promise<boolean> {
    if (!orgId) return false;
    const org = await this.prisma.sysOrganization.findUnique({ where: { id: orgId } });
    return !!org && org.parentId === null;
  }
}
