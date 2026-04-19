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
 * LookupResolverService — Stage B of the LOOKUP read path.
 *
 * Stage B: For each LOOKUP field, collect non-null FK values from records,
 *          batch-query the target table via an IN query, and write resolved
 *          scalar values back to record[lookup.columnName].
 *
 * Supports REFERENCE / USER / ORGANIZATION as the source FK field type.
 * Stage C (two-hop display for FK target fields) is handled separately.
 */
@Injectable()
export class LookupResolverService {
  private readonly logger = new Logger(LookupResolverService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
          r[lf.columnName] = targetRow[targetColName] ?? null;
        }
      }
    }
  }
}
