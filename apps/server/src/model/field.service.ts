import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { SYSTEM_FIELDS, REFERENCE_FIELD_TYPES, isVirtualFieldType } from '@openforge/shared';
import { CreateFieldDto } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';
import { DdlManagerService } from './ddl-manager.service';

@Injectable()
export class FieldService {
  private readonly logger = new Logger(FieldService.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(DdlManagerService) private ddlManager: DdlManagerService,
  ) {}

  /**
   * Resolve which physical table a field belongs to (entity table or model table).
   */
  private async resolveTableName(field: { modelId: string; entityId?: string | null }): Promise<string | null> {
    if (field.entityId) {
      const entity = await this.prisma.sysEntity.findUnique({ where: { id: field.entityId } });
      if (entity) return entity.tableName;
    }
    const model = await this.prisma.sysModel.findUnique({ where: { id: field.modelId } });
    return model?.tableName ?? null;
  }

  /**
   * 查询模型下的所有字段（仅返回未删除的）
   * ENUM/MULTI_ENUM 字段如果配置了 dictCode，会自动从数据字典解析 choices
   */
  async findByModelId(modelId: string) {
    const fields = await this.prisma.sysField.findMany({
      where: { modelId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return this.resolveDictChoices(fields);
  }

  /**
   * 将 ENUM/MULTI_ENUM 字段的 dictCode 解析为 choices（运行时填充）
   */
  private async resolveDictChoices(fields: any[]) {
    const enumFields = fields.filter(
      (f) =>
        (f.fieldType === 'ENUM' || f.fieldType === 'MULTI_ENUM') &&
        f.options?.dictCode,
    );
    if (enumFields.length === 0) return fields;

    const dictCodes = [
      ...new Set(enumFields.map((f) => f.options.dictCode)),
    ];
    const dicts = await this.prisma.sysDict.findMany({
      where: { code: { in: dictCodes } },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    const dictMap = new Map(dicts.map((d) => [d.code, d.items]));

    return fields.map((f) => {
      if (
        (f.fieldType === 'ENUM' || f.fieldType === 'MULTI_ENUM') &&
        f.options?.dictCode
      ) {
        const items = dictMap.get(f.options.dictCode) || [];
        return {
          ...f,
          options: {
            ...f.options,
            choices: items.map((i) => ({
              value: i.value,
              label: i.label,
              labelEn: i.labelEn,
              color: i.color,
            })),
          },
        };
      }
      return f;
    });
  }

  /**
   * 按 ID 查找字段，不存在则抛异常
   */
  async findById(id: string) {
    const field = await this.prisma.sysField.findUnique({ where: { id } });
    if (!field) {
      throw new BusinessException(404, ErrorCodes.FIELD_NOT_FOUND, `Field '${id}' not found`);
    }
    return field;
  }

  /**
   * Setup MULTI_REFERENCE: create junction table + reverse field on target model.
   */
  private async setupMultiReference(modelId: string, fieldId: string, dto: CreateFieldDto) {
    const targetModelId = dto.options?.targetModelId;
    if (!targetModelId) {
      throw new BusinessException(400, ErrorCodes.M2M_INVALID_TARGET, 'MULTI_REFERENCE requires targetModelId in options');
    }

    const [sourceModel, targetModel] = await Promise.all([
      this.prisma.sysModel.findUnique({ where: { id: modelId } }),
      this.prisma.sysModel.findUnique({ where: { id: targetModelId } }),
    ]);
    if (!sourceModel) throw new BusinessException(400, ErrorCodes.M2M_INVALID_TARGET, 'Source model not found');
    if (!targetModel) throw new BusinessException(400, ErrorCodes.M2M_INVALID_TARGET, `Target model '${targetModelId}' not found`);

    const relTableName = `${sourceModel.tableName}_${targetModel.tableName}_rel`;
    await this.ddlManager.createJunctionTable(relTableName);

    const reverseField = await this.prisma.sysField.create({
      data: {
        modelId: targetModelId,
        name: sourceModel.name,
        columnName: `${sourceModel.code}_rel`,
        fieldType: 'MULTI_REFERENCE',
        isSystem: false,
        isRequired: false,
        isUnique: false,
        sortOrder: 0,
        options: {
          targetModelId: modelId,
          relTableName,
          reverseFieldId: fieldId,
          targetDisplayField: dto.options?.targetDisplayField ?? 'name',
        },
      },
    });

    await this.prisma.sysField.update({
      where: { id: fieldId },
      data: {
        options: {
          ...(dto.options ?? {}),
          relTableName,
          reverseFieldId: reverseField.id,
        },
      },
    });

    this.logger.log(`MULTI_REFERENCE: junction biz.${relTableName}, reverse field ${reverseField.id}`);
  }

  /**
   * 新建字段（元数据 + 即时 DDL）
   */
  async create(modelId: string, dto: CreateFieldDto) {
    // 验证模型存在
    const model = await this.prisma.sysModel.findUnique({ where: { id: modelId } });
    if (!model) {
      throw new BusinessException(404, ErrorCodes.MODEL_NOT_FOUND, `Model '${modelId}' not found`);
    }

    // 检查是否与系统字段冲突
    if ((SYSTEM_FIELDS as readonly string[]).includes(dto.columnName)) {
      throw new BusinessException(
        409,
        ErrorCodes.FIELD_COLUMN_NAME_EXISTS,
        `Column name '${dto.columnName}' conflicts with a system field`,
      );
    }

    // 检查 columnName 在该模型中是否唯一（排除已删除字段）
    const existing = await this.prisma.sysField.findFirst({
      where: {
        modelId,
        columnName: dto.columnName,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new BusinessException(
        409,
        ErrorCodes.FIELD_COLUMN_NAME_EXISTS,
        `Column name '${dto.columnName}' already exists in this model`,
      );
    }

    // Entity fields cannot use MULTI_REFERENCE
    if (dto.entityId && dto.fieldType === 'MULTI_REFERENCE') {
      throw new BusinessException(
        400,
        ErrorCodes.FIELD_TYPE_NOT_ALLOWED_IN_ENTITY,
        'MULTI_REFERENCE is not allowed on entity (sub-table) fields',
      );
    }

    // 如果未指定 sortOrder，自动排到末尾
    let sortOrder = dto.sortOrder;
    if (sortOrder === undefined || sortOrder === null) {
      const maxField = await this.prisma.sysField.findFirst({
        where: { modelId, deletedAt: null },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      sortOrder = (maxField?.sortOrder ?? -1) + 1;
    }

    const field = await this.prisma.sysField.create({
      data: {
        modelId,
        name: dto.name,
        columnName: dto.columnName,
        fieldType: dto.fieldType,
        isRequired: dto.isRequired ?? false,
        isUnique: dto.isUnique ?? false,
        defaultValue: dto.defaultValue ?? undefined,
        options: dto.options ?? undefined,
        sortOrder,
        entityId: dto.entityId || null,
      },
    });

    // MULTI_REFERENCE: create junction table + reverse field
    if (dto.fieldType === 'MULTI_REFERENCE') {
      await this.setupMultiReference(modelId, field.id, dto);
    }

    const isVirtual = isVirtualFieldType(dto.fieldType);

    // Determine which physical table to alter: entity table or model table
    const ddlTableName = dto.entityId
      ? (await this.resolveTableName({ modelId, entityId: dto.entityId })) ?? model.tableName
      : model.tableName;

    if (!isVirtual) {
      // Apply DDL immediately — physical fields only
      await this.ddlManager.addColumn(
        ddlTableName,
        dto.columnName,
        dto.fieldType,
        dto.options,
      );
      if (REFERENCE_FIELD_TYPES.includes(dto.fieldType as any)) {
        await this.ddlManager.createForeignKeyIndex(
          ddlTableName,
          dto.columnName,
        );
      }
      if (dto.isUnique) {
        await this.ddlManager.syncUniqueIndex(
          ddlTableName,
          dto.columnName,
          true,
          model.dataScope,
        );
      }
      this.logger.log(
        `DDL: added column ${dto.columnName} to biz.${ddlTableName}`,
      );
    } else {
      this.logger.log(
        `Virtual field ${dto.columnName} (${dto.fieldType}) created — no DDL`,
      );
    }

    return field;
  }

  /**
   * Count NULL values for a field in biz table.
   */
  async getNullCount(id: string): Promise<{ nullCount: number }> {
    const field = await this.findById(id);
    const ddlTable = await this.resolveTableName(field);
    if (!ddlTable) return { nullCount: 0 };
    const nullCount = await this.ddlManager.countNulls(ddlTable, field.columnName);
    return { nullCount };
  }

  /**
   * 更新字段（fieldType 和 columnName 不可变）
   */
  async update(id: string, dto: UpdateFieldDto) {
    const field = await this.findById(id);

    // 系统字段不允许修改 isRequired / isUnique
    if (field.isSystem) {
      if (dto.isRequired !== undefined || dto.isUnique !== undefined) {
        throw new BusinessException(
          403,
          ErrorCodes.FIELD_IS_SYSTEM,
          `System field '${field.columnName}' cannot be modified`,
        );
      }
    }

    const updated = await this.prisma.sysField.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isRequired !== undefined && { isRequired: dto.isRequired }),
        ...(dto.isUnique !== undefined && { isUnique: dto.isUnique }),
        ...(dto.defaultValue !== undefined && { defaultValue: dto.defaultValue }),
        ...(dto.options !== undefined && { options: dto.options }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });

    // If isRequired changed, sync NOT NULL constraint
    if (dto.isRequired !== undefined && dto.isRequired !== field.isRequired) {
      const ddlTable = await this.resolveTableName(field);
      if (ddlTable) {
        if (dto.isRequired) {
          const nullCount = await this.ddlManager.countNulls(ddlTable, field.columnName);
          if (nullCount > 0) {
            if (dto.backfillValue === undefined || dto.backfillValue === null || dto.backfillValue === '') {
              // No backfill value provided — revert metadata and report null count
              await this.prisma.sysField.update({
                where: { id },
                data: { isRequired: false },
              });
              throw new BusinessException(
                400,
                ErrorCodes.FIELD_HAS_NULL_DATA,
                `Column '${field.columnName}' has ${nullCount} NULL rows`,
                { nullCount },
              );
            }
            // Backfill NULL rows then SET NOT NULL
            const filled = await this.ddlManager.backfillNulls(ddlTable, field.columnName, dto.backfillValue);
            this.logger.log(`DDL: backfilled ${filled} NULL rows in ${field.columnName} of biz.${ddlTable}`);
          }
        }
        await this.ddlManager.syncNotNull(ddlTable, field.columnName, dto.isRequired);
        this.logger.log(
          `DDL: ${dto.isRequired ? 'SET' : 'DROP'} NOT NULL on ${field.columnName} in biz.${ddlTable}`,
        );
      }
    }

    // If isUnique changed, sync the unique index immediately
    if (dto.isUnique !== undefined && dto.isUnique !== field.isUnique) {
      const ddlTable = await this.resolveTableName(field);
      const model = await this.prisma.sysModel.findUnique({ where: { id: field.modelId } });
      if (ddlTable) {
        await this.ddlManager.syncUniqueIndex(
          ddlTable,
          field.columnName,
          dto.isUnique,
          model?.dataScope || 'shared',
        );
        this.logger.log(
          `DDL: ${dto.isUnique ? 'created' : 'dropped'} unique index on ${field.columnName} in biz.${ddlTable}`,
        );
      }
    }

    return updated;
  }

  /**
   * 硬删除字段 — 删除元数据记录 + drop 物理列
   */
  async delete(id: string) {
    const field = await this.findById(id);

    if (field.isSystem) {
      throw new BusinessException(
        403,
        ErrorCodes.FIELD_IS_SYSTEM,
        `System field '${field.columnName}' cannot be deleted`,
      );
    }

    // MULTI_REFERENCE: drop junction table and delete reverse field
    if (field.fieldType === 'MULTI_REFERENCE') {
      const options = field.options as any;
      if (options?.relTableName) await this.ddlManager.dropJunctionTable(options.relTableName);
      if (options?.reverseFieldId) await this.prisma.sysField.delete({ where: { id: options.reverseFieldId } }).catch(() => {});
    }

    // Delete metadata record first (orphaned columns are benign; orphaned metadata pointing to missing columns is problematic)
    await this.prisma.sysField.delete({ where: { id } });

    // Then drop the physical column — skip for virtual fields
    const isVirtual = isVirtualFieldType(field.fieldType);
    const ddlTable = await this.resolveTableName(field);
    if (ddlTable && !isVirtual) {
      if (field.isUnique) {
        const model = await this.prisma.sysModel.findUnique({ where: { id: field.modelId } });
        await this.ddlManager.syncUniqueIndex(
          ddlTable,
          field.columnName,
          false,
          model?.dataScope || 'shared',
        );
      }
      await this.ddlManager.dropColumn(ddlTable, field.columnName);
      this.logger.log(
        `DDL: dropped column ${field.columnName} from biz.${ddlTable}`,
      );
    }
  }

  /**
   * 批量更新排序
   */
  async updateSort(modelId: string, items: Array<{ id: string; sortOrder: number }>) {
    // 验证所有字段都属于该模型
    const fieldIds = items.map((item) => item.id);
    const fields = await this.prisma.sysField.findMany({
      where: {
        id: { in: fieldIds },
        modelId,
        deletedAt: null,
      },
      select: { id: true },
    });

    const foundIds = new Set(fields.map((f) => f.id));
    const invalidIds = fieldIds.filter((fid) => !foundIds.has(fid));
    if (invalidIds.length > 0) {
      throw new BusinessException(
        404,
        ErrorCodes.FIELD_NOT_FOUND,
        `Fields not found or not belonging to this model: ${invalidIds.join(', ')}`,
      );
    }

    // 事务批量更新
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.sysField.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    return { success: true };
  }

}
