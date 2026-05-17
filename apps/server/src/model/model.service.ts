import { Injectable, Logger, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../event-bus/event-bus.service';
import { ModelCreatedEvent } from '../event-bus/events';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { DdlManagerService } from './ddl-manager.service';
import { ActionService } from '../action/action.service';

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

  /** Read-only data status field metadata — conditionally present when enableDataStatus=true */
  static readonly DATA_STATUS_FIELDS_META = [
    { columnName: 'data_status', name: '数据状态', fieldType: 'ENUM' },
    { columnName: 'submitted_by', name: '提交人', fieldType: 'USER' },
    { columnName: 'submitted_at', name: '提交时间', fieldType: 'DATETIME' },
    { columnName: 'approved_by', name: '审核人', fieldType: 'USER' },
    { columnName: 'approved_at', name: '审核时间', fieldType: 'DATETIME' },
  ];

  // Explicit @Inject required for esbuild/Vitest metadata workaround.
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventBusService) private eventBus: EventBusService,
    @Inject(DdlManagerService) private ddlManager: DdlManagerService,
    @Inject(ActionService) private actionService: ActionService,
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
          enableDataStatus: dto.enableDataStatus || false,
        },
      });

      // DDL inside transaction scope — if this fails, metadata rolls back
      // System fields (id, org_id, is_archived, etc.) are platform conventions —
      // they are created physically by DDL but NOT stored in sys_field.
      await this.ddlManager.createTable(
        tableName,
        [],
        m.dataScope as string,
        dto.isTree || false,
        dto.enableDataStatus || false,
      );
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
    const existing = await this.findById(id);

    // Validate defaultSort field references
    if (dto.defaultSort !== undefined && dto.defaultSort !== null) {
      const validColumns = existing.fields
        .filter((f: any) => !f.isSystem && f.deletedAt === null)
        .map((f: any) => f.columnName);
      // Also allow system columns that make sense for sorting
      const systemSortable = ['created_at', 'updated_at'];
      const allValid = [...validColumns, ...systemSortable];

      for (const item of dto.defaultSort) {
        if (!allValid.includes(item.field)) {
          throw new BusinessException(
            400,
            ErrorCodes.DATA_VALIDATION_FAILED,
            `Invalid sort field: ${item.field}`,
          );
        }
      }

      // Check for duplicates
      const fields = dto.defaultSort.map((s) => s.field);
      if (new Set(fields).size !== fields.length) {
        throw new BusinessException(
          400,
          ErrorCodes.DATA_VALIDATION_FAILED,
          'Duplicate sort fields are not allowed',
        );
      }
    }

    return this.prisma.sysModel.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.defaultSort !== undefined && {
          defaultSort:
            dto.defaultSort === null
              ? Prisma.JsonNull
              : (dto.defaultSort as unknown as Prisma.InputJsonValue),
        }),
        ...(dto.autoDistribute !== undefined && { autoDistribute: dto.autoDistribute }),
      },
    });
  }

  async delete(id: string) {
    const model = await this.findById(id);

    // Guard: refuse if any menu references this model via targetModelId
    const menuRefs = await this.prisma.sysMenu.count({
      where: { targetModelId: id },
    });
    if (menuRefs > 0) {
      throw new BusinessException(
        409,
        ErrorCodes.MODEL_HAS_MENU_REF,
        `Model is referenced by ${menuRefs} menu(s); remove them first`,
      );
    }

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

    // Scan for LOOKUP fields that indirectly reference this model via a REFERENCE source field
    const allLookups = await this.prisma.sysField.findMany({
      where: { fieldType: 'LOOKUP' },
      select: { id: true, modelId: true, options: true },
    });

    const lookupReferrers: string[] = [];
    for (const lookup of allLookups) {
      const lookupOptions = (lookup.options as any) ?? {};
      const sourceFieldId = lookupOptions.sourceFieldId;
      if (!sourceFieldId) continue;

      const sourceField = await this.prisma.sysField.findUnique({
        where: { id: sourceFieldId },
        select: { fieldType: true, options: true },
      });
      if (!sourceField) continue;

      if (
        sourceField.fieldType === 'REFERENCE' &&
        (sourceField.options as any)?.targetModelId === id
      ) {
        lookupReferrers.push(`LOOKUP[${lookup.id}]`);
      }
    }

    const lookupSummary = lookupReferrers.length > 0
      ? `Model '${model.name}' is referenced by LOOKUP fields`
      : null;

    if (dependents.length > 0 || lookupReferrers.length > 0) {
      // Dedupe by source model (one model may have multiple fields pointing here)
      const byModel = new Map<string, { name: string; fields: string[] }>();
      for (const d of dependents) {
        const entry = byModel.get(d.source_model_id) ?? { name: d.source_model_name, fields: [] };
        entry.fields.push(d.field_name);
        byModel.set(d.source_model_id, entry);
      }
      const directSummary = Array.from(byModel.values())
        .map((e) => `${e.name}(${e.fields.join('、')})`)
        .join('；');

      const parts: string[] = [];
      if (directSummary) parts.push(directSummary);
      if (lookupSummary) parts.push(lookupSummary);

      throw new BusinessException(
        409,
        ErrorCodes.MODEL_HAS_REFERENCES,
        `Model '${model.name}' is referenced by: ${parts.join('；')}`,
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

  async toggleDataStatus(modelId: string, enable: boolean): Promise<void> {
    const model = await this.prisma.sysModel.findUnique({
      where: { id: modelId },
    });
    if (!model) {
      throw new BusinessException(404, ErrorCodes.MODEL_NOT_FOUND, 'Model not found');
    }

    if (model.enableDataStatus === enable) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.sysModel.update({
        where: { id: modelId },
        data: { enableDataStatus: enable },
      });

      if (enable) {
        await this.ddlManager.addDataStatusColumns(model.tableName);
      } else {
        await this.ddlManager.removeDataStatusColumns(model.tableName);
      }
    });
  }

  getSystemFieldsMeta(model: { isTree: boolean; enableDataStatus: boolean; dataScope: string }) {
    const base = [...ModelService.SYSTEM_FIELDS_META];
    if (model.isTree) {
      base.push({ columnName: 'parent_id', name: '父节点', fieldType: 'REFERENCE' });
    }
    if (model.enableDataStatus) {
      base.push(...ModelService.DATA_STATUS_FIELDS_META);
    }
    return base;
  }
}
