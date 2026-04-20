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

@Injectable()
export class ReadonlyPropagationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Propagates readonly field changes from a master record to all its
   * non-archived copies. Caller must have verified the target row is a master
   * (master_id === id) on a distributed model.
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

    const readonlyCols: string[] = [];
    const readonlyValues: any[] = [];
    for (const col of payloadKeys) {
      const field = fieldByCol.get(col);
      if (!field) continue; // unknown / system column
      if (editableFieldIds.has(field.id)) continue; // editable → do not propagate
      readonlyCols.push(col);
      readonlyValues.push(payload[col]);
    }
    if (readonlyCols.length === 0) return;

    const setClauses = readonlyCols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
    const masterParam = `$${readonlyCols.length + 1}`;
    await client.$executeRawUnsafe(
      `UPDATE biz."${model.tableName}" SET ${setClauses}, updated_at = now() WHERE master_id = ${masterParam}::uuid AND id <> master_id AND is_archived = false`,
      ...readonlyValues,
      masterId,
    );
  }
}
