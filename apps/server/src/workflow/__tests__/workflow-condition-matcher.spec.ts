import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowConditionMatcher } from '../workflow-condition-matcher.service';
import { ConditionExpression } from '../types';

describe('WorkflowConditionMatcher', () => {
  let matcher: WorkflowConditionMatcher;

  beforeEach(() => {
    matcher = new WorkflowConditionMatcher();
  });

  it('returns true when expression is undefined / null', () => {
    expect(matcher.match(undefined, { x: 1 })).toBe(true);
    expect(matcher.match(null, { x: 1 })).toBe(true);
  });

  it('evaluates eq', () => {
    const expr: ConditionExpression = {
      op: 'and',
      conditions: [{ field: 'amount', op: 'eq', value: 100 }],
    };
    expect(matcher.match(expr, { amount: 100 })).toBe(true);
    expect(matcher.match(expr, { amount: 99 })).toBe(false);
  });

  it('evaluates neq', () => {
    const expr: ConditionExpression = {
      op: 'and',
      conditions: [{ field: 'status', op: 'neq', value: 'draft' }],
    };
    expect(matcher.match(expr, { status: 'submitted' })).toBe(true);
    expect(matcher.match(expr, { status: 'draft' })).toBe(false);
  });

  it('evaluates gt and gte', () => {
    const gt: ConditionExpression = {
      op: 'and',
      conditions: [{ field: 'amount', op: 'gt', value: 100 }],
    };
    expect(matcher.match(gt, { amount: 101 })).toBe(true);
    expect(matcher.match(gt, { amount: 100 })).toBe(false);

    const gte: ConditionExpression = {
      op: 'and',
      conditions: [{ field: 'amount', op: 'gte', value: 100 }],
    };
    expect(matcher.match(gte, { amount: 100 })).toBe(true);
    expect(matcher.match(gte, { amount: 99 })).toBe(false);
  });

  it('evaluates lt and lte', () => {
    const lt: ConditionExpression = {
      op: 'and',
      conditions: [{ field: 'amount', op: 'lt', value: 100 }],
    };
    expect(matcher.match(lt, { amount: 99 })).toBe(true);
    expect(matcher.match(lt, { amount: 100 })).toBe(false);

    const lte: ConditionExpression = {
      op: 'and',
      conditions: [{ field: 'amount', op: 'lte', value: 100 }],
    };
    expect(matcher.match(lte, { amount: 100 })).toBe(true);
    expect(matcher.match(lte, { amount: 101 })).toBe(false);
  });

  it('evaluates in and not_in', () => {
    const inExpr: ConditionExpression = {
      op: 'and',
      conditions: [{ field: 'status', op: 'in', value: ['draft', 'submitted'] }],
    };
    expect(matcher.match(inExpr, { status: 'draft' })).toBe(true);
    expect(matcher.match(inExpr, { status: 'approved' })).toBe(false);

    const notInExpr: ConditionExpression = {
      op: 'and',
      conditions: [{ field: 'status', op: 'not_in', value: ['draft', 'submitted'] }],
    };
    expect(matcher.match(notInExpr, { status: 'approved' })).toBe(true);
    expect(matcher.match(notInExpr, { status: 'draft' })).toBe(false);
  });

  it('evaluates between (inclusive)', () => {
    const expr: ConditionExpression = {
      op: 'and',
      conditions: [{ field: 'amount', op: 'between', value: [100, 200] }],
    };
    expect(matcher.match(expr, { amount: 100 })).toBe(true);
    expect(matcher.match(expr, { amount: 150 })).toBe(true);
    expect(matcher.match(expr, { amount: 200 })).toBe(true);
    expect(matcher.match(expr, { amount: 99 })).toBe(false);
    expect(matcher.match(expr, { amount: 201 })).toBe(false);
  });

  it('evaluates is_null and is_not_null', () => {
    const isNull: ConditionExpression = {
      op: 'and',
      conditions: [{ field: 'memo', op: 'is_null' }],
    };
    expect(matcher.match(isNull, { memo: null })).toBe(true);
    expect(matcher.match(isNull, { memo: undefined })).toBe(true);
    expect(matcher.match(isNull, {})).toBe(true);
    expect(matcher.match(isNull, { memo: 'x' })).toBe(false);

    const isNotNull: ConditionExpression = {
      op: 'and',
      conditions: [{ field: 'memo', op: 'is_not_null' }],
    };
    expect(matcher.match(isNotNull, { memo: 'x' })).toBe(true);
    expect(matcher.match(isNotNull, { memo: null })).toBe(false);
    expect(matcher.match(isNotNull, {})).toBe(false);
  });

  it('evaluates nested AND', () => {
    const expr: ConditionExpression = {
      op: 'and',
      conditions: [
        { field: 'amount', op: 'gte', value: 100 },
        {
          op: 'and',
          conditions: [
            { field: 'status', op: 'eq', value: 'submitted' },
            { field: 'currency', op: 'eq', value: 'USD' },
          ],
        },
      ],
    };
    expect(
      matcher.match(expr, { amount: 200, status: 'submitted', currency: 'USD' }),
    ).toBe(true);
    expect(
      matcher.match(expr, { amount: 200, status: 'submitted', currency: 'EUR' }),
    ).toBe(false);
  });

  it('evaluates nested OR mixed with AND', () => {
    const expr: ConditionExpression = {
      op: 'or',
      conditions: [
        { field: 'amount', op: 'gte', value: 10000 },
        {
          op: 'and',
          conditions: [
            { field: 'priority', op: 'eq', value: 'high' },
            { field: 'amount', op: 'gte', value: 1000 },
          ],
        },
      ],
    };
    expect(matcher.match(expr, { amount: 20000, priority: 'low' })).toBe(true);
    expect(matcher.match(expr, { amount: 2000, priority: 'high' })).toBe(true);
    expect(matcher.match(expr, { amount: 2000, priority: 'low' })).toBe(false);
    expect(matcher.match(expr, { amount: 500, priority: 'high' })).toBe(false);
  });

  it('returns false on unknown op', () => {
    const expr: any = {
      op: 'and',
      conditions: [{ field: 'x', op: 'starts_with', value: 'a' }],
    };
    expect(matcher.match(expr, { x: 'abc' })).toBe(false);
  });

  it('returns true on empty AND (vacuous truth)', () => {
    const expr: ConditionExpression = { op: 'and', conditions: [] };
    expect(matcher.match(expr, {})).toBe(true);
  });

  it('returns false on empty OR (vacuous falsity)', () => {
    const expr: ConditionExpression = { op: 'or', conditions: [] };
    expect(matcher.match(expr, {})).toBe(false);
  });

  it('missing field with is_null returns true; with is_not_null returns false', () => {
    const isNull: ConditionExpression = {
      op: 'and',
      conditions: [{ field: 'missing', op: 'is_null' }],
    };
    const isNotNull: ConditionExpression = {
      op: 'and',
      conditions: [{ field: 'missing', op: 'is_not_null' }],
    };
    expect(matcher.match(isNull, { other: 1 })).toBe(true);
    expect(matcher.match(isNotNull, { other: 1 })).toBe(false);
  });
});
