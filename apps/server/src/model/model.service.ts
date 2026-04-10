import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../event-bus/event-bus.service';
import { ModelCreatedEvent } from '../event-bus/events';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { DdlManagerService } from './ddl-manager.service';

export interface ModelQueryParams {
  appId?: string;
  keyword?: string;
  dataScope?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ModelService {
  private readonly logger = new Logger(ModelService.name);

  /** Read-only system field metadata — platform conventions, not stored in sys_field */
  static readonly SYSTEM_FIELDS_META = [
    { columnName: 'id', name: 'ID', fieldType: 'UUID' },
    { columnName: 'org_id', name: '所属组织', fieldType: 'ORGANIZATION' },
    { columnName: 'is_archived', name: '是否归档', fieldType: 'BOOLEAN' },
    { columnName: 'version', name: '版本号', fieldType: 'INTEGER' },
    { columnName: 'created_by', name: '创建人', fieldType: 'USER' },
    { columnName: 'updated_by', name: '更新人', fieldType: 'USER' },
    { columnName: 'created_at', name: '创建时间', fieldType: 'DATETIME' },
    { columnName: 'updated_at', name: '更新时间', fieldType: 'DATETIME' },
  ];

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private ddlManager: DdlManagerService,
  ) {}

  async findAll(params: ModelQueryParams = {}) {
    const { appId, keyword, dataScope, page = 1, pageSize = 20 } = params;
    const where: Record<string, unknown> = {};

    if (appId) {
      where.appId = appId;
    }

    if (dataScope) {
      where.dataScope = dataScope;
    }

    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { code: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.sysModel.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          app: { select: { id: true, name: true } },
          _count: {
            select: {
              fields: { where: { isSystem: false, deletedAt: null } },
              views: true,
            },
          },
        },
      }),
      this.prisma.sysModel.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
    };
  }

  async findById(id: string) {
    const model = await this.prisma.sysModel.findUnique({
      where: { id },
      include: {
        app: { select: { code: true } },
        fields: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
        entities: {
          include: {
            _count: {
              select: {
                fields: { where: { isSystem: false, deletedAt: null } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { fields: true } },
      },
    });
    if (!model) {
      throw new BusinessException(404, ErrorCodes.MODEL_NOT_FOUND, `Model '${id}' not found`);
    }
    return model;
  }

  async create(dto: CreateModelDto, userId: string) {
    // Validate appId exists
    const app = await this.prisma.sysApp.findUnique({
      where: { id: dto.appId },
    });
    if (!app) {
      throw new BusinessException(404, ErrorCodes.APP_NOT_FOUND, `App '${dto.appId}' not found`);
    }

    // Check code uniqueness within the same app
    const existing = await this.prisma.sysModel.findUnique({
      where: { appId_code: { appId: dto.appId, code: dto.code } },
    });
    if (existing) {
      throw new BusinessException(
        409,
        ErrorCodes.MODEL_TABLE_NAME_EXISTS,
        `Model code '${dto.code}' already exists in this app`,
      );
    }

    // Auto-generate tableName: appCode_modelCode
    const tableName = `${app.code}_${dto.code}`;

    // Create model + physical table in a transaction.
    // If DDL fails, the transaction is rolled back.
    const model = await this.prisma.$transaction(async (tx) => {
      const m = await tx.sysModel.create({
        data: {
          appId: dto.appId,
          name: dto.name,
          code: dto.code,
          tableName,
          description: dto.description || null,
          dataScope: dto.dataScope || 'private',
          isTree: dto.isTree || false,
        },
      });

      // DDL inside transaction scope — if this fails, metadata rolls back
      // System fields (id, org_id, is_archived, etc.) are platform conventions —
      // they are created physically by DDL but NOT stored in sys_field.
      await this.ddlManager.createTable(tableName, [], m.dataScope as string, dto.isTree);
      this.logger.log(`Physical table biz.${tableName} created`);

      return m;
    });

    // Emit event
    this.eventBus.emit(
      'model.created',
      new ModelCreatedEvent(userId, '', {
        id: model.id,
        tableName: model.tableName,
      }),
    );

    return model;
  }

  async update(id: string, dto: UpdateModelDto) {
    await this.findById(id);
    // Note: dataScope is intentionally not in UpdateModelDto — it's immutable once created
    return this.prisma.sysModel.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
  }

  async delete(id: string) {
    const model = await this.findById(id);

    // Guard: refuse if any REFERENCE/MULTI_REFERENCE field in any other model
    // is pointing at this model. Otherwise we'd leave dangling targetModelId
    // pointers that break form pickers silently.
    const dependents = await this.prisma.$queryRaw<Array<{
      field_name: string;
      source_model_name: string;
      source_model_id: string;
    }>>`
      SELECT
        f.name        AS field_name,
        m.name        AS source_model_name,
        m.id::text    AS source_model_id
      FROM sys_field f
      JOIN sys_model m ON m.id = f.model_id
      WHERE f.field_type IN ('REFERENCE', 'MULTI_REFERENCE')
        AND f.deleted_at IS NULL
        AND f.model_id <> ${id}::uuid
        AND f.options->>'targetModelId' = ${id}
    `;

    if (dependents.length > 0) {
      // Dedupe by source model (one model may have multiple fields pointing here)
      const byModel = new Map<string, { name: string; fields: string[] }>();
      for (const d of dependents) {
        const entry = byModel.get(d.source_model_id) ?? { name: d.source_model_name, fields: [] };
        entry.fields.push(d.field_name);
        byModel.set(d.source_model_id, entry);
      }
      const summary = Array.from(byModel.values())
        .map((e) => `${e.name}(${e.fields.join('、')})`)
        .join('；');
      throw new BusinessException(
        409,
        ErrorCodes.MODEL_HAS_REFERENCES,
        `Model '${model.name}' is referenced by: ${summary}`,
      );
    }

    // All models have physical tables — check for existing data records
    const recordCount = await this.ddlManager.countRecords(model.tableName);
    if (recordCount > 0) {
      throw new BusinessException(
        409,
        ErrorCodes.MODEL_HAS_DATA,
        `Model '${model.name}' has ${recordCount} data record(s), please clear data first`,
      );
    }

    // No records — drop the physical table
    await this.ddlManager.dropTable(model.tableName);

    // Cascade delete all fields (including system fields and soft-deleted)
    await this.prisma.sysField.deleteMany({ where: { modelId: id } });

    return this.prisma.sysModel.delete({ where: { id } });
  }
}
