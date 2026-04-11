import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import type { CreateRoleDto } from './dto/create-role.dto';
import type { UpdateRoleDto } from './dto/update-role.dto';

interface ListParams {
  keyword?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class RoleService {
  // Explicit @Inject required for esbuild/Vitest metadata workaround.
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async list(params: ListParams) {
    const { keyword, page = 1, pageSize = 20 } = params;
    const where = keyword
      ? {
          OR: [
            { code: { contains: keyword, mode: 'insensitive' as const } },
            { name: { contains: keyword, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.sysRole.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sysRole.count({ where }),
    ]);

    // Aggregate user counts per role
    const withCounts = await Promise.all(
      items.map(async (role) => {
        const userCount = await this.prisma.sysUserRole.count({
          where: { roleId: role.id },
        });
        return { ...role, userCount };
      }),
    );

    return { items: withCounts, total };
  }

  async findById(id: string) {
    const role = await this.prisma.sysRole.findUnique({ where: { id } });
    if (!role) {
      throw new BusinessException(404, ErrorCodes.ROLE_NOT_FOUND, 'Role not found');
    }
    const userCount = await this.prisma.sysUserRole.count({ where: { roleId: id } });
    return { ...role, userCount };
  }

  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.sysRole.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new BusinessException(
        400, ErrorCodes.ROLE_CODE_DUPLICATE,
        `Role code "${dto.code}" already exists`,
      );
    }
    return this.prisma.sysRole.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.sysRole.findUnique({ where: { id } });
    if (!role) {
      throw new BusinessException(404, ErrorCodes.ROLE_NOT_FOUND, 'Role not found');
    }
    return this.prisma.sysRole.update({
      where: { id },
      data: {
        name: dto.name ?? role.name,
        description: dto.description ?? role.description,
      },
    });
  }

  async delete(id: string) {
    const role = await this.prisma.sysRole.findUnique({ where: { id } });
    if (!role) {
      throw new BusinessException(404, ErrorCodes.ROLE_NOT_FOUND, 'Role not found');
    }
    const userCount = await this.prisma.sysUserRole.count({ where: { roleId: id } });
    if (userCount > 0) {
      throw new BusinessException(
        400, ErrorCodes.ROLE_HAS_USERS,
        `Role is still bound to ${userCount} user(s); unbind first`,
      );
    }
    await this.prisma.sysRole.delete({ where: { id } });
  }
}
