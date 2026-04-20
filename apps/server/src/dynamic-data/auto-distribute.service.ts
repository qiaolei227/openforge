import { Injectable, HttpStatus, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DistributionService } from './distribution.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';

interface UserCtx {
  userId: string;
  orgId: string;
  isAdmin: boolean;
}

interface ModelCtx {
  id: string;
  autoDistribute: boolean;
  dataScope: string;
  appCode: string;
  modelCode: string;
}

@Injectable()
export class AutoDistributeService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DistributionService) private readonly distribution: DistributionService,
  ) {}

  /**
   * Called right after a master record is created.
   * If the model has autoDistribute=true and dataScope='distributed',
   * auto-allocates the new record to all non-root orgs.
   * Best-effort: errors are swallowed so the master create always succeeds.
   */
  async onMasterCreated(model: ModelCtx, recordId: string, user: UserCtx): Promise<void> {
    if (!model.autoDistribute || model.dataScope !== 'distributed') return;
    try {
      const orgs = await this.prisma.sysOrganization.findMany({
        where: { parentId: { not: null } },
        select: { id: true },
      });
      if (orgs.length === 0) return;
      await this.distribution.applyChanges(model.appCode, model.modelCode, {
        user,
        recordIds: [recordId],
        changes: orgs.map((o) => ({ orgId: o.id, action: 'allocate' as const })),
      });
    } catch {
      // best-effort: never block master create
    }
  }

  /**
   * Called from the "立即补齐" button. Iterates all active master records
   * and allocates to any orgs that are missing a copy.
   */
  async fillMissing(
    appCode: string,
    modelCode: string,
    user: UserCtx,
  ): Promise<{ created: number; skipped: number }> {
    const model = await this.prisma.sysModel.findFirst({
      where: { code: modelCode, app: { code: appCode } },
      select: { id: true, dataScope: true, tableName: true },
    });

    if (!model || model.dataScope !== 'distributed') {
      throw new BusinessException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCodes.MODEL_NOT_DISTRIBUTED,
        '',
      );
    }

    const nonRootOrgs = await this.prisma.sysOrganization.findMany({
      where: { parentId: { not: null } },
      select: { id: true },
    });
    if (nonRootOrgs.length === 0) return { created: 0, skipped: 0 };

    const masters = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM biz."${model.tableName}" WHERE master_id = id AND is_archived = false`,
    );

    const masterIds = masters.map((m) => m.id);
    if (masterIds.length === 0) return { created: 0, skipped: 0 };

    const statusByMaster = await this.distribution.getDistributionStatus(
      appCode,
      modelCode,
      masterIds,
    );

    let created = 0;
    let skipped = 0;
    for (const master of masters) {
      const allocated = new Set(
        (statusByMaster[master.id] ?? [])
          .filter((c: any) => !c.isArchived)
          .map((c: any) => c.orgId),
      );
      const missing = nonRootOrgs.filter((o) => !allocated.has(o.id));
      if (missing.length === 0) {
        skipped++;
        continue;
      }
      const res = await this.distribution.applyChanges(appCode, modelCode, {
        user,
        recordIds: [master.id],
        changes: missing.map((o) => ({ orgId: o.id, action: 'allocate' as const })),
      });
      created += res.summary.succeeded;
    }

    return { created, skipped };
  }
}
