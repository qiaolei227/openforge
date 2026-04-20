import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryBuilderService } from './query-builder.service';
import type { EntityFilterRegistry } from './query-builder.service';
import { DeleteGuardService } from './delete-guard.service';
import { EventBusService } from '../event-bus/event-bus.service';
import { ChildrenService } from './children.service';
import { FieldService } from '../model/field.service';
import { LookupResolverService } from './lookup-resolver.service';
import { ReadonlyPropagationService } from './readonly-propagation.service';
import { AutoDistributeService } from './auto-distribute.service';
import {
  RecordCreatedEvent,
  RecordUpdatedEvent,
  RecordDeletedEvent,
} from '../event-bus/events';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { SYSTEM_FIELDS, TREE_SYSTEM_FIELD, FILE_FIELD_TYPES } from '@openforge/shared';
import { QueryDto } from './dto/query.dto';
import { BatchDto } from './dto/batch.dto';
import { RequestUser } from '../common/interfaces/request-context';

/** System columns that users cannot set directly */
const SYSTEM_FIELDS_SET = new Set<string>(SYSTEM_FIELDS);

@Injectable()
export class DynamicDataService {
  private readonly logger = new Logger(DynamicDataService.name);

  constructor(
    private prisma: PrismaService,
    private queryBuilder: QueryBuilderService,
    private deleteGuard: DeleteGuardService,
    private eventBus: EventBusService,
    private childrenService: ChildrenService,
    private fieldService: FieldService,
    @Inject(LookupResolverService)
    private readonly lookupResolver: LookupResolverService,
    @Inject(ReadonlyPropagationService)
    private readonly readonlyPropagation: ReadonlyPropagationService,
    @Inject(AutoDistributeService)
    private readonly autoDistribute: AutoDistributeService,
  ) {}

  // ────────────────────────── Query ──────────────────────────

  async query(
    appCode: string,
    modelCode: string,
    queryDto: QueryDto,
    orgId: string,
  ) {
    const model = await this.getModelByAppAndCode(appCode, modelCode);

    const entitiesRegistry = this.buildEntityFilterRegistry(model, queryDto);

    // Pre-build async JOIN metadata for LOOKUP fields so the sync query builder can use it
    const lookupMeta = await this.lookupResolver.buildJoinMeta(
      model.fields.map((f) => ({
        id: (f as any).id,
        columnName: f.columnName,
        fieldType: f.fieldType,
        options: (f as any).options,
      })),
    );

    const { dataSql, countSql, params } = this.queryBuilder.build(
      model.tableName,
      model.fields.map((f) => ({
        id: (f as any).id,
        columnName: f.columnName,
        fieldType: f.fieldType,
      })),
      queryDto,
      model.dataScope,
      orgId,
      model.isTree,
      model.defaultSort as Array<{ field: string; order: 'asc' | 'desc' }> | null,
      entitiesRegistry,
      lookupMeta,
    );

    const [data, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(dataSql, ...params),
      this.prisma.$queryRawUnsafe<Array<{ total: number }>>(
        countSql,
        ...params.slice(0, params.length - 2), // countSql doesn't use LIMIT/OFFSET params
      ),
    ]);

    if (model.isTree && queryDto.treeMode && data.length > 0) {
      const ids = data.map((r: any) => r.id);
      const childCounts: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT "parent_id", COUNT(*)::int as cnt FROM biz."${model.tableName}" WHERE "parent_id" = ANY($1::uuid[]) AND "is_archived" = false GROUP BY "parent_id"`,
        ids,
      );
      const countMap = new Map(childCounts.map((r: any) => [r.parent_id, r.cnt]));
      for (const row of data) {
        (row as any).__hasChildren = (countMap.get((row as any).id) ?? 0) > 0;
      }
    }

    // Batch-resolve display values for REFERENCE/USER/ORGANIZATION fields
    if (data.length > 0) {
      await this.batchResolveDisplayValues(data, model.fields);
      await this.lookupResolver.resolve(data, model.fields, { skipAlreadyResolved: true });
    }

    // Resolve 1:N detail rows (single entity, master-detail expand)
    if (data.length > 0 && queryDto.detailEntity?.entityCode) {
      const detailFilter = this.extractDetailFilter(
        queryDto.filter,
        queryDto.detailEntity.entityCode,
      );
      await this.resolveDetailRows(
        data,
        model.id,
        model.code,
        queryDto.detailEntity,
        detailFilter,
      );
    }

    // Resolve 1:1 entity fields (attach as __oneToOne[entityCode])
    if (data.length > 0 && queryDto.oneToOneFields && Object.keys(queryDto.oneToOneFields).length > 0) {
      await this.resolveOneToOneFields(data, model.id, model.code, queryDto.oneToOneFields);
    }

    return {
      data,
      total: countResult[0]?.total ?? 0,
      page: queryDto.page || 1,
      pageSize: queryDto.pageSize || 20,
    };
  }

  // ────────────────────────── Find By ID ──────────────────────────

  async findById(
    appCode: string,
    modelCode: string,
    id: string,
    orgId: string,
  ) {
    const model = await this.getModelByAppAndCode(appCode, modelCode);

    const params: any[] = [id];
    let sql = `SELECT * FROM biz."${model.tableName}" WHERE "id" = $1::uuid`;

    if (model.dataScope === 'private' || model.dataScope === 'distributed') {
      params.push(orgId);
      sql += ` AND "org_id" = $2::uuid`;
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params);

    if (rows.length === 0) {
      throw new BusinessException(
        404,
        ErrorCodes.DATA_NOT_FOUND,
        `Record '${id}' not found in ${appCode}/${modelCode}`,
      );
    }

    const record = rows[0];
    return this.enrichRecord(record, model);
  }

  // ────────────────────────── Create ──────────────────────────

  async create(
    appCode: string,
    modelCode: string,
    data: Record<string, any>,
    userId: string,
    orgId: string,
  ) {
    const model = await this.getModelByAppAndCode(appCode, modelCode);

    // Extract __children and __relations before stripping
    const childrenPayload = data.__children as Record<string, any[]> | undefined;
    delete data.__children;
    const relationsPayload = data.__relations as Record<string, { add?: string[]; remove?: string[] }> | undefined;
    delete data.__relations;

    // Whitelist: only keep fields that exist on this model
    const cleanData = this.stripToModelFields(data, model.fields, model.isTree);

    if (model.isTree && cleanData[TREE_SYSTEM_FIELD]) {
      await this.validateParentId(model.tableName, cleanData[TREE_SYSTEM_FIELD]);
    }

    // Validate field values
    await this.validateFields(cleanData, model.fields, model.tableName, true);

    // Generate AUTO_NUMBER fields
    for (const field of model.fields) {
      if (field.fieldType === 'AUTO_NUMBER') {
        cleanData[field.columnName] = await this.generateAutoNumber(field, model.tableName);
      }
    }

    // Build column/value lists
    const userColumns = Object.keys(cleanData);
    const userValues = Object.values(cleanData);
    const needsOrgId = model.dataScope === 'private' || model.dataScope === 'distributed';
    const isDistributed = model.dataScope === 'distributed';
    const params: any[] = [];
    params.push(needsOrgId ? orgId : null); // $1 = org_id
    params.push(userId); // $2 = created_by
    params.push(userId); // $3 = updated_by

    // Distributed models: pre-generate UUID so master_id can reference the same value
    let idExpr = 'gen_random_uuid()';
    let masterIdColumnPart = '';
    let masterIdValuePart = '';
    let paramOffset = 4; // user columns start at $4 by default
    if (isDistributed) {
      const recordId = crypto.randomUUID();
      params.push(recordId); // $4 = pre-generated id
      idExpr = '$4::uuid';
      masterIdColumnPart = ', "master_id"';
      masterIdValuePart = ', $4::uuid';
      paramOffset = 5;
    }

    userValues.forEach((v) => params.push(v));

    const userColumnsSql = userColumns.map((c) => `"${c}"`).join(', ');
    const userPlaceholders = userColumns.map((_, i) => `$${i + paramOffset}`).join(', ');
    const columnsPart = userColumns.length > 0 ? `, ${userColumnsSql}` : '';
    const valuesPart = userColumns.length > 0 ? `, ${userPlaceholders}` : '';

    const dataStatusColumnPart = model.enableDataStatus ? `, "data_status"` : '';
    const dataStatusValuePart = model.enableDataStatus ? `, 'draft'` : '';

    const sql = `
      INSERT INTO biz."${model.tableName}"
        ("id", "org_id", "is_archived", "version", "created_by", "updated_by", "created_at", "updated_at"${dataStatusColumnPart}${masterIdColumnPart}${columnsPart})
      VALUES
        (${idExpr}, $1::uuid, false, 1, $2::uuid, $3::uuid, NOW(), NOW()${dataStatusValuePart}${masterIdValuePart}${valuesPart})
      RETURNING *
    `;

    const hasChildren = childrenPayload && Object.keys(childrenPayload).length > 0;
    const hasRelations = relationsPayload && Object.keys(relationsPayload).length > 0;

    if (hasChildren || hasRelations) {
      const result = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRawUnsafe<any[]>(sql, ...params);
        const created = rows[0];

        if (hasChildren) {
          await this.childrenService.processChildren(
            tx, model.id, created.id, childrenPayload!, userId,
          );
        }
        if (hasRelations) {
          await this.processRelations(model.id, created.id, relationsPayload!, orgId);
        }

        return created;
      });

      this.eventBus.emit('record.created', new RecordCreatedEvent(
        userId, orgId, { modelCode, recordId: result.id },
      ));
      await this.triggerAutoDistribute(model, result, appCode, modelCode, userId, orgId);
      return result;
    }

    // No children/relations — simple insert
    const result = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params);
    const created = result[0];

    this.eventBus.emit('record.created', new RecordCreatedEvent(
      userId, orgId, { modelCode, recordId: created.id },
    ));
    await this.triggerAutoDistribute(model, created, appCode, modelCode, userId, orgId);
    return created;
  }

  // ────────────────────────── Update ──────────────────────────

  async update(
    appCode: string,
    modelCode: string,
    id: string,
    data: Record<string, any>,
    userId: string,
    orgId: string,
  ) {
    const model = await this.getModelByAppAndCode(appCode, modelCode);

    // Guard: only draft records can be edited when enableDataStatus is on
    await this.guardDataStatus(model.tableName, id, model.enableDataStatus);

    // Extract __children and __relations before processing
    const childrenPayload = data.__children as Record<string, any[]> | undefined;
    delete data.__children;
    const relationsPayload = data.__relations as Record<string, { add?: string[]; remove?: string[] }> | undefined;
    delete data.__relations;

    // Extract version for optimistic locking
    const version = data.version;
    if (version == null) {
      throw new BusinessException(
        400,
        ErrorCodes.DATA_VALIDATION_FAILED,
        'Field "version" is required for optimistic locking',
      );
    }

    // Whitelist: only keep fields that exist on this model
    const cleanData = this.stripToModelFields(data, model.fields, model.isTree);

    if (model.isTree && cleanData[TREE_SYSTEM_FIELD] !== undefined && cleanData[TREE_SYSTEM_FIELD] !== null) {
      await this.validateParentId(model.tableName, cleanData[TREE_SYSTEM_FIELD], id);
    }

    // Validate field values
    await this.validateFields(cleanData, model.fields, model.tableName, false, id);

    // Build SET clause
    const setCols = Object.keys(cleanData);
    const params: any[] = [];
    params.push(userId); // $1 = updated_by
    let setClause = `"version" = "version" + 1, "updated_by" = $1::uuid, "updated_at" = NOW()`;
    setCols.forEach((col) => {
      params.push(cleanData[col]);
      setClause += `, "${col}" = $${params.length}`;
    });

    params.push(id);
    const idParam = params.length;
    params.push(version);
    const versionParam = params.length;
    let whereClause = `"id" = $${idParam}::uuid AND "version" = $${versionParam}`;

    if (model.dataScope === 'private' || model.dataScope === 'distributed') {
      params.push(orgId);
      whereClause += ` AND "org_id" = $${params.length}::uuid`;
    }

    const sql = `
      UPDATE biz."${model.tableName}"
      SET ${setClause}
      WHERE ${whereClause}
      RETURNING *
    `;

    const execute = async (client: { $queryRawUnsafe: (...args: any[]) => Promise<any>; $executeRawUnsafe: (...args: any[]) => Promise<any> }) => {
      const result: any[] = await client.$queryRawUnsafe(sql, ...params);

      if (result.length === 0) {
        // Determine cause: not found vs version conflict
        const existsParams: any[] = [id];
        let existsSql = `SELECT "version" FROM biz."${model.tableName}" WHERE "id" = $1::uuid`;
        if (model.dataScope === 'private' || model.dataScope === 'distributed') {
          existsParams.push(orgId);
          existsSql += ` AND "org_id" = $2::uuid`;
        }
        const existsResult: any[] = await client.$queryRawUnsafe(existsSql, ...existsParams);

        if (existsResult.length === 0) {
          throw new BusinessException(404, ErrorCodes.DATA_NOT_FOUND, `Record '${id}' not found in ${appCode}/${modelCode}`);
        }
        throw new BusinessException(409, ErrorCodes.DATA_VERSION_CONFLICT, `Version conflict: expected ${version}, current is ${existsResult[0].version}`);
      }

      const record = result[0];
      // Readonly propagation for distributed models: master update cascades readonly fields to copies.
      if (model.dataScope === 'distributed' && record.master_id === record.id) {
        await this.readonlyPropagation.propagate(client, model, id, cleanData);
      }
      return record;
    };

    let updated: any;
    const hasChildren = childrenPayload && Object.keys(childrenPayload).length > 0;
    const hasRelations = relationsPayload && Object.keys(relationsPayload).length > 0;

    if (hasChildren || hasRelations) {
      updated = await this.prisma.$transaction(async (tx) => {
        const record = await execute(tx);
        if (hasChildren) {
          await this.childrenService.processChildren(tx, model.id, id, childrenPayload!, userId);
        }
        if (hasRelations) {
          await this.processRelations(model.id, id, relationsPayload!, orgId);
        }
        return record;
      });
    } else {
      updated = await this.prisma.$transaction(async (tx) => {
        return execute(tx);
      });
    }

    this.eventBus.emit('record.updated', new RecordUpdatedEvent(
      userId, orgId, { modelCode, recordId: id },
    ));

    // Enrich with display values + children metadata so the frontend
    // can update state in-place without an extra GET
    return this.enrichRecord(updated, model);
  }

  // ────────────────────────── Delete ──────────────────────────

  async delete(
    appCode: string,
    modelCode: string,
    id: string,
    orgId: string,
  ) {
    const model = await this.getModelByAppAndCode(appCode, modelCode);

    // Guard: only draft records can be deleted when enableDataStatus is on
    await this.guardDataStatus(model.tableName, id, model.enableDataStatus);

    // Check record exists
    const existsParams: any[] = [id];
    let existsSql = `SELECT "id" FROM biz."${model.tableName}" WHERE "id" = $1::uuid`;
    if (model.dataScope === 'private' || model.dataScope === 'distributed') {
      existsParams.push(orgId);
      existsSql += ` AND "org_id" = $2::uuid`;
    }

    const existsResult = await this.prisma.$queryRawUnsafe<any[]>(
      existsSql,
      ...existsParams,
    );

    if (existsResult.length === 0) {
      throw new BusinessException(
        404,
        ErrorCodes.DATA_NOT_FOUND,
        `Record '${id}' not found in ${appCode}/${modelCode}`,
      );
    }

    if (model.isTree) {
      const childCount: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int as cnt FROM biz."${model.tableName}" WHERE "parent_id" = $1::uuid AND "is_archived" = false`,
        id,
      );
      if ((childCount[0]?.cnt ?? 0) > 0) {
        throw new BusinessException(400, ErrorCodes.TREE_HAS_CHILDREN, 'Record has child nodes');
      }
    }

    // Check references — returns reference info instead of throwing
    const ref = await this.deleteGuard.checkReferences(model.id, id);
    if (ref) {
      throw new BusinessException(
        400,
        ErrorCodes.DATA_HAS_REFERENCES,
        `Referenced by ${ref.modelName}`,
        { referencedBy: ref.modelName },
      );
    }

    // Delete the record
    const deleteParams: any[] = [id];
    let deleteSql = `DELETE FROM biz."${model.tableName}" WHERE "id" = $1::uuid`;
    if (model.dataScope === 'private' || model.dataScope === 'distributed') {
      deleteParams.push(orgId);
      deleteSql += ` AND "org_id" = $2::uuid`;
    }

    await this.prisma.$queryRawUnsafe(deleteSql, ...deleteParams);

    this.eventBus.emit('record.deleted', new RecordDeletedEvent(
      '', // userId not available in delete (not passed in)
      orgId,
      { modelCode, recordId: id },
    ));

    return { success: true };
  }

  // ────────────────────────── Archive ──────────────────────────

  async archive(
    appCode: string,
    modelCode: string,
    id: string,
    archived: boolean,
    user: RequestUser,
  ): Promise<void> {
    const model = await this.resolveModelByAppAndCode(appCode, modelCode);

    // Shared models are cross-org by design: record.org_id holds the creator's
    // org, so filtering by current user's org_id would break archive for
    // every other org. Only private models are scoped by org_id.
    const params: any[] = [archived, user.userId, id];
    let sql = `UPDATE biz."${model.tableName}" SET "is_archived" = $1, "version" = "version" + 1, "updated_by" = $2::uuid, "updated_at" = NOW() WHERE "id" = $3::uuid`;
    if (model.dataScope === 'private' || model.dataScope === 'distributed') {
      params.push(user.orgId);
      sql += ` AND "org_id" = $4::uuid`;
    }

    const affected = await this.prisma.$executeRawUnsafe(sql, ...params);
    if (affected === 0) {
      throw new BusinessException(
        404,
        ErrorCodes.DATA_NOT_FOUND,
        `Record '${id}' not found in ${appCode}/${modelCode}`,
      );
    }
  }

  // ────────────────────────── Batch ──────────────────────────

  async batch(
    appCode: string,
    modelCode: string,
    batchDto: BatchDto,
    userId: string,
    orgId: string,
  ) {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; errorCode: string; message: string }> =
      [];

    for (const id of batchDto.ids) {
      try {
        if (batchDto.action === 'delete') {
          await this.delete(appCode, modelCode, id, orgId);
        } else if (batchDto.action === 'update') {
          await this.update(appCode, modelCode, id, batchDto.data ?? {}, userId, orgId);
        }
        succeeded.push(id);
      } catch (err: any) {
        const errorCode =
          err?.response?.errorCode ?? 'UNKNOWN_ERROR';
        const message = err?.response?.message ?? err?.message ?? 'Unknown error';
        failed.push({ id, errorCode, message });
      }
    }

    return { succeeded, failed };
  }

  // ══════════════════════════ Helpers ══════════════════════════

  /**
   * Validate parent_id for tree models: exists, not archived, no circular reference.
   * Uses a recursive CTE for circular reference detection — single query instead of N+1.
   */
  private async validateParentId(
    tableName: string,
    parentId: string,
    recordId?: string,
  ) {
    const parent: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT "id", "is_archived" FROM biz."${tableName}" WHERE "id" = $1::uuid`,
      parentId,
    );
    if (parent.length === 0) {
      throw new BusinessException(400, ErrorCodes.TREE_INVALID_PARENT, 'Parent record not found');
    }
    if (parent[0].is_archived) {
      throw new BusinessException(400, ErrorCodes.TREE_INVALID_PARENT, 'Parent record is archived');
    }

    // Circular reference check via recursive CTE (single query)
    if (recordId) {
      const result: any[] = await this.prisma.$queryRawUnsafe(
        `WITH RECURSIVE ancestors AS (
          SELECT "id", "parent_id" FROM biz."${tableName}" WHERE "id" = $1::uuid
          UNION ALL
          SELECT t."id", t."parent_id" FROM biz."${tableName}" t
          JOIN ancestors a ON t."id" = a."parent_id"
        )
        SELECT 1 FROM ancestors WHERE "id" = $2::uuid LIMIT 1`,
        parentId,
        recordId,
      );
      if (result.length > 0) {
        throw new BusinessException(400, ErrorCodes.TREE_CIRCULAR_REFERENCE, 'Circular reference detected');
      }
    }
  }

  /**
   * Fetch model by (appCode, modelCode) — lightweight, no fields.
   * Used by operations that only need basic model metadata (e.g. archive).
   */
  private async resolveModelByAppAndCode(appCode: string, modelCode: string) {
    const model = await this.prisma.sysModel.findFirst({
      where: {
        code: modelCode,
        app: { code: appCode },
      },
      select: { id: true, tableName: true, dataScope: true, isTree: true },
    });

    if (!model) {
      throw new BusinessException(
        404,
        ErrorCodes.MODEL_NOT_FOUND,
        `Model '${appCode}/${modelCode}' not found`,
      );
    }

    return model;
  }

  /**
   * Runtime schema endpoint: returns model metadata + app reference + non-system
   * fields (with dict choices resolved) so workspace pages can render without
   * designer-level access. Gated by menu:model:* view at the controller.
   *
   * Field permission filtering:
   * - hidden fields are dropped from the returned `fields` array, so the frontend
   *   never renders a column header / form input for them. The data interceptor
   *   already strips hidden values from responses, so this just keeps the schema
   *   in sync with what the user can actually see.
   * - readonly fields are kept in the schema with `access: 'readonly'` annotation
   *   so the form renderer can disable input.
   * - admin (`isAdmin=true`) bypasses all filtering and gets the full schema.
   */

  // ────────────────────────── Status Counts ──────────────────────────

  async statusCounts(
    appCode: string,
    modelCode: string,
    orgId: string,
  ) {
    const model = await this.getModelByAppAndCode(appCode, modelCode);
    if (!model.enableDataStatus) {
      return { all: 0, draft: 0, submitted: 0, approved: 0, reaudit: 0 };
    }

    const params: any[] = [];
    let whereClause = '"is_archived" = false';
    if (model.dataScope === 'private' || model.dataScope === 'distributed') {
      params.push(orgId);
      whereClause += ` AND "org_id" = $${params.length}::uuid`;
    }

    const rows = await this.prisma.$queryRawUnsafe<Array<{ data_status: string; count: number }>>(
      `SELECT "data_status", COUNT(*)::int AS "count" FROM biz."${model.tableName}" WHERE ${whereClause} GROUP BY "data_status"`,
      ...params,
    );

    const counts: Record<string, number> = { draft: 0, submitted: 0, approved: 0, reaudit: 0 };
    let all = 0;
    for (const row of rows) {
      counts[row.data_status] = row.count;
      all += row.count;
    }
    return { all, ...counts };
  }

  async getSchema(
    appCode: string,
    modelCode: string,
    user: { userId: string; isAdmin: boolean },
  ) {
    const model = await this.prisma.sysModel.findFirst({
      where: { code: modelCode, app: { code: appCode } },
      include: { app: { select: { id: true, code: true, name: true } } },
    });
    if (!model) {
      throw new BusinessException(
        404,
        ErrorCodes.MODEL_NOT_FOUND,
        `Model '${appCode}/${modelCode}' not found`,
      );
    }
    // Fetch fields, entities, and views in parallel
    const [allFields, entities, views] = await Promise.all([
      this.fieldService.findByModelId(model.id),
      this.prisma.sysEntity.findMany({
        where: { modelId: model.id },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          fields: {
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      this.prisma.sysView.findMany({
        where: { modelId: model.id },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Replace raw entity.fields with the enriched versions from findByModelId so that
    // entity LOOKUP fields carry _resolvedTargetFieldType used by column filter UI.
    const entityFieldsByEntity = new Map<string, any[]>();
    for (const f of allFields) {
      if (!f.entityId) continue;
      const arr = entityFieldsByEntity.get(f.entityId) ?? [];
      arr.push(f);
      entityFieldsByEntity.set(f.entityId, arr);
    }
    const enrichedEntities = entities.map((e: any) => ({
      ...e,
      fields: entityFieldsByEntity.get(e.id) ?? e.fields ?? [],
    }));

    const nonSystem = allFields.filter((f) => !f.isSystem && !f.entityId);
    if (user.isAdmin) return { ...model, fields: nonSystem, entities: enrichedEntities, views };

    const perms = await this.prisma.sysFieldPermission.findMany({
      where: {
        modelId: model.id,
        role: { userRoles: { some: { userId: user.userId } } },
      },
      select: { fieldId: true, access: true },
    });
    // Widest-wins merge per field
    const accessByField = new Map<string, 'hidden' | 'readonly' | 'editable'>();
    for (const p of perms) {
      const a = p.access as 'hidden' | 'readonly' | 'editable';
      const cur = accessByField.get(p.fieldId);
      if (cur === 'editable') continue;
      if (a === 'editable') accessByField.set(p.fieldId, 'editable');
      else if (a === 'readonly') accessByField.set(p.fieldId, 'readonly');
      else if (!cur) accessByField.set(p.fieldId, a);
    }

    const filtered = nonSystem
      .filter((f) => accessByField.get(f.id) !== 'hidden')
      .map((f) => {
        const access = accessByField.get(f.id);
        return access === 'readonly' ? { ...f, access } : f;
      });
    return { ...model, fields: filtered, entities: enrichedEntities, views };
  }

  /**
   * Fetch model by (appCode, modelCode) and include active non-system fields.
   */
  async getModelByAppAndCode(appCode: string, modelCode: string) {
    const model = await this.prisma.sysModel.findFirst({
      where: {
        code: modelCode,
        app: { code: appCode },
      },
      include: {
        entities: {
          include: {
            fields: {
              where: { deletedAt: null },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!model) {
      throw new BusinessException(
        404,
        ErrorCodes.MODEL_NOT_FOUND,
        `Model '${appCode}/${modelCode}' not found`,
      );
    }

    // Use fieldService.findByModelId to get fields with dict choices + LOOKUP target meta resolved at runtime.
    // Splits by entityId: main fields go on the root; entity-scoped fields replace the raw entity.fields so
    // that entity LOOKUPs also carry _resolvedTargetFieldType used by column filter/cell rendering.
    const fields = await this.fieldService.findByModelId(model.id);
    const modelFields = fields.filter((f: any) => !f.isSystem && !f.entityId);

    const entityFieldsByEntity = new Map<string, any[]>();
    for (const f of fields) {
      if (!f.entityId) continue;
      const arr = entityFieldsByEntity.get(f.entityId) ?? [];
      arr.push(f);
      entityFieldsByEntity.set(f.entityId, arr);
    }
    const entitiesWithEnrichedFields = (model.entities ?? []).map((e: any) => ({
      ...e,
      fields: entityFieldsByEntity.get(e.id) ?? e.fields ?? [],
    }));

    return { ...model, entities: entitiesWithEnrichedFields, fields: modelFields };
  }

  /**
   * Guard edit/delete: if enableDataStatus is true, only draft records can be
   * modified. Throws 409 DATA_STATUS_NOT_EDITABLE for any other status.
   */
  private async guardDataStatus(
    tableName: string,
    recordId: string,
    enableDataStatus: boolean,
  ): Promise<void> {
    if (!enableDataStatus) return;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT "data_status" FROM biz."${tableName}" WHERE "id" = $1::uuid`,
      recordId,
    );
    if (rows.length > 0 && rows[0].data_status !== 'draft' && rows[0].data_status !== 'reaudit') {
      throw new BusinessException(
        409,
        ErrorCodes.DATA_STATUS_NOT_EDITABLE,
        `Record is ${rows[0].data_status}, only draft records can be edited or deleted`,
      );
    }
  }

  /**
   * Strip system fields from user-provided data.
   */
  /**
   * Whitelist-based data cleaning: only keep keys that exist as physical
   * field columnNames on the model (plus tree parent_id if applicable).
   * Everything else (system fields, virtual suffixes, unknown keys) is dropped.
   */
  private stripToModelFields(
    data: Record<string, any>,
    fields: Array<{ columnName: string; fieldType?: string }>,
    isTree: boolean,
  ): Record<string, any> {
    const allowed = new Set(
      fields
        .filter((f) => f.fieldType !== 'LOOKUP')
        .map((f) => f.columnName),
    );
    if (isTree) allowed.add(TREE_SYSTEM_FIELD);
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (allowed.has(key)) clean[key] = value;
    }
    return clean;
  }

  /**
   * Validate field values against metadata.
   */
  /**
   * Validate field values against metadata.
   *
   * Error format: { field, code, name } — frontend translates `code`
   * using `validation.{code}` i18n key with `{name}` interpolation.
   */
  private async validateFields(
    data: Record<string, any>,
    fields: Array<{
      id: string;
      name: string;
      columnName: string;
      fieldType: string;
      isRequired: boolean;
      isUnique: boolean;
      options: any;
    }>,
    tableName: string,
    isCreate: boolean,
    recordId?: string,
  ) {
    const errors: Array<{ field: string; code: string; name: string }> = [];

    for (const field of fields) {
      const value = data[field.columnName];

      // Skip virtual fields (no physical column, no validation needed)
      if (field.fieldType === 'MULTI_REFERENCE') continue;

      // AUTO_NUMBER is generated, skip user validation
      if (field.fieldType === 'AUTO_NUMBER') continue;

      // Required check — create: must exist; update: cannot clear to empty
      if (field.isRequired) {
        const isEmpty = value === null || value === undefined || value === '';
        if (isCreate && isEmpty) {
          errors.push({ field: field.columnName, code: 'required', name: field.name });
          continue;
        }
        if (!isCreate && field.columnName in data && isEmpty) {
          errors.push({ field: field.columnName, code: 'required', name: field.name });
          continue;
        }
      }

      // Skip further validation if value not provided
      if (value === null || value === undefined) continue;

      // Type validation
      switch (field.fieldType) {
        case 'INTEGER': {
          const intVal = typeof value === 'string' ? Number(value) : value;
          if (typeof intVal !== 'number' || !Number.isFinite(intVal) || !Number.isInteger(intVal)) {
            errors.push({ field: field.columnName, code: 'must_be_integer', name: field.name });
          } else {
            data[field.columnName] = intVal;
          }
          break;
        }

        case 'DECIMAL': {
          const decVal = typeof value === 'string' ? Number(value) : value;
          if (typeof decVal !== 'number' || !Number.isFinite(decVal)) {
            errors.push({ field: field.columnName, code: 'must_be_number', name: field.name });
          } else {
            // Round to configured scale (default 2)
            const scale = (field.options as any)?.scale ?? 2;
            const factor = Math.pow(10, scale);
            data[field.columnName] = Math.round(decVal * factor) / factor;
          }
          break;
        }

        case 'BOOLEAN':
          if (typeof value !== 'boolean') {
            errors.push({ field: field.columnName, code: 'must_be_boolean', name: field.name });
          }
          break;

        case 'TIME': {
          if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) {
            errors.push({ field: field.columnName, code: 'must_be_time', name: field.name });
          }
          break;
        }

        case 'ENUM': {
          const choices: string[] =
            (field.options as any)?.choices?.map((c: any) => c.value) ?? [];
          if (choices.length > 0 && !choices.includes(value)) {
            errors.push({ field: field.columnName, code: 'invalid_enum_value', name: field.name });
          }
          break;
        }

        case 'MULTI_ENUM': {
          if (!Array.isArray(value)) {
            errors.push({ field: field.columnName, code: 'must_be_array', name: field.name });
            break;
          }
          if (new Set(value).size !== value.length) {
            errors.push({ field: field.columnName, code: 'duplicate_values', name: field.name });
            break;
          }
          const multiChoices: string[] =
            (field.options as any)?.choices?.map((c: any) => c.value) ?? [];
          if (multiChoices.length > 0) {
            const invalid = value.filter((v: string) => !multiChoices.includes(v));
            if (invalid.length > 0) {
              errors.push({ field: field.columnName, code: 'invalid_enum_values', name: field.name });
            }
          }
          break;
        }

        case 'USER': {
          if (typeof value !== 'string') {
            errors.push({ field: field.columnName, code: 'must_be_uuid', name: field.name });
            break;
          }
          const userExists = await this.prisma.sysUser.findUnique({
            where: { id: value },
            select: { id: true },
          });
          if (!userExists) {
            errors.push({ field: field.columnName, code: 'user_not_found', name: field.name });
          }
          break;
        }

        case 'ORGANIZATION': {
          if (typeof value !== 'string') {
            errors.push({ field: field.columnName, code: 'must_be_uuid', name: field.name });
            break;
          }
          const orgExists = await this.prisma.sysOrganization.findUnique({
            where: { id: value },
            select: { id: true },
          });
          if (!orgExists) {
            errors.push({ field: field.columnName, code: 'org_not_found', name: field.name });
          }
          break;
        }

        case 'FILE':
        case 'IMAGE': {
          if (!Array.isArray(value)) {
            errors.push({ field: field.columnName, code: 'must_be_file_array', name: field.name });
            break;
          }
          const maxCount = (field.options as any)?.maxCount ?? 10;
          if (value.length > maxCount) {
            errors.push({ field: field.columnName, code: 'max_file_count_exceeded', name: field.name });
          }
          break;
        }
      }

      // Unique check
      if (field.isUnique && value !== null && value !== undefined) {
        const checkId = isCreate
          ? '00000000-0000-0000-0000-000000000000'
          : recordId!;

        const uniqueResult = await this.prisma.$queryRawUnsafe<
          Array<{ exists: boolean }>
        >(
          `SELECT EXISTS(SELECT 1 FROM biz."${tableName}" WHERE "${field.columnName}" = $1 AND "id" != $2::uuid LIMIT 1) as "exists"`,
          value,
          checkId,
        );

        if (uniqueResult[0]?.exists) {
          errors.push({ field: field.columnName, code: 'must_be_unique', name: field.name });
        }
      }
    }

    if (errors.length > 0) {
      throw new BusinessException(
        400,
        ErrorCodes.DATA_VALIDATION_FAILED,
        JSON.stringify(errors),
      );
    }
  }

  /**
   * Generate an auto-number value for an AUTO_NUMBER field.
   */
  private async generateAutoNumber(
    field: { columnName: string; options: any },
    tableName: string,
  ): Promise<string> {
    const options = (field.options as any) ?? {};
    const prefix: string = options.prefix ?? '';
    const dateFormat: string = options.dateFormat ?? '';
    const digits: number = options.digits ?? 4;
    const startFrom: number = options.startFrom ?? 1;

    // Build date part
    let datePart = '';
    if (dateFormat) {
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');

      switch (dateFormat) {
        case 'YYYYMMDD':
          datePart = `${yyyy}${mm}${dd}`;
          break;
        case 'YYYY-MM-DD':
          datePart = `${yyyy}-${mm}-${dd}`;
          break;
        case 'YYYYMM':
          datePart = `${yyyy}${mm}`;
          break;
        case 'YYYY':
          datePart = yyyy;
          break;
        default:
          datePart = `${yyyy}${mm}${dd}`;
      }
    }

    const fullPrefix = `${prefix}${datePart}`;

    // Find the max existing number with this prefix
    const likePattern = `${fullPrefix}%`;
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `SELECT "${field.columnName}" FROM biz."${tableName}" WHERE "${field.columnName}" LIKE $1 ORDER BY "${field.columnName}" DESC LIMIT 1`,
      likePattern,
    );

    let nextNumber = startFrom;
    if (rows.length > 0) {
      const lastValue = rows[0][field.columnName] as string;
      const numberPart = lastValue.substring(fullPrefix.length);
      const parsed = parseInt(numberPart, 10);
      if (!isNaN(parsed)) {
        nextNumber = parsed + 1;
      }
    }

    return `${fullPrefix}${String(nextNumber).padStart(digits, '0')}`;
  }

  /**
   * Batch-resolve display values for a list of records (used by query).
   * Groups FK values per target model to minimize DB round-trips.
   */
  private async batchResolveDisplayValues(
    records: Record<string, any>[],
    fields: Array<{ columnName: string; fieldType: string; options: any }>,
  ) {
    // REFERENCE fields — batch per target model
    const refFields = fields.filter((f) => f.fieldType === 'REFERENCE');
    for (const field of refFields) {
      const opts = field.options as any;
      const targetModelId = opts?.targetModelId;
      const targetDisplayField = opts?.targetDisplayField || 'id';
      if (!targetModelId) continue;

      const fkValues = [...new Set(
        records.map((r) => r[field.columnName]).filter(Boolean),
      )];
      if (fkValues.length === 0) continue;

      const targetModel = await this.prisma.sysModel.findUnique({
        where: { id: targetModelId },
        select: { tableName: true },
      });
      if (!targetModel) continue;

      try {
        const displayRows = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT "id", "${targetDisplayField}" FROM biz."${targetModel.tableName}" WHERE "id" = ANY($1::uuid[])`,
          fkValues,
        );
        const displayMap = new Map(
          displayRows.map((r: any) => [r.id, r[targetDisplayField]]),
        );
        for (const record of records) {
          const fk = record[field.columnName];
          if (fk && displayMap.has(fk)) {
            record[`${field.columnName}__display`] = displayMap.get(fk);
          }
        }
      } catch {
        this.logger.warn(`Failed to batch-resolve display for ${field.columnName}`);
      }
    }

    // USER fields — batch
    const userFields = fields.filter((f) => f.fieldType === 'USER');
    if (userFields.length > 0) {
      const allUserIds = new Set<string>();
      for (const field of userFields) {
        for (const r of records) {
          if (r[field.columnName]) allUserIds.add(r[field.columnName]);
        }
      }
      if (allUserIds.size > 0) {
        const users = await this.prisma.sysUser.findMany({
          where: { id: { in: [...allUserIds] } },
          select: { id: true, displayName: true },
        });
        const userMap = new Map(users.map((u) => [u.id, u.displayName]));
        for (const field of userFields) {
          for (const r of records) {
            const uid = r[field.columnName];
            if (uid && userMap.has(uid)) {
              r[`${field.columnName}__display`] = userMap.get(uid);
            }
          }
        }
      }
    }

    // ORGANIZATION fields — batch
    const orgFields = fields.filter((f) => f.fieldType === 'ORGANIZATION');
    if (orgFields.length > 0) {
      const allOrgIds = new Set<string>();
      for (const field of orgFields) {
        for (const r of records) {
          if (r[field.columnName]) allOrgIds.add(r[field.columnName]);
        }
      }
      if (allOrgIds.size > 0) {
        const orgs = await this.prisma.sysOrganization.findMany({
          where: { id: { in: [...allOrgIds] } },
          select: { id: true, name: true },
        });
        const orgMap = new Map(orgs.map((o) => [o.id, o.name]));
        for (const field of orgFields) {
          for (const r of records) {
            const oid = r[field.columnName];
            if (oid && orgMap.has(oid)) {
              r[`${field.columnName}__display`] = orgMap.get(oid);
            }
          }
        }
      }
    }
  }

  /**
   * Enrich a single record with __display values and __childrenMeta.
   * Shared by findById and update to ensure consistent API responses.
   */
  // ────────────────────────── Entity Expansion ──────────────────────────

  /**
   * Build an EntityFilterRegistry from the loaded model entities and query DTO.
   * Used to pass entity metadata into QueryBuilderService.build() so it can
   * emit EXISTS subqueries for __oneToOne__ / __detail__ prefixed filter fields.
   */
  private buildEntityFilterRegistry(
    model: { code: string; entities: any[] },
    queryDto: any,
  ): EntityFilterRegistry {
    const registry: EntityFilterRegistry = {};
    const fkColumn = `${model.code}_id`;

    if (queryDto.oneToOneFields) {
      registry.oneToOne = [];
      for (const [entityCode, fieldCols] of Object.entries(queryDto.oneToOneFields)) {
        if (!Array.isArray(fieldCols) || fieldCols.length === 0) continue;
        const entity = model.entities.find(
          (e: any) => e.code === entityCode && e.entityType === 'one_to_one',
        );
        if (!entity) continue;
        registry.oneToOne.push({
          code: entity.code,
          tableName: entity.tableName,
          fkColumn,
          fields: (entity.fields ?? [])
            .filter((f: any) => (fieldCols as string[]).includes(f.columnName))
            .map((f: any) => ({ columnName: f.columnName, fieldType: f.fieldType })),
        });
      }
    }

    if (queryDto.detailEntity?.entityCode) {
      const entity = model.entities.find(
        (e: any) =>
          e.code === queryDto.detailEntity.entityCode &&
          e.entityType === 'one_to_many',
      );
      if (entity) {
        const visible = new Set<string>(queryDto.detailEntity.fields ?? []);
        registry.detail = {
          code: entity.code,
          tableName: entity.tableName,
          fkColumn,
          fields: (entity.fields ?? [])
            .filter((f: any) => visible.has(f.columnName))
            .map((f: any) => ({ columnName: f.columnName, fieldType: f.fieldType })),
        };
      }
    }

    return registry;
  }

  /**
   * Extract conditions referencing a specific detail entity and rewrite their
   * field names from "__detail__{code}__{col}" to "{col}" for use inside
   * the detail physical table's WHERE clause. Returns null if no matching
   * conditions exist (caller should skip detail filtering in that case).
   */
  private extractDetailFilter(filter: any, entityCode: string): any {
    if (!filter || !Array.isArray(filter.conditions)) return null;
    const marker = `__detail__${entityCode}__`;

    const walk = (group: any): any => {
      if (!group || !Array.isArray(group.conditions)) return null;
      const rewritten: any[] = [];
      for (const cond of group.conditions) {
        if ('conditions' in cond && 'op' in cond) {
          const nested = walk(cond);
          if (nested && nested.conditions.length > 0) rewritten.push(nested);
        } else if (typeof cond.field === 'string' && cond.field.startsWith(marker)) {
          rewritten.push({ ...cond, field: cond.field.slice(marker.length) });
        }
      }
      if (rewritten.length === 0) return null;
      return { op: group.op, conditions: rewritten };
    };

    return walk(filter);
  }

  /**
   * Load child rows of a single 1:N entity for each master record.
   * Attaches as `row.__detail = { entityCode, rows: [...] }`.
   * Selected child fields' REFERENCE/USER/ORGANIZATION display values are resolved.
   */
  private async resolveDetailRows(
    rows: any[],
    modelId: string,
    modelCode: string,
    detailEntity: { entityCode: string; fields: string[] },
    detailFilter?: any,
  ) {
    if (!detailEntity.fields?.length) return;

    const entity = await this.prisma.sysEntity.findFirst({
      where: { modelId, code: detailEntity.entityCode, entityType: 'one_to_many' },
      include: {
        fields: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!entity) return;

    const parentIds = rows.map((r) => r.id);
    const fkCol = `${modelCode}_id`;

    let childRows: any[] = [];
    try {
      let sql = `SELECT * FROM biz."${entity.tableName}" WHERE "${fkCol}" = ANY($1::uuid[])`;
      const queryParams: any[] = [parentIds];

      if (detailFilter && Array.isArray(detailFilter.conditions) && detailFilter.conditions.length > 0) {
        const columns = entity.fields.map((f: any) => ({
          columnName: f.columnName,
          fieldType: f.fieldType,
        }));
        const { sql: filterSql, params: filterParams } = this.queryBuilder.buildFilterOnly(
          detailFilter,
          columns,
          queryParams.length, // offset = 1 ($1 already used)
        );
        if (filterSql) {
          sql += ` AND ${filterSql}`;
          queryParams.push(...filterParams);
        }
      }

      sql += ` ORDER BY "${fkCol}", "created_at" ASC`;

      childRows = await this.prisma.$queryRawUnsafe<any[]>(sql, ...queryParams);
    } catch (err) {
      this.logger.warn(`Failed to load detail rows for entity ${detailEntity.entityCode}: ${err}`);
      return;
    }

    // Resolve display values for visible REFERENCE/USER/ORG fields on child rows
    if (childRows.length > 0) {
      const visibleCols = new Set(detailEntity.fields);
      const resolvableFields = entity.fields.filter(
        (f: any) =>
          visibleCols.has(f.columnName) &&
          (f.fieldType === 'REFERENCE' || f.fieldType === 'USER' || f.fieldType === 'ORGANIZATION'),
      );
      if (resolvableFields.length > 0) {
        await this.batchResolveDisplayValues(childRows, resolvableFields);
      }
    }
    if (childRows.length > 0) {
      await this.lookupResolver.resolve(childRows, entity.fields, { skipAlreadyResolved: true });
    }

    // Group by fk
    const byMaster = new Map<string, any[]>();
    for (const c of childRows) {
      const fk = c[fkCol];
      const arr = byMaster.get(fk) ?? [];
      arr.push(c);
      byMaster.set(fk, arr);
    }

    for (const row of rows) {
      row.__detail = {
        entityCode: detailEntity.entityCode,
        rows: byMaster.get(row.id) ?? [],
      };
    }
  }

  /**
   * Load 1:1 entity records for each master. Attaches as
   * `row.__oneToOne[entityCode] = { ...childFields } | null`.
   */
  private async resolveOneToOneFields(
    rows: any[],
    modelId: string,
    modelCode: string,
    oneToOneFields: Record<string, string[]>,
  ) {
    const parentIds = rows.map((r) => r.id);
    const fkCol = `${modelCode}_id`;

    for (const [entityCode, fieldCols] of Object.entries(oneToOneFields)) {
      if (!fieldCols?.length) continue;

      const entity = await this.prisma.sysEntity.findFirst({
        where: { modelId, code: entityCode, entityType: 'one_to_one' },
        include: {
          fields: {
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
      if (!entity) continue;

      let childRows: any[] = [];
      try {
        childRows = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT DISTINCT ON ("${fkCol}") * FROM biz."${entity.tableName}" WHERE "${fkCol}" = ANY($1::uuid[]) ORDER BY "${fkCol}", "created_at" ASC`,
          parentIds,
        );
      } catch (err) {
        this.logger.warn(`Failed to load 1:1 rows for entity ${entityCode}: ${err}`);
        continue;
      }

      if (childRows.length > 0) {
        const visibleCols = new Set(fieldCols);
        const resolvableFields = entity.fields.filter(
          (f: any) =>
            visibleCols.has(f.columnName) &&
            (f.fieldType === 'REFERENCE' || f.fieldType === 'USER' || f.fieldType === 'ORGANIZATION'),
        );
        if (resolvableFields.length > 0) {
          await this.batchResolveDisplayValues(childRows, resolvableFields);
        }
      }
      if (childRows.length > 0) {
        await this.lookupResolver.resolve(childRows, entity.fields, { skipAlreadyResolved: true });
      }

      const byMaster = new Map<string, any>();
      for (const c of childRows) byMaster.set(c[fkCol], c);

      for (const row of rows) {
        if (!row.__oneToOne) row.__oneToOne = {};
        row.__oneToOne[entityCode] = byMaster.get(row.id) ?? null;
      }
    }
  }

  /**
   * Fire-and-forget auto-distribute hook called after a master record is created.
   * Fetches autoDistribute flag separately to avoid widening getModelByAppAndCode's select.
   */
  private async triggerAutoDistribute(
    model: { id: string; dataScope: string },
    row: any,
    appCode: string,
    modelCode: string,
    userId: string,
    orgId: string,
  ): Promise<void> {
    if (model.dataScope !== 'distributed') return;
    if (!row || row.master_id !== row.id) return;

    const extra = await this.prisma.sysModel.findUnique({
      where: { id: model.id },
      select: { autoDistribute: true },
    });
    const autoDistribute = extra?.autoDistribute ?? false;

    await this.autoDistribute.onMasterCreated(
      { id: model.id, autoDistribute, dataScope: model.dataScope, appCode, modelCode },
      row.id,
      { userId, orgId, isAdmin: false },
    );
  }

  private async enrichRecord(
    record: Record<string, any>,
    model: {
      id: string;
      code: string;
      fields: Array<{ id: string; columnName: string; fieldType: string; options: any }>;
    },
  ) {
    const [, entities] = await Promise.all([
      this.resolveDisplayValues(record, model.fields),
      this.prisma.sysEntity.findMany({
        where: { modelId: model.id },
        include: {
          fields: {
            where: { isSystem: false, deletedAt: null },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
    ]);

    // Resolve LOOKUP fields on the main record
    await this.lookupResolver.resolve([record], model.fields, { skipAlreadyResolved: true });

    if (entities.length > 0) {
      const childrenMeta: Record<string, any> = {};
      for (const entity of entities) {
        const fkColumnName = `${model.code}_id`;

        let childRows: any[] = [];
        try {
          childRows = await this.prisma.$queryRawUnsafe<any[]>(
            `SELECT * FROM biz."${entity.tableName}" WHERE "${fkColumnName}" = $1::uuid ORDER BY "created_at" ASC`,
            record.id,
          );
          if (childRows.length > 0) {
            const entityRefFields = entity.fields.filter((f: any) =>
              f.fieldType === 'REFERENCE' || f.fieldType === 'USER' || f.fieldType === 'ORGANIZATION'
            );
            if (entityRefFields.length > 0) {
              await this.batchResolveDisplayValues(childRows, entityRefFields);
            }
            await this.lookupResolver.resolve(childRows, entity.fields, { skipAlreadyResolved: true });
          }
        } catch {
          this.logger.warn(`Failed to load children for entity ${entity.code}`);
        }

        childrenMeta[entity.code] = {
          entityId: entity.id,
          entityName: entity.name,
          entityCode: entity.code,
          targetTableName: entity.tableName,
          fkColumnName,
          isOneToOne: entity.entityType === 'one_to_one',
          targetFields: entity.fields,
          rows: childRows,
        };
      }
      record.__childrenMeta = childrenMeta;
    }

    return record;
  }

  /**
   * Resolve display values for REFERENCE, USER, and ORGANIZATION fields.
   */
  private async resolveDisplayValues(
    record: Record<string, any>,
    fields: Array<{
      columnName: string;
      fieldType: string;
      options: any;
    }>,
  ) {
    // REFERENCE: resolve from biz schema target model
    const manyToOneFields = fields.filter(
      (f) => f.fieldType === 'REFERENCE',
    );

    for (const field of manyToOneFields) {
      const fkValue = record[field.columnName];
      if (!fkValue) continue;

      const options = field.options as any;
      const targetModelId = options?.targetModelId;
      const targetDisplayField = options?.targetDisplayField || 'name';

      if (!targetModelId) continue;

      // Get target model's tableName
      const targetModel = await this.prisma.sysModel.findUnique({
        where: { id: targetModelId },
        select: { tableName: true },
      });

      if (!targetModel) continue;

      // Fetch display value
      try {
        const displayRows = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT "${targetDisplayField}" FROM biz."${targetModel.tableName}" WHERE "id" = $1::uuid`,
          fkValue,
        );

        if (displayRows.length > 0) {
          record[`${field.columnName}__display`] =
            displayRows[0][targetDisplayField];
        }
      } catch {
        // Non-critical: if display lookup fails, skip silently
        this.logger.warn(
          `Failed to resolve display value for ${field.columnName}`,
        );
      }
    }

    // USER: batch resolve displayName from sys_user
    const userFields = fields.filter((f) => f.fieldType === 'USER');
    if (userFields.length > 0) {
      const userIds = new Set<string>();
      for (const field of userFields) {
        const userId = record[field.columnName];
        if (userId) userIds.add(userId);
      }

      if (userIds.size > 0) {
        try {
          const users = await this.prisma.sysUser.findMany({
            where: { id: { in: [...userIds] } },
            select: { id: true, displayName: true },
          });
          const userMap = new Map(users.map((u) => [u.id, u.displayName]));

          for (const field of userFields) {
            const userId = record[field.columnName];
            if (userId && userMap.has(userId)) {
              record[`${field.columnName}__display`] = userMap.get(userId);
            }
          }
        } catch {
          this.logger.warn('Failed to batch resolve USER display values');
        }
      }
    }

    // ORGANIZATION: batch resolve name from sys_organization
    const orgFields = fields.filter((f) => f.fieldType === 'ORGANIZATION');
    if (orgFields.length > 0) {
      const orgIds = new Set<string>();
      for (const field of orgFields) {
        const orgId = record[field.columnName];
        if (orgId) orgIds.add(orgId);
      }

      if (orgIds.size > 0) {
        try {
          const orgs = await this.prisma.sysOrganization.findMany({
            where: { id: { in: [...orgIds] } },
            select: { id: true, name: true },
          });
          const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

          for (const field of orgFields) {
            const orgId = record[field.columnName];
            if (orgId && orgMap.has(orgId)) {
              record[`${field.columnName}__display`] = orgMap.get(orgId);
            }
          }
        } catch {
          this.logger.warn('Failed to batch resolve ORGANIZATION display values');
        }
      }
    }

    // FILE and IMAGE: batch resolve file metadata from sys_file
    const fileFields = fields.filter((f) =>
      (FILE_FIELD_TYPES as readonly string[]).includes(f.fieldType),
    );
    if (fileFields.length > 0) {
      const allFileIds = new Set<string>();
      for (const field of fileFields) {
        const ids = record[field.columnName];
        if (Array.isArray(ids)) {
          ids.forEach((id: string) => allFileIds.add(id));
        }
      }

      if (allFileIds.size > 0) {
        try {
          const files = await this.prisma.sysFile.findMany({
            where: { id: { in: [...allFileIds] } },
            select: { id: true, originalName: true, mimeType: true, size: true },
          });
          const fileMap = new Map(files.map((f) => [f.id, {
            id: f.id,
            originalName: f.originalName,
            mimeType: f.mimeType,
            size: Number(f.size),
            url: `/api/files/${f.id}/download`,
          }]));

          for (const field of fileFields) {
            const ids = record[field.columnName];
            if (Array.isArray(ids)) {
              record[`${field.columnName}__files`] = ids
                .map((id: string) => fileMap.get(id))
                .filter(Boolean);
            }
          }
        } catch {
          this.logger.warn('Failed to resolve FILE/IMAGE display values');
        }
      }
    }

    // MULTI_REFERENCE: resolve related records from junction table
    const m2mFields = fields.filter((f) => f.fieldType === 'MULTI_REFERENCE');
    for (const field of m2mFields) {
      const options = field.options as any;
      const relTableName = options?.relTableName;
      const targetModelId = options?.targetModelId;
      if (!relTableName || !targetModelId) continue;

      try {
        const targetModel = await this.prisma.sysModel.findUnique({
          where: { id: targetModelId },
          select: { tableName: true },
        });
        if (!targetModel) continue;

        // Validate display field name to prevent SQL injection
        const rawDisplayField = options?.targetDisplayField ?? 'id';
        const targetDisplayField = /^[a-z][a-z0-9_]*$/.test(rawDisplayField) ? rawDisplayField : 'id';

        const junctionRows: any[] = await this.prisma.$queryRawUnsafe(
          `SELECT "source_id", "target_id" FROM biz."${relTableName}" WHERE "source_id" = $1::uuid OR "target_id" = $1::uuid`,
          record.id,
        );

        const relatedIds = junctionRows.map((r: any) =>
          r.source_id === record.id ? r.target_id : r.source_id,
        );

        if (relatedIds.length === 0) {
          record[`${field.columnName}__m2m`] = [];
          continue;
        }

        const displayRows: any[] = await this.prisma.$queryRawUnsafe(
          `SELECT "id", "${targetDisplayField}" as "displayValue" FROM biz."${targetModel.tableName}" WHERE "id" = ANY($1::uuid[])`,
          relatedIds,
        );

        record[`${field.columnName}__m2m`] = displayRows.map((r: any) => ({
          id: r.id,
          displayValue: r.displayValue ?? r.id,
        }));
      } catch {
        this.logger.warn(`Failed to resolve MULTI_REFERENCE for ${field.columnName}`);
        record[`${field.columnName}__m2m`] = [];
      }
    }
  }

  /**
   * Process __relations for MULTI_REFERENCE fields.
   */
  private async processRelations(
    modelId: string,
    recordId: string,
    relationsPayload: Record<string, { add?: string[]; remove?: string[] }>,
    orgId: string,
  ) {
    for (const [fieldColumnName, ops] of Object.entries(relationsPayload)) {
      const field = await this.prisma.sysField.findFirst({
        where: { modelId, columnName: fieldColumnName, fieldType: 'MULTI_REFERENCE', deletedAt: null },
      });
      if (!field) continue;

      const options = field.options as any;
      const relTableName = options?.relTableName;
      if (!relTableName) continue;

      // Remove relations
      if (ops.remove && ops.remove.length > 0) {
        await this.prisma.$executeRawUnsafe(
          `DELETE FROM biz."${relTableName}" WHERE ("source_id" = $1::uuid AND "target_id" = ANY($2::uuid[])) OR ("target_id" = $1::uuid AND "source_id" = ANY($2::uuid[]))`,
          recordId,
          ops.remove,
        );
      }

      // Add relations (batch INSERT with ON CONFLICT DO NOTHING)
      if (ops.add && ops.add.length > 0) {
        const values = ops.add.map((_, i) =>
          `($1::uuid, $${i + 3}::uuid, $2::uuid)`,
        ).join(', ');
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO biz."${relTableName}" ("source_id", "target_id", "org_id") VALUES ${values} ON CONFLICT ("source_id", "target_id") DO NOTHING`,
          recordId,
          orgId,
          ...ops.add,
        );
      }
    }
  }
}
