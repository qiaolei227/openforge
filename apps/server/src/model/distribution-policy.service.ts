import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';

@Injectable()
export class DistributionPolicyService {
  constructor(private prisma: PrismaService) {}

  async findByModelId(modelId: string) {
    const model = await this.prisma.sysModel.findUnique({ where: { id: modelId } });
    if (!model) {
      throw new BusinessException(404, ErrorCodes.MODEL_NOT_FOUND, 'Model not found');
    }
    if (model.dataScope !== 'distributed') {
      return [];
    }

    // Get all non-entity, non-deleted fields with their policy
    const fields = await this.prisma.sysField.findMany({
      where: { modelId, entityId: null, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { distributionPolicy: true },
    });

    return fields.map((f) => ({
      fieldId: f.id,
      fieldName: f.name,
      columnName: f.columnName,
      fieldType: f.fieldType,
      editable: f.distributionPolicy.length > 0 ? f.distributionPolicy[0].editable : false,
    }));
  }

  async batchUpdate(modelId: string, items: Array<{ fieldId: string; editable: boolean }>) {
    const model = await this.prisma.sysModel.findUnique({ where: { id: modelId } });
    if (!model) {
      throw new BusinessException(404, ErrorCodes.MODEL_NOT_FOUND, 'Model not found');
    }
    if (model.dataScope !== 'distributed') {
      throw new BusinessException(400, ErrorCodes.INVALID_OPERATION, 'Distribution policy is only available for distributed models');
    }

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.sysDistributionPolicy.upsert({
          where: { modelId_fieldId: { modelId, fieldId: item.fieldId } },
          update: { editable: item.editable },
          create: { modelId, fieldId: item.fieldId, editable: item.editable },
        }),
      ),
    );

    return this.findByModelId(modelId);
  }
}
