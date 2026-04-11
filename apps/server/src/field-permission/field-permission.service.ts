import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import type { UpsertFieldPermissionDto } from './dto/upsert-field-permission.dto';

@Injectable()
export class FieldPermissionService {
  // Explicit @Inject required for esbuild/Vitest metadata workaround.
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async list(roleId: string, modelId: string) {
    return this.prisma.sysFieldPermission.findMany({
      where: { roleId, modelId },
      select: { id: true, roleId: true, modelId: true, fieldId: true, access: true },
    });
  }

  async upsert(dto: UpsertFieldPermissionDto) {
    const field = await this.prisma.sysField.findUnique({
      where: { id: dto.fieldId },
      select: { id: true, modelId: true, isSystem: true },
    });
    if (!field) {
      throw new BusinessException(404, ErrorCodes.FIELD_NOT_FOUND, 'Field not found');
    }
    if (field.isSystem) {
      throw new BusinessException(
        400,
        ErrorCodes.FIELD_IS_SYSTEM,
        'Cannot set permission on system field',
      );
    }

    // editable = restore to default, delete any existing row
    if (dto.access === 'editable') {
      await this.prisma.sysFieldPermission.deleteMany({
        where: { roleId: dto.roleId, fieldId: dto.fieldId },
      });
      return { roleId: dto.roleId, fieldId: dto.fieldId, access: 'editable' };
    }

    return this.prisma.sysFieldPermission.upsert({
      where: { roleId_fieldId: { roleId: dto.roleId, fieldId: dto.fieldId } },
      create: {
        roleId: dto.roleId,
        modelId: field.modelId,
        fieldId: dto.fieldId,
        access: dto.access,
      },
      update: { access: dto.access },
    });
  }

  async delete(roleId: string, fieldId: string) {
    await this.prisma.sysFieldPermission.deleteMany({
      where: { roleId, fieldId },
    });
  }
}
