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

    // Resolve display field for reverse side: first business field of the source model
    let reverseDisplayField = dto.options?.targetDisplayField;
    if (!reverseDisplayField) {
      const firstField = await this.prisma.sysField.findFirst({
        where: { modelId, isSystem: false, entityId: null, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { columnName: true },
      });
      reverseDisplayField = firstField?.columnName ?? 'id';
    }

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
          targetDisplayField: reverseDisplayField,
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
   * Hardcoded whitelists for USER/ORGANIZATION LOOKUP targets.
   * These are platform sys_user / sys_org columns — not user-defined.
   */
  private static readonly USER_LOOKUP_FIELDS: Record<string, string> = {
    name: 'STRING',
    username: 'STRING',
    email: 'STRING',
    phone: 'STRING',
    org_id: 'STRING',
    status: 'STRING',
  };

  private static readonly ORG_LOOKUP_FIELDS: Record<string, string> = {
    name: 'STRING',
    code: 'STRING',
    parent_id: 'STRING',
    path: 'STRING',
  };

  /** Field types that cannot be the target of a LOOKUP */
  private static readonly LOOKUP_TARGET_BLACKLIST = ['MULTI_REFERENCE', 'FILE', 'IMAGE', 'LOOKUP'] as const;

  /**
   * Validate LOOKUP options — shared between create and update.
   * Throws a BusinessException with the appropriate error code on any violation.
   */
  private async validateLookupOptions(params: {
    modelId: string;
    entityId?: string | null;
    options: { sourceFieldId?: string; targetFieldColumnName?: string } | null | undefined;
  }): Promise<void> {
    const { modelId, entityId, options } = params;

    if (!options?.sourceFieldId || !options?.targetFieldColumnName) {
      throw new BusinessException(
        400,
        ErrorCodes.LOOKUP_SOURCE_FIELD_NOT_FOUND,
        'LOOKUP requires options.sourceFieldId and options.targetFieldColumnName',
      );
    }

    const { sourceFieldId, targetFieldColumnName } = options;

    // Load the source field
    const sourceField = await this.prisma.sysField.findUnique({ where: { id: sourceFieldId } });
    if (!sourceField) {
      throw new BusinessException(
        400,
        ErrorCodes.LOOKUP_SOURCE_FIELD_NOT_FOUND,
        `Source field '${sourceFieldId}' not found`,
      );
    }

    // Validate source field type
    if (!(['REFERENCE', 'USER', 'ORGANIZATION'] as string[]).includes(sourceField.fieldType)) {
      throw new BusinessException(
        400,
        ErrorCodes.LOOKUP_SOURCE_TYPE_INVALID,
        `Source field type '${sourceField.fieldType}' is not allowed for LOOKUP; must be REFERENCE, USER, or ORGANIZATION`,
      );
    }

    // Source field must belong to the same model AND same entity (or both null)
    const normalizedCurrentEntity = entityId || null;
    const normalizedSourceEntity = (sourceField as any).entityId || null;
    if (sourceField.modelId !== modelId || normalizedSourceEntity !== normalizedCurrentEntity) {
      throw new BusinessException(
        400,
        ErrorCodes.LOOKUP_SOURCE_MUST_BE_SAME_RECORD,
        'Source field must belong to the same model and entity as the LOOKUP field',
      );
    }

    const sourceOptions = (sourceField.options as any) ?? {};

    if (sourceField.fieldType === 'REFERENCE') {
      // For REFERENCE: look up the target model and find the column
      const targetModelId = sourceOptions.targetModelId;
      if (!targetModelId) {
        throw new BusinessException(
          400,
          ErrorCodes.LOOKUP_SOURCE_FIELD_NOT_FOUND,
          'Source REFERENCE field is missing targetModelId',
        );
      }

      const targetModel = await this.prisma.sysModel.findUnique({
        where: { id: targetModelId },
        include: { fields: { where: { deletedAt: null } } },
      });
      if (!targetModel) {
        throw new BusinessException(
          400,
          ErrorCodes.LOOKUP_SOURCE_FIELD_NOT_FOUND,
          `Target model '${targetModelId}' not found`,
        );
      }

      const targetField = (targetModel as any).fields.find(
        (f: any) => f.columnName === targetFieldColumnName,
      );
      if (!targetField) {
        throw new BusinessException(
          400,
          ErrorCodes.LOOKUP_SOURCE_FIELD_NOT_FOUND,
          `Target field '${targetFieldColumnName}' not found in model '${targetModelId}'`,
        );
      }

      // Check target type blacklist
      if ((FieldService.LOOKUP_TARGET_BLACKLIST as readonly string[]).includes(targetField.fieldType)) {
        throw new BusinessException(
          400,
          ErrorCodes.LOOKUP_TARGET_TYPE_NOT_ALLOWED,
          `Target field type '${targetField.fieldType}' is not allowed as a LOOKUP target`,
        );
      }
    } else if (sourceField.fieldType === 'USER') {
      // For USER: check against hardcoded whitelist
      if (!(targetFieldColumnName in FieldService.USER_LOOKUP_FIELDS)) {
        throw new BusinessException(
          400,
          ErrorCodes.LOOKUP_SOURCE_FIELD_NOT_FOUND,
          `Column '${targetFieldColumnName}' is not a valid USER lookup target`,
        );
      }
    } else if (sourceField.fieldType === 'ORGANIZATION') {
      // For ORGANIZATION: check against hardcoded whitelist
      if (!(targetFieldColumnName in FieldService.ORG_LOOKUP_FIELDS)) {
        throw new BusinessException(
          400,
          ErrorCodes.LOOKUP_SOURCE_FIELD_NOT_FOUND,
          `Column '${targetFieldColumnName}' is not a valid ORGANIZATION lookup target`,
        );
      }
    }
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

    // LOOKUP: validate source/target options before persisting
    if (dto.fieldType === 'LOOKUP') {
      await this.validateLookupOptions({
        modelId,
        entityId: dto.entityId,
        options: dto.options,
      });
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

    // Auto-populate targetDisplayField for REFERENCE/MULTI_REFERENCE if not provided
    let options = dto.options ?? undefined;
    if (
      (dto.fieldType === 'REFERENCE' || dto.fieldType === 'MULTI_REFERENCE') &&
      dto.options?.targetModelId &&
      !dto.options?.targetDisplayField
    ) {
      const firstField = await this.prisma.sysField.findFirst({
        where: { modelId: dto.options.targetModelId, isSystem: false, entityId: null, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { columnName: true },
      });
      if (firstField) {
        options = { ...dto.options, targetDisplayField: firstField.columnName };
      }
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
        options,
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

    // LOOKUP: re-validate options if options are being updated
    if (field.fieldType === 'LOOKUP' && dto.options !== undefined) {
      await this.validateLookupOptions({
        modelId: field.modelId,
        entityId: (field as any).entityId,
        options: dto.options,
      });
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

    // Task 4: Source field deletion protection — if this field can be a LOOKUP source,
    // check whether any LOOKUP fields depend on it as their sourceFieldId.
    if ((['REFERENCE', 'USER', 'ORGANIZATION'] as string[]).includes(field.fieldType)) {
      const dependentLookups = await this.prisma.sysField.findMany({
        where: {
          fieldType: 'LOOKUP',
          options: { path: ['sourceFieldId'], equals: field.id },
        },
        select: { id: true, name: true, columnName: true },
      });
      if (dependentLookups.length > 0) {
        throw new BusinessException(
          409,
          ErrorCodes.FIELD_HAS_DEPENDENT_LOOKUPS,
          JSON.stringify(dependentLookups.map((d) => ({ name: (d as any).name, columnName: (d as any).columnName }))),
        );
      }
    }

    // Task 5: Target field deletion protection — if this is a non-system, non-LOOKUP field,
    // scan for any LOOKUP whose source REFERENCE points to the same model AND whose
    // targetFieldColumnName matches this field's columnName.
    if (!field.isSystem && field.fieldType !== 'LOOKUP') {
      // Find all LOOKUPs that reference this column name as their target
      const candidateLookups = await this.prisma.sysField.findMany({
        where: {
          fieldType: 'LOOKUP',
          options: { path: ['targetFieldColumnName'], equals: field.columnName },
        },
        select: { id: true, name: true, columnName: true, options: true },
      });

      if (candidateLookups.length > 0) {
        // For each candidate, check if its source REFERENCE points to this field's model
        const matchingLookups: Array<{ name: string; columnName: string }> = [];
        for (const lookup of candidateLookups) {
          const lookupOptions = (lookup as any).options as any;
          const sourceFieldId = lookupOptions?.sourceFieldId;
          if (!sourceFieldId) continue;

          const sourceField = await this.prisma.sysField.findUnique({
            where: { id: sourceFieldId },
            select: { fieldType: true, options: true },
          });
          if (!sourceField) continue;

          if (
            sourceField.fieldType === 'REFERENCE' &&
            (sourceField.options as any)?.targetModelId === field.modelId
          ) {
            matchingLookups.push({ name: (lookup as any).name, columnName: (lookup as any).columnName });
          }
        }

        if (matchingLookups.length > 0) {
          throw new BusinessException(
            409,
            ErrorCodes.FIELD_HAS_DEPENDENT_LOOKUPS,
            JSON.stringify(matchingLookups),
          );
        }
      }
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
