import { Injectable } from '@nestjs/common';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';

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
      const filterSql = this.buildFilterGroup(query.filter, validColumns, params);
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

  /** Recursively build a filter group (AND/OR) */
  private buildFilterGroup(
    group: any,
    validColumns: string[],
    params: any[],
  ): string {
    if (!group || !group.op || !Array.isArray(group.conditions)) {
      return '';
    }

    const connector = group.op === 'or' ? ' OR ' : ' AND ';
    const parts: string[] = [];

    for (const condition of group.conditions) {
      if ('conditions' in condition && 'op' in condition) {
        // Nested group
        const nested = this.buildFilterGroup(condition, validColumns, params);
        if (nested) parts.push(`(${nested})`);
      } else if ('field' in condition) {
        // Leaf condition
        const sql = this.buildCondition(condition, validColumns, params);
        if (sql) parts.push(sql);
      }
    }

    return parts.length > 0 ? parts.join(connector) : '';
  }

  /** Build a single filter condition */
  private buildCondition(
    condition: any,
    validColumns: string[],
    params: any[],
  ): string {
    const { field, op, value } = condition;

    // Validate field name against whitelist
    const columnName = this.resolveColumn(field, validColumns);

    if (op === 'is_null') {
      return `"${columnName}" IS NULL`;
    }
    if (op === 'is_not_null') {
      return `"${columnName}" IS NOT NULL`;
    }

    // MULTI_ENUM array operators (PostgreSQL array @>, &&)
    if (op === 'contains' || op === 'contains_all') {
      // @> checks that the column array contains ALL of the given values
      if (!Array.isArray(value) || value.length === 0) return '';
      params.push(value);
      return `"${columnName}" @> $${params.length}::text[]`;
    }
    if (op === 'contains_any') {
      // && checks that the column array overlaps with (has ANY of) the given values
      if (!Array.isArray(value) || value.length === 0) return '';
      params.push(value);
      return `"${columnName}" && $${params.length}::text[]`;
    }

    if (op === 'in' || op === 'not_in') {
      if (!Array.isArray(value) || value.length === 0) return '';
      const placeholders = value.map((v: any) => {
        params.push(v);
        return `$${params.length}`;
      });
      const inOp = op === 'in' ? 'IN' : 'NOT IN';
      return `"${columnName}" ${inOp} (${placeholders.join(', ')})`;
    }

    if (op === 'like') {
      params.push(`%${value}%`);
      return `"${columnName}" ILIKE $${params.length}`;
    }

    if (op === 'not_like') {
      params.push(`%${value}%`);
      return `"${columnName}" NOT ILIKE $${params.length}`;
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
    return `"${columnName}" ${sqlOp} $${params.length}`;
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
