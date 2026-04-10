import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { DdlManagerService } from '../model/ddl-manager.service';
import { CreateEntityDto } from './dto/create-entity.dto';
import { UpdateEntityDto } from './dto/update-entity.dto';

@Injectable()
export class EntityService {
  private readonly logger = new Logger(EntityService.name);

  constructor(
    private prisma: PrismaService,
    private ddlManager: DdlManagerService,
  ) {}

  /** List entities for a model, with field count and fields */
  async findByModelId(modelId: string) {
    return this.prisma.sysEntity.findMany({
      where: { modelId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        fields: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            fields: { where: { isSystem: false, deletedAt: null } },
          },
        },
      },
    });
  }

  /** Get entity by id with its fields */
  async findById(id: string) {
    const entity = await this.prisma.sysEntity.findUnique({
      where: { id },
      include: {
        fields: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!entity) {
      throw new BusinessException(
        404,
        ErrorCodes.ENTITY_NOT_FOUND,
        `Entity '${id}' not found`,
      );
    }
    return entity;
  }

  /** Create a new entity under a model */
  async create(modelId: string, dto: CreateEntityDto) {
    // Validate model exists and get app info for tableName generation
    const model = await this.prisma.sysModel.findUnique({
      where: { id: modelId },
      include: { app: { select: { code: true } } },
    });
    if (!model) {
      throw new BusinessException(
        404,
        ErrorCodes.MODEL_NOT_FOUND,
        `Model '${modelId}' not found`,
      );
    }

    // Check code uniqueness within the same model
    const existing = await this.prisma.sysEntity.findUnique({
      where: { modelId_code: { modelId, code: dto.code } },
    });
    if (existing) {
      throw new BusinessException(
        409,
        ErrorCodes.ENTITY_CODE_DUPLICATE,
        `Entity code '${dto.code}' already exists in model '${model.name}'`,
      );
    }

    // Generate tableName: {app.code}_{model.code}_{entity.code}
    const tableName = `${model.app.code}_${model.code}_${dto.code}`;

    // FK column name: {model.code}_id
    const fkColumnName = `${model.code}_id`;

    // New entity goes to the end of the list
    const maxSortOrder = await this.prisma.sysEntity.aggregate({
      where: { modelId },
      _max: { sortOrder: true },
    });
    const nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

    // Create entity record — system fields are platform conventions (DDL-only, not in sys_field)
    const entity = await this.prisma.sysEntity.create({
      data: {
        modelId,
        name: dto.name,
        code: dto.code,
        tableName,
        entityType: dto.entityType,
        sortOrder: nextSortOrder,
      },
    });

    // Create physical table via DDL
    await this.ddlManager.createEntityTable(
      tableName,
      fkColumnName,
      model.tableName,
    );
    this.logger.log(`Entity table biz.${tableName} created for model ${model.name}`);

    return entity;
  }

  /** Update entity (name only) */
  async update(id: string, dto: UpdateEntityDto) {
    await this.findById(id);
    return this.prisma.sysEntity.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
      },
    });
  }

  /** Query entity records by parent ID (for data-tab child record loading) */
  async queryRecords(entityId: string, parentId: string) {
    const entity = await this.prisma.sysEntity.findUnique({
      where: { id: entityId },
      include: { model: { select: { code: true } } },
    });
    if (!entity) {
      throw new BusinessException(
        404,
        ErrorCodes.ENTITY_NOT_FOUND,
        `Entity '${entityId}' not found`,
      );
    }

    const fkColumnName = `${entity.model.code}_id`;
    // Entity tables have no is_archived — they inherit archival from their parent record.
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM biz."${entity.tableName}" WHERE "${fkColumnName}" = $1::uuid ORDER BY "created_at" ASC`,
      parentId,
    );

    return { data: rows };
  }

  /** Reorder entities within a model (batched sortOrder update) */
  async updateSort(modelId: string, items: Array<{ id: string; sortOrder: number }>) {
    // Validate all entity IDs belong to this model
    const entityIds = items.map((i) => i.id);
    const found = await this.prisma.sysEntity.findMany({
      where: { id: { in: entityIds }, modelId },
      select: { id: true },
    });
    const foundIds = new Set(found.map((e) => e.id));
    const invalidIds = entityIds.filter((eid) => !foundIds.has(eid));
    if (invalidIds.length > 0) {
      throw new BusinessException(
        404,
        ErrorCodes.ENTITY_NOT_FOUND,
        `Entities not found or not belonging to this model: ${invalidIds.join(', ')}`,
      );
    }

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.sysEntity.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    return { success: true };
  }

  /** Delete entity — checks for data first, then drops table and deletes record */
  async delete(id: string, force = false) {
    const entity = await this.findById(id);

    if (!force) {
      // Check for existing data
      const recordCount = await this.ddlManager.countRecords(entity.tableName);
      if (recordCount > 0) {
        throw new BusinessException(
          409,
          ErrorCodes.ENTITY_HAS_DATA,
          `Entity '${entity.name}' has ${recordCount} data record(s), use force=true to delete anyway`,
        );
      }
    }

    // Delete metadata first (transactional via Prisma cascade), then DDL (auto-commits).
    // If DDL fails after metadata deletion, orphaned table is harmless.
    // The reverse (DDL succeeds but metadata delete fails) is worse: metadata points to nonexistent table.
    await this.prisma.$transaction(async (tx) => {
      await tx.sysField.deleteMany({ where: { entityId: id } });
      await tx.sysEntity.delete({ where: { id } });
    });

    await this.ddlManager.dropTable(entity.tableName);
  }
}
