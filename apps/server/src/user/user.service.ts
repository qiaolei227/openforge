import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../event-bus/event-bus.service';
import { UserCreatedEvent } from '../event-bus/events';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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
          createdAt: true,
          updatedAt: true,
          userOrgs: {
            include: { org: { select: { id: true, name: true, code: true } } },
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
        createdAt: true,
        updatedAt: true,
        userOrgs: {
          include: { org: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, currentUserId: string) {
    const existing = await this.prisma.sysUser.findUnique({
      where: { username: dto.username },
    });
    if (existing) throw new ConflictException('Username already exists');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.sysUser.create({
      data: {
        username: dto.username,
        passwordHash,
        displayName: dto.displayName,
        email: dto.email,
        phone: dto.phone,
        userOrgs: {
          create: {
            orgId: dto.orgId,
            isDefault: true,
          },
        },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
      },
    });

    this.eventBus.emit('user.created', new UserCreatedEvent(
      { id: user.id, username: user.username },
      currentUserId,
      dto.orgId,
    ));

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.findById(id);
    if (user.username === 'admin') {
      throw new ConflictException('系统管理员账号不可修改');
    }
    return this.prisma.sysUser.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        phone: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  async delete(id: string) {
    const user = await this.findById(id);
    if (user.username === 'admin') {
      throw new ConflictException('系统管理员账号不可删除');
    }
    return this.prisma.sysUser.delete({ where: { id } });
  }
}
