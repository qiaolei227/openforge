import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ReferenceInfo {
  modelName: string;
  tableName: string;
  columnName: string;
}

@Injectable()
export class DeleteGuardService {
  constructor(private prisma: PrismaService) {}

  /**
   * Check if a record is referenced by other models.
   *
   * Scans sys_field for both REFERENCE and MULTI_REFERENCE fields pointing at
   * the target model, then checks each for records/junction rows pointing to
   * the given recordId. Short-circuits on the first reference found.
   *
   * @param targetModelId - the model ID of the record being deleted
   * @param recordId - the record ID being deleted
   * @returns reference info if referenced, null otherwise
   */
  async checkReferences(
    targetModelId: string,
    recordId: string,
  ): Promise<ReferenceInfo | null> {
    // ── 1. REFERENCE check ────────────────────────────────────────────
    // Find all REFERENCE fields where options.targetModelId = this model
    const referencingFields = await this.prisma.sysField.findMany({
      where: {
        fieldType: 'REFERENCE',
        deletedAt: null,
        options: {
          path: ['targetModelId'],
          equals: targetModelId,
        },
      },
      include: {
        model: {
          select: { id: true, name: true, tableName: true },
        },
      },
    });

    for (const field of referencingFields) {
      const tableName = field.model.tableName;
      const columnName = field.columnName;

      const result = await this.prisma.$queryRawUnsafe<
        Array<{ exists: boolean }>
      >(
        `SELECT EXISTS(SELECT 1 FROM biz."${tableName}" WHERE "${columnName}" = $1::uuid LIMIT 1) as "exists"`,
        recordId,
      );

      if (result[0]?.exists) {
        return { modelName: field.model.name, tableName, columnName };
      }
    }

    // ── 2. MULTI_REFERENCE check ──────────────────────────────────────
    // Every M2M relationship involving this model has at least one sys_field
    // row with modelId = targetModelId (created automatically as the reverse
    // field by FieldService.setupMultiReference). Scanning by modelId thus
    // covers every junction table this model participates in — on either side.
    const m2mFields = await this.prisma.sysField.findMany({
      where: {
        modelId: targetModelId,
        fieldType: 'MULTI_REFERENCE',
        deletedAt: null,
      },
    });

    const seenRelTables = new Set<string>();
    for (const field of m2mFields) {
      const opts = (field.options ?? {}) as {
        relTableName?: string;
        targetModelId?: string;
      };
      const relTableName = opts.relTableName;
      if (!relTableName || seenRelTables.has(relTableName)) continue;
      seenRelTables.add(relTableName);

      // Junction row could have this record on either source_id or target_id.
      const result = await this.prisma.$queryRawUnsafe<
        Array<{ exists: boolean }>
      >(
        `SELECT EXISTS(
          SELECT 1 FROM biz."${relTableName}"
          WHERE "source_id" = $1::uuid OR "target_id" = $1::uuid
          LIMIT 1
        ) as "exists"`,
        recordId,
      );

      if (result[0]?.exists) {
        // Resolve the "other side" model name for a meaningful error message.
        const otherModel = opts.targetModelId
          ? await this.prisma.sysModel.findUnique({
              where: { id: opts.targetModelId },
              select: { name: true },
            })
          : null;
        return {
          modelName: otherModel?.name ?? field.name,
          tableName: relTableName,
          columnName: field.columnName,
        };
      }
    }

    return null;
  }
}
