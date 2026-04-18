import { describe, it, expect } from 'vitest';
import { parseEntityField, buildEntityFieldName } from '../filter-entity-field';

describe('parseEntityField', () => {
  it('returns main for unprefixed field', () => {
    expect(parseEntityField('name')).toEqual({ kind: 'main', columnName: 'name' });
  });

  it('parses __oneToOne__ prefix', () => {
    expect(parseEntityField('__oneToOne__customer__company_name')).toEqual({
      kind: 'oneToOne',
      entityCode: 'customer',
      columnName: 'company_name',
    });
  });

  it('parses __detail__ prefix', () => {
    expect(parseEntityField('__detail__order_line__product_id')).toEqual({
      kind: 'detail',
      entityCode: 'order_line',
      columnName: 'product_id',
    });
  });

  it('handles columnName containing underscores', () => {
    expect(parseEntityField('__oneToOne__c__a_b_c_d')).toEqual({
      kind: 'oneToOne',
      entityCode: 'c',
      columnName: 'a_b_c_d',
    });
  });

  it('returns main for malformed prefix', () => {
    expect(parseEntityField('__oneToOne__only_two_parts')).toEqual({
      kind: 'main',
      columnName: '__oneToOne__only_two_parts',
    });
  });

  it('returns main when columnName is empty', () => {
    expect(parseEntityField('__oneToOne__customer__')).toEqual({
      kind: 'main',
      columnName: '__oneToOne__customer__',
    });
  });
});

describe('buildEntityFieldName', () => {
  it('builds oneToOne field name', () => {
    expect(buildEntityFieldName('oneToOne', 'customer', 'company_name'))
      .toBe('__oneToOne__customer__company_name');
  });
  it('builds detail field name', () => {
    expect(buildEntityFieldName('detail', 'order_line', 'qty'))
      .toBe('__detail__order_line__qty');
  });
});
