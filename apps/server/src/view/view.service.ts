import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { CreateViewDto } from './dto/create-view.dto';
import { UpdateViewDto } from './dto/update-view.dto';

@Injectable()
export class ViewService {
  private readonly logger = new Logger(ViewService.name);

  constructor(private prisma: PrismaService) {}

  async findByModel(modelId: string) {
    return this.prisma.sysView.findMany({
      where: { modelId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string) {
    const view = await this.prisma.sysView.findUnique({ where: { id } });
    if (!view) {
      throw new BusinessException(404, ErrorCodes.VIEW_NOT_FOUND, `View '${id}' not found`);
    }
    return view;
  }

  async create(modelId: string, dto: CreateViewDto) {
    // First view of its type for this model becomes the default
    const existing = await this.prisma.sysView.findFirst({
      where: { modelId, type: dto.type },
    });

    return this.prisma.sysView.create({
      data: {
        modelId,
        name: dto.name,
        type: dto.type,
        layout: dto.layout,
        config: dto.config ?? undefined,
        isDefault: !existing,
      },
    });
  }

  async setDefault(id: string) {
    const view = await this.findById(id);

    // Unset current default of same (modelId, type)
    await this.prisma.sysView.updateMany({
      where: { modelId: view.modelId, type: view.type, isDefault: true },
      data: { isDefault: false },
    });

    // Set this one as default
    return this.prisma.sysView.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  async update(id: string, dto: UpdateViewDto) {
    await this.findById(id);
    return this.prisma.sysView.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.layout !== undefined && { layout: dto.layout }),
        ...(dto.config !== undefined && { config: dto.config }),
      },
    });
  }

  async delete(id: string) {
    const view = await this.findById(id);
    await this.prisma.sysView.delete({ where: { id } });

    // If deleted view was default, promote the next one of same type
    if (view.isDefault) {
      const next = await this.prisma.sysView.findFirst({
        where: { modelId: view.modelId, type: view.type },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await this.prisma.sysView.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  }
}
