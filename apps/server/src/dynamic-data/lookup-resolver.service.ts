import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface FieldMeta {
  id: string;
  columnName: string;
  fieldType: string;
  options: any;
}

interface ResolveOptions {
  skipAlreadyResolved?: boolean;
}

/**
 * Metadata for a LOOKUP field that requires a LEFT JOIN in the query builder.
 * The caller prepares this async metadata and passes it synchronously to
 * QueryBuilderService.build() so the builder stays sync.
 */
export interface LookupJoinMeta {
  /** LOOKUP field id */
  fieldId: string;
  /** LOOKUP field's own columnName (used as SELECT alias) */
  lookupColumnName: string;
  /** JOIN alias, e.g. `lk_${fieldId}` */
  alias: string;
  /** Source FK column on the main table */
  sourceColumnName: string;
  /** Fully-quoted first-hop table, e.g. `biz."app_material"` or `public."sys_user"` */
  firstHopTable: string;
  /** Target column on the first-hop table — the value we want */
  firstHopColumn: string;
  /** Optional second hop when first-hop column's fieldType is REFERENCE/USER/ORG */
  secondHopAlias?: string;
  /** Fully-quoted second-hop table */
  secondHopTable?: string;
  /** Display column on second-hop table */
  secondHopColumn?: string;
  /** The first-hop column whose value we use to join to second hop */
  secondHopJoinFromColumn?: string;
}

/**
 * LookupResolverService — Stage B/C of the LOOKUP read path.
 *
 * Stage B: For each LOOKUP field, collect non-null FK values from records,
 *          batch-query the target table via an IN query, and write resolved
 *          scalar values back to record[lookup.columnName].
 *
 * Stage C: If the resolved target field is itself a FK type
 *          (REFERENCE / USER / ORGANIZATION), perform a second hop to
 *          replace the raw FK with human-readable display text.
 *
 * Supports REFERENCE / USER / ORGANIZATION as the source FK field type.
 */
@Injectable()
export class LookupResolverService {
  private readonly logger = new Logger(LookupResolverService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Build JOIN metadata for all LOOKUP fields in the given field list.
   * Resolves target tables asynchronously so QueryBuilderService.build() can stay sync.
   *
   * REFERENCE sources → biz."tableName"
   * USER sources      → public."sys_user"
   * ORGANIZATION sources → public."sys_org"
   *
   * Second-hop support (for LOOKUP targets that are themselves FK fields) is
   * added in a follow-up commit.
   */
  async buildJoinMeta(
    fields: Array<{ id: string; columnName: string; fieldType: string; options: any }>,
  ): Promise<LookupJoinMeta[]> {
    const lookupFields = fields.filter((f) => f.fieldType === 'LOOKUP');
    if (lookupFields.length === 0) return [];

    const result: LookupJoinMeta[] = [];

    for (const lf of lookupFields) {
      const sourceFieldId = lf.options?.sourceFieldId;
      if (!sourceFieldId) continue;

      // Find source field in the same fields array
      const sourceField = fields.find((f) => f.id === sourceFieldId);
      if (!sourceField) {
        this.logger.warn(`[LOOKUP buildJoinMeta] sourceFieldId=${sourceFieldId} not found in fields`);
        continue;
      }

      const targetFieldColumnName: string | undefined = lf.options?.targetFieldColumnName;
      if (!targetFieldColumnName) continue;

      let firstHopTable: string;

      if (sourceField.fieldType === 'REFERENCE') {
        const targetModelId = (sourceField.options as any)?.targetModelId;
        if (!targetModelId) continue;
        const targetModel = await this.prisma.sysModel.findUnique({
          where: { id: targetModelId },
          select: { tableName: true },
        });
        if (!targetModel) continue;
        firstHopTable = `biz."${targetModel.tableName}"`;
      } else if (sourceField.fieldType === 'USER') {
        firstHopTable = `public."sys_user"`;
      } else if (sourceField.fieldType === 'ORGANIZATION') {
        firstHopTable = `public."sys_org"`;
      } else {
        this.logger.warn(
          `[LOOKUP buildJoinMeta] sourceField ${sourceFieldId} has unsupported type ${sourceField.fieldType}`,
        );
        continue;
      }

      result.push({
        fieldId: lf.id,
        lookupColumnName: lf.columnName,
        alias: `lk_${lf.id}`,
        sourceColumnName: sourceField.columnName,
        firstHopTable,
        firstHopColumn: targetFieldColumnName,
      });
    }

    return result;
  }

  async resolve(
    records: Record<string, any>[],
    fields: FieldMeta[],
    opts: ResolveOptions = {},
  ): Promise<void> {
    const lookupFields = fields.filter((f) => f.fieldType === 'LOOKUP');
    if (lookupFields.length === 0) return;
    if (records.length === 0) return;

    // Collect all sourceFieldIds we need to look up
    const sourceFieldIds = [
      ...new Set(
        lookupFields
          .map((f) => f.options?.sourceFieldId)
          .filter(Boolean) as string[],
      ),
    ];
    if (sourceFieldIds.length === 0) return;

    // Batch-fetch source field metadata
    const sourceFields = await this.prisma.sysField.findMany({
      where: { id: { in: sourceFieldIds } },
      select: {
        id: true,
        columnName: true,
        fieldType: true,
        options: true,
      },
    });
    const sourceFieldMap = new Map(sourceFields.map((f: any) => [f.id, f]));

    // Stage B — group LOOKUP fields by sourceFieldId so we batch per source
    // (multiple LOOKUPs can share the same source FK column)
    const bySourceField = new Map<string, FieldMeta[]>();
    for (const lf of lookupFields) {
      const sfId = lf.options?.sourceFieldId;
      if (!sfId) continue;
      const arr = bySourceField.get(sfId) ?? [];
      arr.push(lf);
      bySourceField.set(sfId, arr);
    }

    // Track LOOKUP fields whose resolved target value is itself a FK type
    // so Stage C can perform a second display-text hop.
    type SecondHopMeta = {
      lookupField: FieldMeta;
      targetField: any; // { columnName, fieldType, options }
    };
    const secondHopQueue: SecondHopMeta[] = [];

    for (const [sfId, lfs] of bySourceField) {
      const sourceField = sourceFieldMap.get(sfId);
      if (!sourceField) {
        this.logger.warn(`[LOOKUP] sourceField not found: id=${sfId}`);
        continue;
      }

      // Determine target table from source field type
      let targetTableExpr: string; // e.g. `biz."app_material"` or `public."sys_user"`
      let targetModel: any = null;

      if (sourceField.fieldType === 'REFERENCE') {
        const targetModelId = (sourceField.options as any)?.targetModelId;
        if (!targetModelId) continue;
        targetModel = await this.prisma.sysModel.findUnique({
          where: { id: targetModelId },
          include: { fields: true },
        });
        if (!targetModel) continue;
        targetTableExpr = `biz."${targetModel.tableName}"`;
      } else if (sourceField.fieldType === 'USER') {
        targetTableExpr = `public."sys_user"`;
      } else if (sourceField.fieldType === 'ORGANIZATION') {
        targetTableExpr = `public."sys_org"`;
      } else {
        this.logger.warn(
          `[LOOKUP] sourceField ${sfId} has unsupported type ${sourceField.fieldType}`,
        );
        continue;
      }

      // Collect distinct FK values from all records using this source field
      const fkSet = new Set<string>();
      for (const r of records) {
        const fk = r[sourceField.columnName];
        if (fk != null) fkSet.add(String(fk));
      }
      if (fkSet.size === 0) {
        // All FKs are null — set LOOKUP columns to null
        for (const lf of lfs) {
          for (const r of records) {
            if (r[lf.columnName] === undefined) {
              r[lf.columnName] = null;
            }
          }
        }
        continue;
      }

      // Determine target column names needed across all LOOKUPs sharing this source
      const targetCols = [
        ...new Set(
          lfs
            .map((lf) => lf.options?.targetFieldColumnName)
            .filter(Boolean) as string[],
        ),
      ];

      // skipAlreadyResolved: skip LOOKUP fields where every record already has a
      // defined (non-undefined) value — used when JOIN queries pre-fill the value.
      const lfsToResolve = lfs.filter((lf) => {
        if (!opts.skipAlreadyResolved) return true;
        return records.some((r) => r[lf.columnName] === undefined);
      });
      if (lfsToResolve.length === 0) continue;

      // Build and execute the IN query
      const fks = [...fkSet];
      const placeholders = fks.map((_, i) => `$${i + 1}::uuid`).join(', ');
      const selectCols = ['id', ...targetCols]
        .map((c) => `"${c}"`)
        .join(', ');

      const rows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT ${selectCols} FROM ${targetTableExpr} WHERE "id" IN (${placeholders})`,
        ...fks,
      );
      const rowMap = new Map(rows.map((r: any) => [String(r.id), r]));

      // Write resolved values back to records
      for (const lf of lfsToResolve) {
        const targetColName = lf.options?.targetFieldColumnName;
        if (!targetColName) continue;

        // Check if the target field is itself a FK type — for Stage C
        let targetFieldMeta: any = null;
        if (targetModel) {
          targetFieldMeta = (targetModel.fields as any[]).find(
            (tf: any) => tf.columnName === targetColName,
          );
        }

        for (const r of records) {
          if (opts.skipAlreadyResolved && r[lf.columnName] !== undefined) {
            continue;
          }
          const fk = r[sourceField.columnName];
          if (fk == null) {
            r[lf.columnName] = null;
            continue;
          }
          const targetRow = rowMap.get(String(fk));
          if (!targetRow) {
            this.logger.warn(
              `[LOOKUP] dangling FK: sourceField=${sourceField.columnName} fk=${fk}`,
            );
            r[lf.columnName] = null;
            continue;
          }
          // Write the raw value; Stage C will overwrite with display text if it's a FK
          r[lf.columnName] = targetRow[targetColName] ?? null;
        }

        // Queue for Stage C if the target field is itself a FK type
        if (
          targetFieldMeta &&
          ['REFERENCE', 'USER', 'ORGANIZATION'].includes(targetFieldMeta.fieldType)
        ) {
          secondHopQueue.push({ lookupField: lf, targetField: targetFieldMeta });
        }
      }
    }

    // ─── Stage C — second-hop display resolution for FK target fields ─────────
    if (secondHopQueue.length === 0) return;

    for (const { lookupField, targetField } of secondHopQueue) {
      const ft = targetField.fieldType as 'REFERENCE' | 'USER' | 'ORGANIZATION';

      let secondTableExpr: string;
      let displayColumn: string;

      if (ft === 'REFERENCE') {
        const secondTargetModelId = (targetField.options as any)?.targetModelId;
        if (!secondTargetModelId) continue;
        displayColumn = (targetField.options as any)?.targetDisplayField || 'name';
        const secondModel = await this.prisma.sysModel.findUnique({
          where: { id: secondTargetModelId },
          select: { tableName: true },
        });
        if (!secondModel) continue;
        secondTableExpr = `biz."${secondModel.tableName}"`;
      } else if (ft === 'USER') {
        secondTableExpr = `public."sys_user"`;
        displayColumn = 'name';
      } else {
        // ORGANIZATION
        secondTableExpr = `public."sys_org"`;
        displayColumn = 'name';
      }

      // Collect the raw FK values Stage B wrote into record[lookup.columnName]
      const fkSet2 = new Set<string>();
      for (const r of records) {
        const v = r[lookupField.columnName];
        if (v != null) fkSet2.add(String(v));
      }
      if (fkSet2.size === 0) continue;

      const fks2 = [...fkSet2];
      const placeholders2 = fks2.map((_, i) => `$${i + 1}::uuid`).join(', ');

      const rows2: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT "id", "${displayColumn}" FROM ${secondTableExpr} WHERE "id" IN (${placeholders2})`,
        ...fks2,
      );
      const displayMap = new Map(
        rows2.map((r: any) => [String(r.id), r[displayColumn]]),
      );

      for (const r of records) {
        const rawFk = r[lookupField.columnName];
        if (rawFk == null) continue;
        r[lookupField.columnName] = displayMap.get(String(rawFk)) ?? null;
      }
    }
  }
}
