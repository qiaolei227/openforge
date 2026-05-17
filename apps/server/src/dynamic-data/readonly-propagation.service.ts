import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface ExecClient {
  $executeRawUnsafe(sql: string, ...values: any[]): Promise<any>;
}

interface ModelShape {
  id: string;
  tableName: string;
  fields: Array<{ id: string; columnName: string }>;
}

/**
 * Workflow-related system status columns that must propagate to every copy
 * regardless of the SysDistributionPolicy.editable flag (which only governs
 * user-modelled business fields). When the master's data_status or approval
 * stamps change, every copy needs to see the same lifecycle state — otherwise
 * a copy could be "approved" on the master but still appear "draft" locally,
 * or — worse — a stale local "approved" copy would block legitimate edits.
 */
const SYSTEM_STATUS_FIELDS = [
  'data_status',
  'submitted_by',
  'submitted_at',
  'approved_by',
  'approved_at',
] as const;

@Injectable()
export class ReadonlyPropagationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Propagates readonly field changes from a master record to all its
   * non-archived copies. Caller must have verified the target row is a master
   * (master_id === id) on a distributed model.
   *
   * Two classes of column are propagated:
   *   1. Business fields whose policy is NOT editable (the original P2.2 rule).
   *   2. Workflow system fields (data_status, submitted_by/at, approved_by/at)
   *      always propagated, never gated by policy. These fields live on the
   *      biz row but aren't tracked in sys_field, so they would otherwise
   *      fall through the `fieldByCol.get(col)` lookup.
   *
   * Runs against the caller-provided client so transactional context is
   * preserved when the outer update is inside a $transaction.
   */
  async propagate(
    client: ExecClient,
    model: ModelShape,
    masterId: string,
    payload: Record<string, any>,
  ): Promise<void> {
    const payloadKeys = Object.keys(payload ?? {});
    if (payloadKeys.length === 0) return;

    const policies = await this.prisma.sysDistributionPolicy.findMany({
      where: { modelId: model.id },
      select: { fieldId: true, editable: true },
    });
    const editableFieldIds = new Set(
      policies.filter((p) => p.editable).map((p) => p.fieldId),
    );
    const fieldByCol = new Map(model.fields.map((f) => [f.columnName, f]));
    const systemFieldSet = new Set<string>(SYSTEM_STATUS_FIELDS);

    const colsToWrite: string[] = [];
    const valuesToWrite: any[] = [];
    for (const col of payloadKeys) {
      if (systemFieldSet.has(col)) {
        // Workflow system fields: always propagate, no policy lookup.
        colsToWrite.push(col);
        valuesToWrite.push(payload[col]);
        continue;
      }
      const field = fieldByCol.get(col);
      if (!field) continue; // unknown / non-tracked column
      if (editableFieldIds.has(field.id)) continue; // editable → do not propagate
      colsToWrite.push(col);
      valuesToWrite.push(payload[col]);
    }
    if (colsToWrite.length === 0) return;

    const setClauses = colsToWrite.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
    const masterParam = `$${colsToWrite.length + 1}`;
    await client.$executeRawUnsafe(
      `UPDATE biz."${model.tableName}" SET ${setClauses}, updated_at = now() WHERE master_id = ${masterParam}::uuid AND id <> master_id AND is_archived = false`,
      ...valuesToWrite,
      masterId,
    );
  }
}
