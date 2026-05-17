import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { AssigneeConfig, AssigneeStrategy } from './types';

/**
 * 节点 assignee 解析上下文。
 *
 * - record: 当前业务记录数据（带所有字段 columnName）
 * - submitter: 触发审批流的提交人
 * - instance: 工作流实例（id 是稳定主键，其他字段在后续阶段使用）
 */
export interface ResolveContext {
  record: Record<string, any>;
  submitter: { userId: string; orgId: string };
  instance: { id: string; [k: string]: any };
}

@Injectable()
export class AssigneeResolverService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async resolve(
    strategy: AssigneeStrategy,
    config: AssigneeConfig,
    ctx: ResolveContext,
  ): Promise<string[]> {
    let userIds: string[] = [];
    switch (strategy) {
      case 'fixed':
        userIds = config.userIds ?? [];
        break;
      case 'role':
        userIds = await this.fromRoles(config.roleIds ?? []);
        break;
      case 'org':
        userIds = await this.fromOrgs(config.orgIds ?? [], !!config.includeChildren);
        break;
      case 'submitterUpline':
        userIds = await this.fromSubmitterUpline(ctx.submitter, config.upLevel ?? 1);
        break;
      case 'userField':
        userIds = this.fromUserField(ctx.record, config.fieldColumnName ?? '');
        break;
      case 'orgField':
        userIds = await this.fromOrgField(
          ctx.record,
          config.fieldColumnName ?? '',
          config.orgRole ?? 'members',
        );
        break;
      default:
        throw new BusinessException(
          400,
          ErrorCodes.WORKFLOW_INVALID_DEFINITION,
          `Unknown assignee strategy: ${strategy}`,
        );
    }
    return Array.from(new Set(userIds.filter((u) => !!u)));
  }

  private async fromRoles(roleIds: string[]): Promise<string[]> {
    if (!roleIds.length) return [];
    const rows = await this.prisma.sysUserRole.findMany({
      where: { roleId: { in: roleIds } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  private async fromOrgs(orgIds: string[], includeChildren: boolean): Promise<string[]> {
    if (!orgIds.length) return [];
    let allOrgIds = orgIds;
    if (includeChildren) {
      const cte = `
        WITH RECURSIVE org_tree AS (
          SELECT id FROM public.sys_organization WHERE id = ANY($1::uuid[])
          UNION ALL
          SELECT o.id FROM public.sys_organization o
          JOIN org_tree t ON o.parent_id = t.id
        )
        SELECT id FROM org_tree
      `;
      const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(cte, orgIds);
      allOrgIds = rows.map((r) => r.id);
    }
    const userOrgs = await this.prisma.sysUserOrg.findMany({
      where: { orgId: { in: allOrgIds } },
      select: { userId: true },
    });
    return userOrgs.map((r) => r.userId);
  }

  private async fromSubmitterUpline(
    submitter: { userId: string; orgId: string },
    upLevel: number,
  ): Promise<string[]> {
    let currentOrgId: string | null = submitter.orgId;
    for (let i = 0; i < upLevel; i++) {
      if (!currentOrgId) break;
      const org = await this.prisma.sysOrganization.findUnique({
        where: { id: currentOrgId },
        select: { parentId: true },
      });
      currentOrgId = org?.parentId ?? null;
    }
    if (!currentOrgId) return [];
    const rows = await this.prisma.sysUserOrg.findMany({
      where: { orgId: currentOrgId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  private fromUserField(record: Record<string, any>, fieldColumnName: string): string[] {
    void record;
    void fieldColumnName;
    return [];
  }

  private async fromOrgField(
    record: Record<string, any>,
    fieldColumnName: string,
    orgRole: 'members' | 'leader',
  ): Promise<string[]> {
    void record;
    void fieldColumnName;
    void orgRole;
    return [];
  }
}
