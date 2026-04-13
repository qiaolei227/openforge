import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { REFERENCE_FIELD_TYPES } from '@openforge/shared';

const TYPE_MAP: Record<string, (options?: any) => string> = {
  STRING: (opt) => `VARCHAR(${opt?.maxLength || 255})`,
  TEXT: () => 'TEXT',
  INTEGER: () => 'INTEGER',
  DECIMAL: () => 'DECIMAL(32,8)',
  BOOLEAN: () => 'BOOLEAN',
  DATE: () => 'DATE',
  DATETIME: () => 'TIMESTAMPTZ',
  TIME: () => 'TIME',
  ENUM: () => 'VARCHAR(50)',
  MULTI_ENUM: () => 'TEXT[]',
  AUTO_NUMBER: () => 'VARCHAR(50)',
  REFERENCE: () => 'UUID',
  USER: () => 'UUID',
  ORGANIZATION: () => 'UUID',
  RICHTEXT: () => 'TEXT',
  FILE: () => 'UUID[]',
  IMAGE: () => 'UUID[]',
};

@Injectable()
export class DdlManagerService implements OnModuleInit {
  private readonly logger = new Logger(DdlManagerService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.prisma.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS biz');
    this.logger.log('Ensured biz schema exists');
  }

  /** Validate table/column names to prevent SQL injection */
  private validateName(name: string): void {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      throw new BusinessException(
        400,
        ErrorCodes.DDL_UNSAFE_NAME,
        `Unsafe identifier: ${name}`,
      );
    }
  }

  /** Get PostgreSQL type string for a field */
  private getColumnType(fieldType: string, options?: any): string {
    const mapper = TYPE_MAP[fieldType];
    if (!mapper) throw new Error(`Unknown field type: ${fieldType}`);
    return mapper(options);
  }

  /**
   * Create physical table in biz schema.
   * Called when a model is created.
   * Includes all system fields + user-defined fields.
   */
  async createTable(
    tableName: string,
    fields: Array<{
      columnName: string;
      fieldType: string;
      isUnique: boolean;
      options?: any;
    }>,
    dataScope: string,
    isTree = false,
    enableDataStatus = false,
  ): Promise<void> {
    this.validateName(tableName);

    // Build column definitions for user fields
    const userColumns = fields.map((f) => {
      this.validateName(f.columnName);
      const pgType = this.getColumnType(f.fieldType, f.options);
      return `"${f.columnName}" ${pgType}`;
    });

    const allColumns = [
      '"id" UUID PRIMARY KEY DEFAULT gen_random_uuid()',
      '"org_id" UUID',
      ...(dataScope === 'distributed' ? ['"master_id" UUID NOT NULL'] : []),
      ...(isTree ? ['"parent_id" UUID'] : []),
      '"is_archived" BOOLEAN NOT NULL DEFAULT false',
      ...(enableDataStatus
        ? [
            `"data_status" VARCHAR(20) NOT NULL DEFAULT 'draft'`,
            '"submitted_by" UUID',
            '"submitted_at" TIMESTAMPTZ',
            '"approved_by" UUID',
            '"approved_at" TIMESTAMPTZ',
          ]
        : []),
      '"version" INT NOT NULL DEFAULT 1',
      '"created_by" UUID NOT NULL',
      '"updated_by" UUID NOT NULL',
      '"created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()',
      '"updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()',
      ...userColumns,
    ];

    const createSql = `CREATE TABLE IF NOT EXISTS biz."${tableName}" (\n  ${allColumns.join(',\n  ')}\n)`;

    this.logger.log(`Creating table: biz.${tableName}`);
    await this.prisma.$executeRawUnsafe(createSql);

    // Create org_id index for private/distributed models
    if (dataScope === 'private' || dataScope === 'distributed') {
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "idx_${tableName}_org_id" ON biz."${tableName}"("org_id")`,
      );
    }

    // Create master_id index for distributed models
    if (dataScope === 'distributed') {
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "idx_${tableName}_master_id" ON biz."${tableName}"("master_id")`,
      );
    }

    // Create parent_id index for tree models
    if (isTree) {
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "idx_${tableName}_parent_id" ON biz."${tableName}"("parent_id")`,
      );
    }

    // Create indexes for reference fields (REFERENCE, USER, ORGANIZATION) and unique indexes
    for (const f of fields) {
      if (REFERENCE_FIELD_TYPES.includes(f.fieldType as any)) {
        await this.createForeignKeyIndex(tableName, f.columnName);
      }
      if (f.isUnique) {
        await this.syncUniqueIndex(tableName, f.columnName, true, dataScope);
      }
    }
  }

  /**
   * Create physical table for an entity (sub-table) in biz schema.
   * Entity tables have: id, FK to parent, version, audit fields.
   * No org_id or is_archived (entities inherit these from their parent model).
   */
  async createEntityTable(
    tableName: string,
    fkColumnName: string,
    parentTableName: string,
  ): Promise<void> {
    this.validateName(tableName);
    this.validateName(fkColumnName);
    this.validateName(parentTableName);

    const sql = `CREATE TABLE IF NOT EXISTS biz."${tableName}" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "${fkColumnName}" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

    this.logger.log(`Creating entity table: biz.${tableName}`);
    await this.prisma.$executeRawUnsafe(sql);

    // Create index on FK column for efficient joins
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_${tableName}_${fkColumnName}" ON biz."${tableName}" ("${fkColumnName}")`,
    );
  }

  /** Add a column to an existing table */
  async addColumn(
    tableName: string,
    columnName: string,
    fieldType: string,
    options?: any,
  ): Promise<void> {
    this.validateName(tableName);
    this.validateName(columnName);
    const pgType = this.getColumnType(fieldType, options);
    const sql = `ALTER TABLE biz."${tableName}" ADD COLUMN IF NOT EXISTS "${columnName}" ${pgType}`;
    this.logger.log(
      `Adding column: biz.${tableName}.${columnName} (${pgType})`,
    );
    await this.prisma.$executeRawUnsafe(sql);
  }

  /** Rename a column (used for field recycle bin) */
  async renameColumn(
    tableName: string,
    oldName: string,
    newName: string,
  ): Promise<void> {
    this.validateName(tableName);
    // oldName and newName for deleted columns start with _del_ which doesn't match validateName
    // So we validate them separately with a looser regex
    if (
      !/^[a-z_][a-z0-9_]*$/.test(oldName) ||
      !/^[a-z_][a-z0-9_]*$/.test(newName)
    ) {
      throw new BusinessException(
        400,
        ErrorCodes.DDL_UNSAFE_NAME,
        `Unsafe column name`,
      );
    }
    const sql = `ALTER TABLE biz."${tableName}" RENAME COLUMN "${oldName}" TO "${newName}"`;
    this.logger.log(
      `Renaming column: biz.${tableName}.${oldName} -> ${newName}`,
    );
    await this.prisma.$executeRawUnsafe(sql);
  }

  /** Drop a column (used for field purge) */
  async dropColumn(tableName: string, columnName: string): Promise<void> {
    this.validateName(tableName);
    if (!/^[a-z_][a-z0-9_]*$/.test(columnName)) {
      throw new BusinessException(
        400,
        ErrorCodes.DDL_UNSAFE_NAME,
        `Unsafe column name`,
      );
    }
    const sql = `ALTER TABLE biz."${tableName}" DROP COLUMN IF EXISTS "${columnName}"`;
    this.logger.log(`Dropping column: biz.${tableName}.${columnName}`);
    await this.prisma.$executeRawUnsafe(sql);
  }

  /** Create or drop a unique index */
  async syncUniqueIndex(
    tableName: string,
    columnName: string,
    isUnique: boolean,
    dataScope: string,
  ): Promise<void> {
    this.validateName(tableName);
    this.validateName(columnName);
    const indexName = `uniq_${tableName}_${columnName}`;

    // Always drop existing first
    await this.prisma.$executeRawUnsafe(
      `DROP INDEX IF EXISTS biz."${indexName}"`,
    );

    if (isUnique) {
      // Partial unique index: exclude disabled records
      // private/distributed: per-org uniqueness (org_id + column)
      // shared: global uniqueness (column only)
      const uniqueCols =
        dataScope === 'private' || dataScope === 'distributed'
          ? `"org_id", "${columnName}"`
          : `"${columnName}"`;
      const sql = `CREATE UNIQUE INDEX "${indexName}" ON biz."${tableName}"(${uniqueCols}) WHERE "is_archived" = false`;
      this.logger.log(`Creating unique index: ${indexName}`);
      await this.prisma.$executeRawUnsafe(sql);
    }
  }

  /**
   * Count rows where a column is NULL.
   */
  async countNulls(tableName: string, columnName: string): Promise<number> {
    this.validateName(tableName);
    this.validateName(columnName);
    const result = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as "count" FROM biz."${tableName}" WHERE "${columnName}" IS NULL`,
    );
    return Number(result[0]?.count ?? 0);
  }

  /**
   * Backfill NULL values in a column with a given value.
   */
  async backfillNulls(
    tableName: string,
    columnName: string,
    value: any,
  ): Promise<number> {
    this.validateName(tableName);
    this.validateName(columnName);
    const result = await this.prisma.$executeRawUnsafe(
      `UPDATE biz."${tableName}" SET "${columnName}" = $1 WHERE "${columnName}" IS NULL`,
      value,
    );
    return result;
  }

  /**
   * Sync NOT NULL constraint on a column.
   * SET NOT NULL when isRequired=true, DROP NOT NULL when false.
   */
  async syncNotNull(
    tableName: string,
    columnName: string,
    isRequired: boolean,
  ): Promise<void> {
    this.validateName(tableName);
    this.validateName(columnName);
    const action = isRequired ? 'SET NOT NULL' : 'DROP NOT NULL';
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE biz."${tableName}" ALTER COLUMN "${columnName}" ${action}`,
    );
  }

  /** Create index for REFERENCE foreign key column */
  async createForeignKeyIndex(
    tableName: string,
    columnName: string,
  ): Promise<void> {
    this.validateName(tableName);
    this.validateName(columnName);
    const indexName = `idx_${tableName}_${columnName}`;
    const sql = `CREATE INDEX IF NOT EXISTS "${indexName}" ON biz."${tableName}"("${columnName}")`;
    await this.prisma.$executeRawUnsafe(sql);
  }

  /** Add data_status system columns to an existing table */
  async addDataStatusColumns(tableName: string): Promise<void> {
    this.validateName(tableName);
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE biz."${tableName}" ADD COLUMN IF NOT EXISTS "data_status" VARCHAR(20) NOT NULL DEFAULT 'draft'`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE biz."${tableName}" ADD COLUMN IF NOT EXISTS "submitted_by" UUID`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE biz."${tableName}" ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMPTZ`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE biz."${tableName}" ADD COLUMN IF NOT EXISTS "approved_by" UUID`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE biz."${tableName}" ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMPTZ`,
    );
    this.logger.log(`Added data_status columns to biz.${tableName}`);
  }

  /** Remove data_status system columns from a table */
  async removeDataStatusColumns(tableName: string): Promise<void> {
    this.validateName(tableName);
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE biz."${tableName}" DROP COLUMN IF EXISTS "data_status"`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE biz."${tableName}" DROP COLUMN IF EXISTS "submitted_by"`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE biz."${tableName}" DROP COLUMN IF EXISTS "submitted_at"`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE biz."${tableName}" DROP COLUMN IF EXISTS "approved_by"`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE biz."${tableName}" DROP COLUMN IF EXISTS "approved_at"`,
    );
    this.logger.log(`Removed data_status columns from biz.${tableName}`);
  }

  /** Check if a table has any data */
  async hasData(tableName: string): Promise<boolean> {
    this.validateName(tableName);
    const result = await this.prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM biz."${tableName}" LIMIT 1) as "exists"`,
    );
    return result[0]?.exists ?? false;
  }

  /** Drop a table */
  async dropTable(tableName: string): Promise<void> {
    this.validateName(tableName);
    this.logger.log(`Dropping table: biz.${tableName}`);
    await this.prisma.$executeRawUnsafe(
      `DROP TABLE IF EXISTS biz."${tableName}"`,
    );
  }

  /** Count records in a biz table (returns 0 if table does not exist) */
  async countRecords(tableName: string): Promise<number> {
    this.validateName(tableName);
    const exists = await this.tableExists(tableName);
    if (!exists) return 0;
    const result = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM biz."${tableName}"`,
    );
    return Number(result[0]?.count ?? 0);
  }

  /** Check if a table exists in biz schema */
  async tableExists(tableName: string): Promise<boolean> {
    this.validateName(tableName);
    const result = await this.prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'biz' AND table_name = $1
      ) as "exists"`,
      tableName,
    );
    return result[0]?.exists ?? false;
  }

  /** Create a junction table for MULTI_REFERENCE relationships */
  async createJunctionTable(relTableName: string): Promise<void> {
    this.validateName(relTableName);
    const sql = `CREATE TABLE IF NOT EXISTS biz."${relTableName}" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "source_id" UUID NOT NULL,
      "target_id" UUID NOT NULL,
      "org_id" UUID,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE("source_id", "target_id")
    )`;
    await this.prisma.$executeRawUnsafe(sql);
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_${relTableName}_source" ON biz."${relTableName}"("source_id")`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_${relTableName}_target" ON biz."${relTableName}"("target_id")`,
    );
    this.logger.log(`Junction table biz.${relTableName} created`);
  }

  /** Drop a junction table */
  async dropJunctionTable(relTableName: string): Promise<void> {
    this.validateName(relTableName);
    await this.prisma.$executeRawUnsafe(
      `DROP TABLE IF EXISTS biz."${relTableName}"`,
    );
    this.logger.log(`Junction table biz.${relTableName} dropped`);
  }
}
