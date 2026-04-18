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
