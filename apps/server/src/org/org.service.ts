import { Injectable, ConflictException, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../event-bus/event-bus.service';
import { OrgCreatedEvent } from '../event-bus/events';
import { CreateOrgDto } from './dto/create-org.dto';
import { UpdateOrgDto } from './dto/update-org.dto';

export interface OrgQueryParams {
  keyword?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class OrgService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventBusService) private eventBus: EventBusService,
  ) {}

  async findAll(params: OrgQueryParams = {}) {
    const { keyword, status, page = 1, pageSize = 20 } = params;
    const baseWhere: Record<string, unknown> = {};
    const where: Record<string, unknown> = {};

    if (keyword) {
      const keywordFilter = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { code: { contains: keyword, mode: 'insensitive' } },
      ];
      baseWhere.OR = keywordFilter;
      where.OR = keywordFilter;
    }
    if (status) {
      where.status = status;
    }

    const [data, total, allCount, activeCount, disabledCount] = await Promise.all([
      this.prisma.sysOrganization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sysOrganization.count({ where }),
      this.prisma.sysOrganization.count({ where: baseWhere }),
      this.prisma.sysOrganization.count({ where: { ...baseWhere, status: 'active' } }),
      this.prisma.sysOrganization.count({ where: { ...baseWhere, status: 'disabled' } }),
    ]);

    return { data, total, page, pageSize, counts: { all: allCount, active: activeCount, disabled: disabledCount } };
  }

  async findById(id: string) {
    const org = await this.prisma.sysOrganization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async findTree() {
    const orgs = await this.prisma.sysOrganization.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return this.buildTree(orgs);
  }

  async create(dto: CreateOrgDto, userId: string) {
    const existing = await this.prisma.sysOrganization.findUnique({
      where: { code: dto.code },
    });
    if (existing) throw new ConflictException('Organization code already exists');

    const org = await this.prisma.sysOrganization.create({
      data: {
        name: dto.name,
        code: dto.code,
        parentId: dto.parentId || null,
      },
    });

    this.eventBus.emit('org.created', new OrgCreatedEvent(
      { id: org.id, code: org.code },
      userId,
      org.id,
    ));

    const autoDistributeModels: Array<{
      appCode: string;
      modelCode: string;
      modelName: string;
      pendingCount: number;
    }> = [];

    // Only compute pending allocation for non-root orgs (root is the source, not a target)
    if (org.parentId !== null) {
      const candidates = await this.prisma.sysModel.findMany({
        where: { autoDistribute: true, dataScope: 'distributed' },
        select: {
          code: true,
          name: true,
          tableName: true,
          app: { select: { code: true } },
        },
      });
      const counts = await Promise.all(
        candidates.map((m) =>
          this.prisma
            .$queryRawUnsafe<Array<{ c: bigint }>>(
              `SELECT COUNT(*)::int AS c FROM biz."${m.tableName}" WHERE master_id = id AND is_archived = false`,
            )
            .then((rows) => Number(rows[0]?.c ?? 0))
            .catch(() => 0),
        ),
      );
      candidates.forEach((m, i) => {
        if (counts[i] > 0) {
          autoDistributeModels.push({
            appCode: m.app.code,
            modelCode: m.code,
            modelName: m.name,
            pendingCount: counts[i],
          });
        }
      });
    }

    return { org, autoDistributeModels };
  }

  async update(id: string, dto: UpdateOrgDto) {
    await this.findById(id);
    return this.prisma.sysOrganization.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    await this.findById(id);

    const hasChildren = await this.prisma.sysOrganization.count({
      where: { parentId: id },
    });
    if (hasChildren > 0) {
      throw new ConflictException('该组织下有子组织，无法删除。请先删除子组织');
    }

    const hasUsers = await this.prisma.sysUserOrg.count({
      where: { orgId: id },
    });
    if (hasUsers > 0) {
      throw new ConflictException('该组织下有用户，无法删除。请先移除用户或禁用该组织');
    }

    return this.prisma.sysOrganization.delete({ where: { id } });
  }

  async findChildren(parentId: string | null, keyword?: string) {
    const where: Record<string, unknown> = {};
    if (parentId) {
      where.parentId = parentId;
    } else {
      where.parentId = null;
    }
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { code: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const orgs = await this.prisma.sysOrganization.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    // Attach hasChildren flag
    const ids = orgs.map((o) => o.id);
    let countMap = new Map<string, number>();
    if (ids.length > 0) {
      const childCounts = await this.prisma.sysOrganization.groupBy({
        by: ['parentId'],
        where: { parentId: { in: ids } },
        _count: true,
      });
      countMap = new Map(childCounts.map((c) => [c.parentId!, c._count]));
    }

    return orgs.map((o) => ({
      ...o,
      __hasChildren: (countMap.get(o.id) ?? 0) > 0,
    }));
  }

  async getAccessibleOrgs(userId: string, isAdmin: boolean) {
    if (isAdmin) {
      return this.prisma.sysOrganization.findMany({
        orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
      });
    }
    const links = await this.prisma.sysUserOrg.findMany({
      where: { userId },
      select: { orgId: true },
    });
    const ids = links.map((l: { orgId: string }) => l.orgId);
    if (ids.length === 0) return [];
    return this.prisma.sysOrganization.findMany({
      where: { id: { in: ids } },
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    });
  }

  private buildTree(orgs: any[], parentId: string | null = null): any[] {
    return orgs
      .filter((o) => o.parentId === parentId)
      .map((o) => ({
        ...o,
        children: this.buildTree(orgs, o.id),
      }));
  }
}
