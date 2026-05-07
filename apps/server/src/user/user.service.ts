import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../event-bus/event-bus.service';
import { UserCreatedEvent } from '../event-bus/events';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { SetUserRolesDto } from './dto/set-user-roles.dto';

export interface UserQueryParams {
  keyword?: string;
  status?: string;
  orgId?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  async findAll(params: UserQueryParams = {}) {
    const { keyword, status, orgId, page = 1, pageSize = 20 } = params;
    const baseWhere: Record<string, unknown> = {
      username: { not: 'admin' },
    };
    const where: Record<string, unknown> = {
      username: { not: 'admin' },
    };

    if (keyword) {
      const keywordFilter = [
        { username: { contains: keyword, mode: 'insensitive' } },
        { displayName: { contains: keyword, mode: 'insensitive' } },
      ];
      baseWhere.OR = keywordFilter;
      where.OR = keywordFilter;
    }
    if (status) {
      where.status = status;
    }
    if (orgId) {
      baseWhere.userOrgs = { some: { orgId } };
      where.userOrgs = { some: { orgId } };
    }

    const [data, total, allCount, activeCount, disabledCount] = await Promise.all([
      this.prisma.sysUser.findMany({
        where,
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          phone: true,
          avatar: true,
          status: true,
          identity: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          userOrgs: {
            include: { org: { select: { id: true, name: true, code: true } } },
          },
          userRoles: {
            include: { role: { select: { id: true, code: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sysUser.count({ where }),
      this.prisma.sysUser.count({ where: baseWhere }),
      this.prisma.sysUser.count({ where: { ...baseWhere, status: 'active' } }),
      this.prisma.sysUser.count({ where: { ...baseWhere, status: 'disabled' } }),
    ]);

    return { data, total, page, pageSize, counts: { all: allCount, active: activeCount, disabled: disabledCount } };
  }

  async findById(id: string) {
    const user = await this.prisma.sysUser.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        phone: true,
        avatar: true,
        status: true,
        identity: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        userOrgs: {
          include: { org: true },
        },
      },
    });
    if (!user) {
      throw new BusinessException(404, ErrorCodes.USER_NOT_FOUND, 'User not found');
    }
    return user;
  }

  async create(dto: CreateUserDto, currentUserId: string) {
    const organizationIds = Array.from(new Set(dto.organizationIds));
    if (!organizationIds.includes(dto.defaultOrgId)) {
      throw new BusinessException(
        422,
        ErrorCodes.USER_DEFAULT_ORG_NOT_IN_LIST,
        'defaultOrgId must be one of organizationIds',
      );
    }

    const orgs = await this.prisma.sysOrganization.findMany({
      where: { id: { in: organizationIds } },
      select: { id: true, isGroup: true },
    });
    if (orgs.length !== organizationIds.length) {
      throw new BusinessException(404, ErrorCodes.USER_ORG_NOT_FOUND, 'One or more organizations not found');
    }
    if (orgs.some((o) => o.isGroup)) {
      throw new BusinessException(
        422,
        ErrorCodes.USER_ORG_IS_GROUP,
        '用户不能归属于分组类型的组织',
      );
    }

    const existing = await this.prisma.sysUser.findUnique({
      where: { username: dto.username },
      select: { id: true },
    });
    if (existing) {
      throw new BusinessException(409, ErrorCodes.USERNAME_EXISTS, 'Username already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.sysUser.create({
      data: {
        username: dto.username,
        passwordHash,
        displayName: dto.displayName,
        email: dto.email,
        phone: dto.phone,
        identity: (dto.identity ?? 'user') as 'user' | 'designer' | 'admin',
        userOrgs: {
          create: organizationIds.map((orgId) => ({
            orgId,
            isDefault: orgId === dto.defaultOrgId,
          })),
        },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        phone: true,
        status: true,
        identity: true,
        createdAt: true,
      },
    });

    this.eventBus.emit(
      'user.created',
      new UserCreatedEvent(
        { id: user.id, username: user.username },
        currentUserId,
        dto.defaultOrgId,
      ),
    );

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.findById(id);
    if (user.username === 'admin') {
      throw new BusinessException(
        403,
        ErrorCodes.USER_CANNOT_MODIFY_ADMIN,
        '系统管理员账号不可修改',
      );
    }

    const { organizationIds, defaultOrgId, ...userData } = dto;
    const orgChangeRequested = organizationIds !== undefined || defaultOrgId !== undefined;

    let nextOrgIds: string[] | null = null;
    let nextDefaultOrgId: string | null = null;

    if (orgChangeRequested) {
      const currentOrgIds = user.userOrgs.map((uo) => uo.orgId);
      const currentDefaultOrgId =
        user.userOrgs.find((uo) => uo.isDefault)?.orgId ?? currentOrgIds[0];

      nextOrgIds = Array.from(new Set(organizationIds ?? currentOrgIds));
      nextDefaultOrgId = defaultOrgId ?? currentDefaultOrgId ?? null;

      if (nextOrgIds.length === 0) {
        throw new BusinessException(
          422,
          ErrorCodes.USER_ORG_NOT_FOUND,
          '用户必须至少归属一个组织',
        );
      }
      if (!nextDefaultOrgId || !nextOrgIds.includes(nextDefaultOrgId)) {
        throw new BusinessException(
          422,
          ErrorCodes.USER_DEFAULT_ORG_NOT_IN_LIST,
          'defaultOrgId must be one of organizationIds',
        );
      }

      const orgs = await this.prisma.sysOrganization.findMany({
        where: { id: { in: nextOrgIds } },
        select: { id: true, isGroup: true },
      });
      if (orgs.length !== nextOrgIds.length) {
        throw new BusinessException(404, ErrorCodes.USER_ORG_NOT_FOUND, 'One or more organizations not found');
      }
      if (orgs.some((o) => o.isGroup)) {
        throw new BusinessException(
          422,
          ErrorCodes.USER_ORG_IS_GROUP,
          '用户不能归属于分组类型的组织',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length > 0) {
        await tx.sysUser.update({
          where: { id },
          data: userData,
        });
      }
      if (nextOrgIds && nextDefaultOrgId) {
        const existing = await tx.sysUserOrg.findMany({
          where: { userId: id },
          select: { id: true, orgId: true, isDefault: true },
        });
        const existingByOrg = new Map(existing.map((uo) => [uo.orgId, uo]));
        const nextSet = new Set(nextOrgIds);

        const toDelete = existing.filter((uo) => !nextSet.has(uo.orgId)).map((uo) => uo.id);
        if (toDelete.length > 0) {
          await tx.sysUserOrg.deleteMany({ where: { id: { in: toDelete } } });
        }

        for (const orgId of nextOrgIds) {
          const shouldBeDefault = orgId === nextDefaultOrgId;
          const existingUo = existingByOrg.get(orgId);
          if (!existingUo) {
            await tx.sysUserOrg.create({
              data: { userId: id, orgId, isDefault: shouldBeDefault },
            });
          } else if (existingUo.isDefault !== shouldBeDefault) {
            await tx.sysUserOrg.update({
              where: { id: existingUo.id },
              data: { isDefault: shouldBeDefault },
            });
          }
        }
      }
    });

    return this.findById(id);
  }

  async delete(id: string) {
    const user = await this.findById(id);
    if (user.username === 'admin') {
      throw new BusinessException(
        403,
        ErrorCodes.USER_CANNOT_DELETE_ADMIN,
        '系统管理员账号不可删除',
      );
    }
    if (user.lastLoginAt) {
      throw new BusinessException(
        422,
        ErrorCodes.USER_CANNOT_DELETE_LOGGED_IN,
        '用户已登录过系统，不允许删除',
      );
    }
    return this.prisma.sysUser.delete({ where: { id } });
  }

  async setRoles(userId: string, dto: SetUserRolesDto) {
    const user = await this.prisma.sysUser.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BusinessException(404, ErrorCodes.USER_NOT_FOUND, 'User not found');
    }

    await this.prisma.$transaction([
      this.prisma.sysUserRole.deleteMany({ where: { userId } }),
      ...dto.roleIds.map((roleId) =>
        this.prisma.sysUserRole.create({
          data: { userId, roleId },
        }),
      ),
    ]);

    return this.getUserRoles(userId);
  }

  async getUserRoles(userId: string) {
    return this.prisma.sysUserRole.findMany({
      where: { userId },
      include: { role: { select: { id: true, code: true, name: true } } },
    });
  }
}
