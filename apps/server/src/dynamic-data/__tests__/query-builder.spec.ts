import { describe, it, expect } from 'vitest';
import { QueryBuilderService } from '../query-builder.service';

const svc = new QueryBuilderService();

const mainFields = [
  { columnName: 'name', fieldType: 'STRING' },
  { columnName: 'qty', fieldType: 'INTEGER' },
];

const entitiesFixture = {
  oneToOne: [
    {
      code: 'customer',
      tableName: 'app_customer',
      fkColumn: 'order_id',
      fields: [
        { columnName: 'company_name', fieldType: 'STRING' },
        { columnName: 'vip_level', fieldType: 'INTEGER' },
      ],
    },
  ],
  detail: {
    code: 'order_line',
    tableName: 'app_order_line',
    fkColumn: 'order_id',
    fields: [
      { columnName: 'product_id', fieldType: 'REFERENCE' },
      { columnName: 'qty', fieldType: 'INTEGER' },
    ],
  },
};

describe('QueryBuilderService entity filter', () => {
  it('emits EXISTS for oneToOne field', () => {
    const { dataSql, params } = svc.build(
      'app_order',
      mainFields,
      {
        filter: {
          op: 'and',
          conditions: [
            { field: '__oneToOne__customer__company_name', op: 'like', value: 'ACME' },
          ],
        },
      },
      'private',
      'org-1',
      false,
      null,
      entitiesFixture,
    );
    expect(dataSql).toContain('EXISTS');
    expect(dataSql).toContain('biz."app_customer"');
    expect(dataSql).toContain('sub."company_name"');
    expect(dataSql).toContain('sub."order_id" = biz."app_order"."id"');
    expect(dataSql).toContain('ILIKE');
    expect(params).toContain('%ACME%');
  });

  it('emits EXISTS for detail integer gt', () => {
    const { dataSql, params } = svc.build(
      'app_order',
      mainFields,
      {
        filter: {
          op: 'and',
          conditions: [
            { field: '__detail__order_line__qty', op: 'gt', value: 5 },
          ],
        },
      },
      'private',
      'org-1',
      false,
      null,
      entitiesFixture,
    );
    expect(dataSql).toContain('biz."app_order_line"');
    expect(dataSql).toContain('sub."qty" > $');
    expect(params).toContain(5);
  });

  it('supports is_null on entity field', () => {
    const { dataSql } = svc.build(
      'app_order',
      mainFields,
      {
        filter: {
          op: 'and',
          conditions: [
            { field: '__oneToOne__customer__company_name', op: 'is_null' },
          ],
        },
      },
      'private',
      'org-1',
      false,
      null,
      entitiesFixture,
    );
    expect(dataSql).toContain('sub."company_name" IS NULL');
  });

  it('mixes main and entity conditions', () => {
    const { dataSql } = svc.build(
      'app_order',
      mainFields,
      {
        filter: {
          op: 'and',
          conditions: [
            { field: 'name', op: 'eq', value: 'X' },
            { field: '__detail__order_line__qty', op: 'gt', value: 0 },
          ],
        },
      },
      'private',
      'org-1',
      false,
      null,
      entitiesFixture,
    );
    expect(dataSql).toContain('"name" = $');
    expect(dataSql).toContain('EXISTS');
  });

  it('throws on undeclared entity code', () => {
    expect(() =>
      svc.build(
        'app_order',
        mainFields,
        {
          filter: {
            op: 'and',
            conditions: [
              { field: '__oneToOne__unknown__x', op: 'eq', value: 1 },
            ],
          },
        },
        'private',
        'org-1',
        false,
        null,
        entitiesFixture,
      ),
    ).toThrow(/Unknown entity/);
  });

  it('throws on undeclared entity field', () => {
    expect(() =>
      svc.build(
        'app_order',
        mainFields,
        {
          filter: {
            op: 'and',
            conditions: [
              { field: '__oneToOne__customer__not_a_field', op: 'eq', value: 1 },
            ],
          },
        },
        'private',
        'org-1',
        false,
        null,
        entitiesFixture,
      ),
    ).toThrow(/Unknown field/);
  });

  it('is backward compatible when entities omitted', () => {
    const { dataSql } = svc.build(
      'app_order',
      mainFields,
      {
        filter: { op: 'and', conditions: [{ field: 'name', op: 'eq', value: 'X' }] },
      },
      'private',
      'org-1',
    );
    expect(dataSql).toContain('"name" = $');
  });
});

// ─── LOOKUP JOIN tests (Tasks 11-14) ───────────────────────────────────────

const lookupMetaFixture = [
  {
    fieldId: 'f_lkp',
    lookupColumnName: 'material_name',
    alias: 'lk_f_lkp',
    sourceColumnName: 'material_id',
    firstHopTable: 'biz."app_material"',
    firstHopColumn: 'name',
  },
];

describe('QueryBuilderService LOOKUP JOIN (Task 11)', () => {
  it('emits LEFT JOIN when filter references a LOOKUP', () => {
    const { dataSql, params } = svc.build(
      'app_order_item',
      [
        { columnName: 'material_id', fieldType: 'REFERENCE' },
        { columnName: 'material_name', fieldType: 'LOOKUP' },
      ],
      { filter: { op: 'and', conditions: [{ field: 'material_name', op: 'like', value: '螺丝' }] } },
      'shared', 'org-1', false, null, undefined,
      lookupMetaFixture,
    );
    expect(dataSql).toContain('LEFT JOIN biz."app_material" AS "lk_f_lkp"');
    expect(dataSql).toMatch(/ON\s+biz\."app_order_item"\."material_id"\s*=\s*"lk_f_lkp"\."id"/);
    expect(dataSql).toContain('"lk_f_lkp"."name" ILIKE');
    expect(params).toContain('%螺丝%');
  });

  it('does NOT emit JOIN when LOOKUP is not referenced in filter or sort', () => {
    const { dataSql } = svc.build(
      'app_order_item',
      [
        { columnName: 'material_id', fieldType: 'REFERENCE' },
        { columnName: 'material_name', fieldType: 'LOOKUP' },
      ],
      { filter: { op: 'and', conditions: [{ field: 'material_id', op: 'eq', value: 'some-uuid' }] } },
      'shared', 'org-1', false, null, undefined,
      lookupMetaFixture,
    );
    expect(dataSql).not.toContain('LEFT JOIN');
  });

  it('uses bare SELECT * when no LOOKUPs are active', () => {
    const { dataSql } = svc.build(
      'app_order_item',
      [{ columnName: 'name', fieldType: 'STRING' }],
      {},
      'shared', 'org-1',
    );
    expect(dataSql).toMatch(/^SELECT \* FROM/);
  });

  it('uses qualified SELECT when LOOKUP is active', () => {
    const { dataSql } = svc.build(
      'app_order_item',
      [
        { columnName: 'material_id', fieldType: 'REFERENCE' },
        { columnName: 'material_name', fieldType: 'LOOKUP' },
      ],
      { filter: { op: 'and', conditions: [{ field: 'material_name', op: 'like', value: 'x' }] } },
      'shared', 'org-1', false, null, undefined,
      lookupMetaFixture,
    );
    expect(dataSql).toMatch(/SELECT\s+biz\."app_order_item"\.\*/);
  });

  it('includes LOOKUP JOIN in countSql', () => {
    const { countSql } = svc.build(
      'app_order_item',
      [
        { columnName: 'material_id', fieldType: 'REFERENCE' },
        { columnName: 'material_name', fieldType: 'LOOKUP' },
      ],
      { filter: { op: 'and', conditions: [{ field: 'material_name', op: 'like', value: 'x' }] } },
      'shared', 'org-1', false, null, undefined,
      lookupMetaFixture,
    );
    expect(countSql).toContain('LEFT JOIN biz."app_material" AS "lk_f_lkp"');
  });
});

describe('QueryBuilderService LOOKUP sort + USER/ORG source (Task 12)', () => {
  it('generates LEFT JOIN and alias-based ORDER BY when sorting by LOOKUP', () => {
    const { dataSql } = svc.build(
      'app_order_item',
      [
        { columnName: 'material_id', fieldType: 'REFERENCE' },
        { columnName: 'material_name', fieldType: 'LOOKUP' },
      ],
      { sort: [{ field: 'material_name', order: 'asc' }] },
      'shared', 'org-1', false, null, undefined,
      lookupMetaFixture,
    );
    expect(dataSql).toContain('LEFT JOIN biz."app_material" AS "lk_f_lkp"');
    expect(dataSql).toMatch(/ORDER BY\s+"lk_f_lkp"\."name"\s+ASC/i);
  });

  it('joins public.sys_user for USER source lookup', () => {
    const userLookupMeta = [
      {
        fieldId: 'f_lkp_on',
        lookupColumnName: 'owner_name',
        alias: 'lk_f_lkp_on',
        sourceColumnName: 'owner_id',
        firstHopTable: 'public."sys_user"',
        firstHopColumn: 'name',
      },
    ];
    const { dataSql } = svc.build(
      'app_task',
      [
        { columnName: 'owner_id', fieldType: 'USER' },
        { columnName: 'owner_name', fieldType: 'LOOKUP' },
      ],
      { filter: { op: 'and', conditions: [{ field: 'owner_name', op: 'like', value: 'alice' }] } },
      'shared', 'org-1', false, null, undefined,
      userLookupMeta,
    );
    expect(dataSql).toContain('LEFT JOIN public."sys_user" AS "lk_f_lkp_on"');
  });

  it('joins public.sys_org for ORGANIZATION source lookup', () => {
    const orgLookupMeta = [
      {
        fieldId: 'f_lkp_org',
        lookupColumnName: 'dept_name',
        alias: 'lk_f_lkp_org',
        sourceColumnName: 'dept_id',
        firstHopTable: 'public."sys_org"',
        firstHopColumn: 'name',
      },
    ];
    const { dataSql } = svc.build(
      'app_employee',
      [
        { columnName: 'dept_id', fieldType: 'ORGANIZATION' },
        { columnName: 'dept_name', fieldType: 'LOOKUP' },
      ],
      { sort: [{ field: 'dept_name', order: 'desc' }] },
      'shared', 'org-1', false, null, undefined,
      orgLookupMeta,
    );
    expect(dataSql).toContain('LEFT JOIN public."sys_org" AS "lk_f_lkp_org"');
    expect(dataSql).toMatch(/ORDER BY\s+"lk_f_lkp_org"\."name"\s+DESC/i);
  });
});

describe('QueryBuilderService two-hop JOIN (Task 13)', () => {
  it('generates two-hop JOIN when LOOKUP target is a REFERENCE field', () => {
    const twoHopMeta = [
      {
        fieldId: 'f_lkp',
        lookupColumnName: 'material_supplier_name',
        alias: 'lk_f_lkp',
        sourceColumnName: 'material_id',
        firstHopTable: 'biz."app_material"',
        firstHopColumn: 'default_supplier_id',
        secondHopAlias: 'lk_f_lkp_display',
        secondHopTable: 'biz."app_supplier"',
        secondHopColumn: 'name',
        secondHopJoinFromColumn: 'default_supplier_id',
      },
    ];
    const { dataSql } = svc.build(
      'app_order_item',
      [
        { columnName: 'material_id', fieldType: 'REFERENCE' },
        { columnName: 'material_supplier_name', fieldType: 'LOOKUP' },
      ],
      { filter: { op: 'and', conditions: [{ field: 'material_supplier_name', op: 'like', value: '海尔' }] } },
      'shared', 'org-1', false, null, undefined,
      twoHopMeta,
    );
    expect(dataSql).toContain('LEFT JOIN biz."app_material" AS "lk_f_lkp"');
    expect(dataSql).toContain('LEFT JOIN biz."app_supplier" AS "lk_f_lkp_display"');
    expect(dataSql).toContain('"lk_f_lkp_display"."name" ILIKE');
  });

  it('second hop JOIN uses first-hop alias as left side', () => {
    const twoHopMeta = [
      {
        fieldId: 'f_lkp',
        lookupColumnName: 'material_supplier_name',
        alias: 'lk_f_lkp',
        sourceColumnName: 'material_id',
        firstHopTable: 'biz."app_material"',
        firstHopColumn: 'default_supplier_id',
        secondHopAlias: 'lk_f_lkp_display',
        secondHopTable: 'biz."app_supplier"',
        secondHopColumn: 'name',
        secondHopJoinFromColumn: 'default_supplier_id',
      },
    ];
    const { dataSql } = svc.build(
      'app_order_item',
      [
        { columnName: 'material_id', fieldType: 'REFERENCE' },
        { columnName: 'material_supplier_name', fieldType: 'LOOKUP' },
      ],
      { sort: [{ field: 'material_supplier_name', order: 'asc' }] },
      'shared', 'org-1', false, null, undefined,
      twoHopMeta,
    );
    expect(dataSql).toMatch(
      /LEFT JOIN biz\."app_supplier" AS "lk_f_lkp_display" ON "lk_f_lkp"\."default_supplier_id" = "lk_f_lkp_display"\."id"/,
    );
    expect(dataSql).toMatch(/ORDER BY\s+"lk_f_lkp_display"\."name"\s+ASC/i);
  });
});

describe('QueryBuilderService LOOKUP SELECT alias (Task 14)', () => {
  it('selects the LOOKUP column when JOINed so the resolver can skip it', () => {
    const { dataSql } = svc.build(
      'app_order_item',
      [
        { columnName: 'material_id', fieldType: 'REFERENCE' },
        { columnName: 'material_name', fieldType: 'LOOKUP' },
      ],
      { filter: { op: 'and', conditions: [{ field: 'material_name', op: 'like', value: 'x' }] } },
      'shared', 'org-1', false, null, undefined,
      lookupMetaFixture,
    );
    expect(dataSql).toMatch(
      /SELECT\s+biz\."app_order_item"\.\*,\s*"lk_f_lkp"\."name"\s+AS\s+"material_name"/,
    );
  });

  it('selects second-hop column for two-hop LOOKUP', () => {
    const twoHopMeta = [
      {
        fieldId: 'f_lkp',
        lookupColumnName: 'material_supplier_name',
        alias: 'lk_f_lkp',
        sourceColumnName: 'material_id',
        firstHopTable: 'biz."app_material"',
        firstHopColumn: 'default_supplier_id',
        secondHopAlias: 'lk_f_lkp_display',
        secondHopTable: 'biz."app_supplier"',
        secondHopColumn: 'name',
        secondHopJoinFromColumn: 'default_supplier_id',
      },
    ];
    const { dataSql } = svc.build(
      'app_order_item',
      [
        { columnName: 'material_id', fieldType: 'REFERENCE' },
        { columnName: 'material_supplier_name', fieldType: 'LOOKUP' },
      ],
      { filter: { op: 'and', conditions: [{ field: 'material_supplier_name', op: 'like', value: '海尔' }] } },
      'shared', 'org-1', false, null, undefined,
      twoHopMeta,
    );
    expect(dataSql).toMatch(
      /SELECT\s+biz\."app_order_item"\.\*,\s*"lk_f_lkp_display"\."name"\s+AS\s+"material_supplier_name"/,
    );
  });

  it('LOOKUP not in filter/sort has undefined value so resolver runs Stage B', () => {
    // When LOOKUP is NOT JOINed, it won't appear in SELECT, so record[lookupColumnName]
    // will be undefined after the raw SQL query → resolver's skipAlreadyResolved check
    // (r[lf.columnName] === undefined) triggers Stage B resolution.
    const { dataSql } = svc.build(
      'app_order_item',
      [
        { columnName: 'material_id', fieldType: 'REFERENCE' },
        { columnName: 'material_name', fieldType: 'LOOKUP' },
      ],
      {},
      'shared', 'org-1', false, null, undefined,
      lookupMetaFixture,
    );
    // No JOIN → bare SELECT *
    expect(dataSql).toMatch(/^SELECT \* FROM/);
    expect(dataSql).not.toContain('LEFT JOIN');
    // material_name won't be in SELECT, so it will be undefined on the raw record
    expect(dataSql).not.toContain('"material_name"');
  });
});

describe('QueryBuilderService.buildFilterOnly', () => {
  it('builds a pure WHERE fragment with no param offset', () => {
    const result = svc.buildFilterOnly(
      {
        op: 'and',
        conditions: [{ field: 'qty', op: 'gt', value: 10 }],
      },
      [{ columnName: 'qty', fieldType: 'INTEGER' }],
      0,
    );
    expect(result.sql).toContain('"qty" > $1');
    expect(result.params).toEqual([10]);
  });

  it('shifts placeholders by paramOffset', () => {
    const result = svc.buildFilterOnly(
      {
        op: 'and',
        conditions: [
          { field: 'qty', op: 'gt', value: 10 },
          { field: 'qty', op: 'lt', value: 100 },
        ],
      },
      [{ columnName: 'qty', fieldType: 'INTEGER' }],
      3, // pretend $1..$3 are already used
    );
    expect(result.sql).toContain('"qty" > $4');
    expect(result.sql).toContain('"qty" < $5');
    expect(result.params).toEqual([10, 100]);
  });
});
