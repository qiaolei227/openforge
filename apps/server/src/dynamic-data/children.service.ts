import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { SYSTEM_FIELDS } from '@openforge/shared';

const SYSTEM_FIELDS_SET = new Set<string>(SYSTEM_FIELDS);

interface ChildRecord {
  id?: string;
  [key: string]: any;
}

interface ChildUpsertResult {
  created: string[];
  updated: string[];
  deleted: string[];
}

@Injectable()
export class ChildrenService {
  constructor(private prisma: PrismaService) {}

  /**
   * Process __children in a single database transaction.
   *
   * Entity (child) tables have no org_id / is_archived — they inherit
   * scoping and archival from their parent record (see DdlManagerService.createEntityTable).
   *
   * @param tx - Prisma transaction client ($transaction callback parameter)
   * @param parentModelId - parent model's sys_model.id
   * @param parentId - parent record UUID
   * @param childrenPayload - { childFieldColumnName: ChildRecord[] }
   * @param userId - current user ID
   */
  async processChildren(
    tx: any,
    parentModelId: string,
    parentId: string,
    childrenPayload: Record<string, ChildRecord[]>,
    userId: string,
  ): Promise<Record<string, ChildUpsertResult>> {
    const results: Record<string, ChildUpsertResult> = {};

    for (const [childKey, records] of Object.entries(childrenPayload)) {
      results[childKey] = await this.upsertChildRecords(
        tx, parentModelId, parentId, childKey, records, userId,
      );
    }

    return results;
  }

  private async upsertChildRecords(
    tx: any,
    parentModelId: string,
    parentId: string,
    childKey: string,
    records: ChildRecord[],
    userId: string,
  ): Promise<ChildUpsertResult> {
    const { childModel, fkColumnName, childFields } =
      await this.resolveChildModel(parentModelId, childKey);

    const tableName = childModel.tableName;
    const result: ChildUpsertResult = { created: [], updated: [], deleted: [] };

    const existingRows: Array<{ id: string }> = await tx.$queryRawUnsafe(
      `SELECT "id" FROM biz."${tableName}" WHERE "${fkColumnName}" = $1::uuid`,
      parentId,
    );
    const existingIds = new Set(existingRows.map((r: any) => r.id as string));

    const submittedIds = new Set(
      records.filter((r) => r.id).map((r) => r.id!),
    );

    for (const existingId of existingIds) {
      const existingIdStr = existingId as string;
      if (!submittedIds.has(existingIdStr)) {
        // Entity child tables are not registered in sys_model, so REFERENCE
        // fields cannot target them — no delete-guard check needed.
        await tx.$executeRawUnsafe(
          `DELETE FROM biz."${tableName}" WHERE "id" = $1::uuid`,
          existingIdStr,
        );
        result.deleted.push(existingIdStr);
      }
    }

    const writableColumns = childFields
      .filter((f: any) => !f.isSystem && !f.deletedAt)
      .filter((f: any) => f.fieldType !== 'MULTI_REFERENCE')
      .map((f: any) => f.columnName);

    for (const record of records) {
      const cleanData: Record<string, any> = {};
      for (const [key, value] of Object.entries(record)) {
        if (key === 'id') continue;
        if (SYSTEM_FIELDS_SET.has(key)) continue;
        if (key === fkColumnName) continue;
        if (!writableColumns.includes(key)) continue;
        cleanData[key] = value;
      }

      if (record.id && existingIds.has(record.id)) {
        await this.updateChild(tx, tableName, record.id, cleanData, userId);
        result.updated.push(record.id);
      } else {
        const newId = await this.insertChild(
          tx, tableName, cleanData, fkColumnName, parentId, userId,
        );
        result.created.push(newId);
      }
    }

    return result;
  }

  private async updateChild(
    tx: any, tableName: string, id: string,
    data: Record<string, any>, userId: string,
  ) {
    const cols = Object.keys(data);
    if (cols.length === 0) return;

    const params: any[] = [userId];
    let setClause = `"version" = "version" + 1, "updated_by" = $1::uuid, "updated_at" = NOW()`;
    for (const col of cols) {
      params.push(data[col]);
      setClause += `, "${col}" = $${params.length}`;
    }
    params.push(id);
    const sql = `UPDATE biz."${tableName}" SET ${setClause} WHERE "id" = $${params.length}::uuid`;
    await tx.$executeRawUnsafe(sql, ...params);
  }

  private async insertChild(
    tx: any, tableName: string, data: Record<string, any>,
    fkColumnName: string, parentId: string, userId: string,
  ): Promise<string> {
    const userColumns = Object.keys(data);
    // Entity tables: id, {fk}, version, created_by, updated_by, created_at, updated_at
    // (no org_id / is_archived — inherited from parent model).
    const params: any[] = [userId, userId, parentId];
    userColumns.forEach((_, i) => params.push(data[userColumns[i]]));

    const userColsSql = userColumns.map((c) => `"${c}"`).join(', ');
    const userPlaceholders = userColumns.map((_, i) => `$${i + 4}`).join(', ');
    const extraCols = userColumns.length > 0 ? `, ${userColsSql}` : '';
    const extraVals = userColumns.length > 0 ? `, ${userPlaceholders}` : '';

    const sql = `
      INSERT INTO biz."${tableName}"
        ("id", "version", "created_by", "updated_by", "created_at", "updated_at", "${fkColumnName}"${extraCols})
      VALUES
        (gen_random_uuid(), 1, $1::uuid, $2::uuid, NOW(), NOW(), $3::uuid${extraVals})
      RETURNING "id"
    `;
    const rows: Array<{ id: string }> = await tx.$queryRawUnsafe(sql, ...params);
    return rows[0].id;
  }

  /**
   * Resolve the child entity metadata from a childKey (entity code on parent model).
   */
  private async resolveChildModel(parentModelId: string, childKey: string) {
    const entity = await this.prisma.sysEntity.findFirst({
      where: { modelId: parentModelId, code: childKey },
      include: {
        model: { select: { code: true } },
        fields: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!entity) {
      throw new BusinessException(
        400,
        ErrorCodes.CHILDREN_INVALID_MODEL,
        `No child entity '${childKey}' found on parent model`,
      );
    }

    const fkColumnName = `${entity.model.code}_id`;

    return {
      childModel: { tableName: entity.tableName, code: entity.code },
      fkColumnName,
      childFields: entity.fields,
    };
  }
}
