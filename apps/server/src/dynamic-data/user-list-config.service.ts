import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { parseEntityField } from './filter-entity-field';

@Injectable()
export class UserListConfigService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async get(userId: string, modelId: string) {
    const row = await this.prisma.sysUserListConfig.findUnique({
      where: { userId_modelId: { userId, modelId } },
    });
    return row?.config ?? {};
  }

  async upsert(userId: string, modelId: string, config: Record<string, any>) {
    this.validateColumns(config);
    await this.prisma.sysUserListConfig.upsert({
      where: { userId_modelId: { userId, modelId } },
      create: { userId, modelId, config },
      update: { config },
    });
    return config;
  }

  async remove(userId: string, modelId: string) {
    await this.prisma.sysUserListConfig.deleteMany({
      where: { userId, modelId },
    });
  }

  /** Enforce: all `__detail__{code}__*` entries must share the same entityCode. */
  private validateColumns(config: Record<string, any>) {
    const columns = config?.columns;
    if (!Array.isArray(columns) || columns.length === 0) return;
    const detailCodes = new Set<string>();
    for (const key of columns) {
      if (typeof key !== 'string') continue;
      const parsed = parseEntityField(key);
      if (parsed.kind === 'detail') detailCodes.add(parsed.entityCode!);
    }
    if (detailCodes.size > 1) {
      throw new BusinessException(
        400,
        ErrorCodes.DATA_VALIDATION_FAILED,
        'Only one detail entity can be expanded at a time',
      );
    }
  }
}
