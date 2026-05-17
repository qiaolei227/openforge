import { Injectable } from '@nestjs/common';
import { ConditionExpression, ConditionLeaf, isConditionExpression } from './types';

/**
 * Evaluates a workflow trigger condition expression against a record.
 *
 * Used by WorkflowService.findMatching to pick the highest-priority enabled
 * workflow whose condition matches the submitted record.
 *
 * Semantics:
 *  - undefined / null expr → matches everything (true)
 *  - empty AND → true (vacuous truth)
 *  - empty OR → false (vacuous falsity)
 *  - unknown op → false (defensive)
 */
@Injectable()
export class WorkflowConditionMatcher {
  match(
    expr: ConditionExpression | undefined | null,
    record: Record<string, any>,
  ): boolean {
    if (!expr) return true;
    return this.evalExpression(expr, record);
  }

  private evalExpression(
    expr: ConditionExpression,
    record: Record<string, any>,
  ): boolean {
    const results = expr.conditions.map((c) =>
      isConditionExpression(c) ? this.evalExpression(c, record) : this.evalLeaf(c, record),
    );
    return expr.op === 'and' ? results.every(Boolean) : results.some(Boolean);
  }

  private evalLeaf(leaf: ConditionLeaf, record: Record<string, any>): boolean {
    const v = record[leaf.field];
    switch (leaf.op) {
      case 'eq':
        return v === leaf.value;
      case 'neq':
        return v !== leaf.value;
      case 'gt':
        return (v as any) > (leaf.value as any);
      case 'gte':
        return (v as any) >= (leaf.value as any);
      case 'lt':
        return (v as any) < (leaf.value as any);
      case 'lte':
        return (v as any) <= (leaf.value as any);
      case 'in':
        return Array.isArray(leaf.value) && (leaf.value as any[]).includes(v);
      case 'not_in':
        return Array.isArray(leaf.value) && !(leaf.value as any[]).includes(v);
      case 'between':
        return (
          Array.isArray(leaf.value) &&
          (v as any) >= (leaf.value as any)[0] &&
          (v as any) <= (leaf.value as any)[1]
        );
      case 'is_null':
        return v === null || v === undefined;
      case 'is_not_null':
        return v !== null && v !== undefined;
      default:
        return false;
    }
  }
}
