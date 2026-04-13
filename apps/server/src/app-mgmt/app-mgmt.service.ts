import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { CreateAppDto } from './dto/create-app.dto';
import { UpdateAppDto } from './dto/update-app.dto';

export interface AppQueryParams {
  keyword?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class AppMgmtService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: AppQueryParams = {}) {
    const { keyword, page = 1, pageSize = 20 } = params;
    const where: Record<string, unknown> = {};

    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { code: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.sysApp.findMany({
        where,
        include: { _count: { select: { models: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sysApp.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
    };
  }

  async findById(id: string) {
    const app = await this.prisma.sysApp.findUnique({
      where: { id },
      include: { _count: { select: { models: true } } },
    });
    if (!app) {
      throw new BusinessException(404, ErrorCodes.APP_NOT_FOUND, `App '${id}' not found`);
    }
    return app;
  }

  async create(dto: CreateAppDto, createdBy?: string) {
    const existing = await this.prisma.sysApp.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BusinessException(409, ErrorCodes.APP_CODE_EXISTS, `App code '${dto.code}' already exists`);
    }

    return this.prisma.sysApp.create({
      data: {
        name: dto.name,
        code: dto.code,
        icon: dto.icon || null,
        description: dto.description || null,
        createdBy: createdBy ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateAppDto) {
    await this.findById(id);
    return this.prisma.sysApp.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    const app = await this.findById(id);

    if (app._count.models > 0) {
      throw new BusinessException(
        409,
        ErrorCodes.APP_HAS_MODELS,
        `App '${app.name}' has ${app._count.models} model(s), cannot delete`,
      );
    }

    return this.prisma.sysApp.delete({ where: { id } });
  }
}
