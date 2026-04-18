import { Injectable } from '@nestjs/common';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { parseEntityField } from './filter-entity-field';

// System fields that can be used in queries
const SYSTEM_COLUMNS = [
  'id',
  'org_id',
  'is_archived',
  'data_status',
  'submitted_by',
  'submitted_at',
  'approved_by',
  'approved_at',
  'version',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
];

const OP_MAP: Record<string, string> = {
  eq: '=',
  ne: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
};

export interface QueryResult {
  dataSql: string;
  countSql: string;
  params: any[];
}

export interface EntityFilterMeta {
  code: string;
  tableName: string;
  fkColumn: string;
  fields: Array<{ columnName: string; fieldType: string }>;
}

export interface EntityFilterRegistry {
  oneToOne?: EntityFilterMeta[];
  detail?: EntityFilterMeta;
}

@Injectable()
export class QueryBuilderService {
  /**
   * Build parameterized SELECT SQL from query DSL.
   *
   * @param tableName - biz schema table name (already validated)
   * @param fields - field metadata from sys_field (active fields only)
   * @param query - the query DTO from the request
   * @param dataScope - 'private' or 'shared'
   * @param orgId - current user's organization ID
   * @returns dataSql (with LIMIT/OFFSET), countSql, and params array
   */
  build(
    tableName: string,
    fields: Array<{ columnName: string; fieldType: string }>,
    query: any,
    dataScope: string,
    orgId: string,
    isTree = false,
    defaultSort?: Array<{ field: string; order: 'asc' | 'desc' }> | null,
    entities?: EntityFilterRegistry,
  ): QueryResult {
    const params: any[] = [];
    const conditions: string[] = [];
    const validColumns = [
      ...SYSTEM_COLUMNS,
      ...(isTree ? ['parent_id'] : []),
      ...fields.map((f) => f.columnName),
    ];

    // org_id filter for private and distributed models
    if (dataScope === 'private' || dataScope === 'distributed') {
      params.push(orgId);
      conditions.push(`"org_id" = $${params.length}`);
    }

    // Exclude archived records by default
    if (!query.includeArchived) {
      conditions.push(`"is_archived" = false`);
    }

    // Tree mode: filter by parentId
    if (isTree && query.treeMode) {
      if (query.parentId) {
        params.push(query.parentId);
        conditions.push(`"parent_id" = $${params.length}::uuid`);
      } else {
        conditions.push(`"parent_id" IS NULL`);
      }
    }

    // Parse filter tree
    if (query.filter) {
      const filterSql = this.buildFilterGroup(query.filter, validColumns, params, tableName, entities);
      if (filterSql) conditions.push(filterSql);
    }

    // Keyword search — restrict to searchFields when provided, else all text-like fields
    if (query.keyword) {
      const searchScope = query.searchFields?.length
        ? fields.filter((f) => query.searchFields!.includes(f.columnName))
        : fields;
      const keywordSql = this.buildKeyword(query.keyword, searchScope, params);
      if (keywordSql) conditions.push(keywordSql);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // ORDER BY
    const orderBy = this.buildSort(query.sort, validColumns, defaultSort);

    // Pagination
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const offset = (page - 1) * pageSize;

    params.push(pageSize);
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const dataSql = `SELECT * FROM biz."${tableName}" ${whereClause} ${orderBy} LIMIT $${limitParam} OFFSET $${offsetParam}`;
    const countSql = `SELECT COUNT(*)::int as "total" FROM biz."${tableName}" ${whereClause}`;

    return { dataSql, countSql, params };
  }

  /**
   * Build a standalone WHERE fragment (no wrapping) for use in auxiliary queries
   * such as the detail-entity subquery in resolveDetailRows.
   *
   * Shifts `$N` placeholders by `paramOffset` so the caller's params[] can be
   * extended at that offset.
   *
   * Limitation: only main-table-style field names are supported. Callers must
   * strip any `__oneToOne__` / `__detail__` prefixes from FilterCondition.field
   * before passing the filter here; otherwise buildCondition throws
   * "Entity filter requires main table context".
   */
  buildFilterOnly(
    filter: any,
    columns: Array<{ columnName: string; fieldType: string }>,
    paramOffset: number,
  ): { sql: string; params: any[] } {
    const validColumns = columns.map((c) => c.columnName);
    const local: any[] = [];
    const sqlRaw = this.buildFilterGroup(filter, validColumns, local);
    if (paramOffset === 0) return { sql: sqlRaw, params: local };
    const sql = sqlRaw.replace(/\$(\d+)/g, (_m, n) => `$${Number(n) + paramOffset}`);
    return { sql, params: local };
  }

  /** Recursively build a filter group (AND/OR) */
  private buildFilterGroup(
    group: any,
    validColumns: string[],
    params: any[],
    mainTable?: string,
    entities?: EntityFilterRegistry,
  ): string {
    if (!group || !group.op || !Array.isArray(group.conditions)) {
      return '';
    }

    const connector = group.op === 'or' ? ' OR ' : ' AND ';
    const parts: string[] = [];

    for (const condition of group.conditions) {
      if ('conditions' in condition && 'op' in condition) {
        // Nested group
        const nested = this.buildFilterGroup(condition, validColumns, params, mainTable, entities);
        if (nested) parts.push(`(${nested})`);
      } else if ('field' in condition) {
        // Leaf condition
        const sql = this.buildCondition(condition, validColumns, params, mainTable, entities);
        if (sql) parts.push(sql);
      }
    }

    return parts.length > 0 ? parts.join(connector) : '';
  }

  /** Build a single filter condition, routing by field prefix */
  private buildCondition(
    condition: any,
    validColumns: string[],
    params: any[],
    mainTable?: string,
    entities?: EntityFilterRegistry,
  ): string {
    const parsed = parseEntityField(condition.field);

    if (parsed.kind === 'main') {
      const columnName = this.resolveColumn(parsed.columnName, validColumns);
      return this.buildLeafSql(`"${columnName}"`, condition.op, condition.value, params);
    }

    if (!mainTable) {
      throw new BusinessException(
        400,
        ErrorCodes.DATA_VALIDATION_FAILED,
        'Entity filter requires main table context',
      );
    }
    const entity = this.resolveEntity(parsed.kind as 'oneToOne' | 'detail', parsed.entityCode!, entities);
    const fieldMeta = entity.fields.find((f) => f.columnName === parsed.columnName);
    if (!fieldMeta) {
      throw new BusinessException(
        400,
        ErrorCodes.DATA_VALIDATION_FAILED,
        `Unknown field: ${parsed.columnName} on entity ${parsed.entityCode}`,
      );
    }
    const leaf = this.buildLeafSql(`sub."${parsed.columnName}"`, condition.op, condition.value, params);
    if (!leaf) return '';
    return `EXISTS (SELECT 1 FROM biz."${entity.tableName}" AS sub WHERE sub."${entity.fkColumn}" = biz."${mainTable}"."id" AND ${leaf})`;
  }

  private resolveEntity(
    kind: 'oneToOne' | 'detail',
    code: string,
    entities?: EntityFilterRegistry,
  ): EntityFilterMeta {
    if (kind === 'oneToOne') {
      const match = entities?.oneToOne?.find((e) => e.code === code);
      if (!match) {
        throw new BusinessException(
          400,
          ErrorCodes.DATA_VALIDATION_FAILED,
          `Unknown entity: ${code}`,
        );
      }
      return match;
    }
    if (entities?.detail?.code === code) return entities.detail;
    throw new BusinessException(
      400,
      ErrorCodes.DATA_VALIDATION_FAILED,
      `Unknown entity: ${code}`,
    );
  }

  /**
   * Build the SQL fragment for a single operator against an already-quoted column reference.
   * columnRef examples: `"name"`, `sub."qty"`
   */
  private buildLeafSql(
    columnRef: string,
    op: string,
    value: any,
    params: any[],
  ): string {
    if (op === 'is_null') {
      return `${columnRef} IS NULL`;
    }
    if (op === 'is_not_null') {
      return `${columnRef} IS NOT NULL`;
    }

    // MULTI_ENUM array operators (PostgreSQL array @>, &&)
    if (op === 'contains' || op === 'contains_all') {
      if (!Array.isArray(value) || value.length === 0) return '';
      params.push(value);
      return `${columnRef} @> $${params.length}::text[]`;
    }
    if (op === 'contains_any') {
      if (!Array.isArray(value) || value.length === 0) return '';
      params.push(value);
      return `${columnRef} && $${params.length}::text[]`;
    }

    if (op === 'in' || op === 'not_in') {
      if (!Array.isArray(value) || value.length === 0) return '';
      const placeholders = value.map((v: any) => {
        params.push(v);
        return `$${params.length}`;
      });
      const inOp = op === 'in' ? 'IN' : 'NOT IN';
      return `${columnRef} ${inOp} (${placeholders.join(', ')})`;
    }

    if (op === 'like') {
      params.push(`%${value}%`);
      return `${columnRef} ILIKE $${params.length}`;
    }

    if (op === 'not_like') {
      params.push(`%${value}%`);
      return `${columnRef} NOT ILIKE $${params.length}`;
    }

    const sqlOp = OP_MAP[op];
    if (!sqlOp) {
      throw new BusinessException(
        400,
        ErrorCodes.DATA_VALIDATION_FAILED,
        `Unknown operator: ${op}`,
      );
    }

    params.push(value);
    return `${columnRef} ${sqlOp} $${params.length}`;
  }

  /** Build keyword search across all STRING/TEXT fields (excludes UUID reference types) */
  private buildKeyword(
    keyword: string,
    fields: Array<{ columnName: string; fieldType: string }>,
    params: any[],
  ): string {
    const stringFields = fields.filter((f) =>
      ['STRING', 'TEXT', 'ENUM', 'AUTO_NUMBER'].includes(f.fieldType),
    );
    const multiEnumFields = fields.filter((f) => f.fieldType === 'MULTI_ENUM');

    if (stringFields.length === 0 && multiEnumFields.length === 0) return '';

    params.push(`%${keyword}%`);
    const paramIndex = params.length;

    const likes = stringFields.map(
      (f) => `"${f.columnName}" ILIKE $${paramIndex}`,
    );
    // MULTI_ENUM: convert array to comma-separated string for ILIKE search
    const arrayLikes = multiEnumFields.map(
      (f) => `array_to_string("${f.columnName}", ',') ILIKE $${paramIndex}`,
    );

    return `(${[...likes, ...arrayLikes].join(' OR ')})`;
  }

  /** Build ORDER BY clause */
  private buildSort(
    sort: any[] | undefined,
    validColumns: string[],
    defaultSort?: Array<{ field: string; order: 'asc' | 'desc' }> | null,
  ): string {
    // User-specified sort takes highest priority
    if (sort && sort.length > 0) {
      const parts = sort.map((s) => {
        const col = this.resolveColumn(s.field, validColumns);
        const dir = s.order === 'asc' ? 'ASC' : 'DESC';
        return `"${col}" ${dir}`;
      });
      return `ORDER BY ${parts.join(', ')}`;
    }

    // Model default sort as fallback
    if (defaultSort && defaultSort.length > 0) {
      const parts = defaultSort
        .filter((s) => validColumns.includes(s.field))
        .map((s) => `"${s.field}" ${s.order === 'asc' ? 'ASC' : 'DESC'}`);
      if (parts.length > 0) {
        return `ORDER BY ${parts.join(', ')}`;
      }
    }

    // Ultimate fallback
    return 'ORDER BY "created_at" DESC';
  }

  /** Resolve and validate a field name against the whitelist */
  private resolveColumn(
    fieldName: string,
    validColumns: string[],
  ): string {
    if (!validColumns.includes(fieldName)) {
      throw new BusinessException(
        400,
        ErrorCodes.DATA_VALIDATION_FAILED,
        `Unknown field: ${fieldName}`,
      );
    }
    return fieldName;
  }
}
