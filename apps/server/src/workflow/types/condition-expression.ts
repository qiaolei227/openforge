export type ConditionLeaf = {
  field: string;
  op:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'in'
    | 'not_in'
    | 'between'
    | 'is_null'
    | 'is_not_null';
  value?: unknown;
};

export type ConditionExpression = {
  op: 'and' | 'or';
  conditions: Array<ConditionLeaf | ConditionExpression>;
};

export function isConditionExpression(
  c: ConditionLeaf | ConditionExpression,
): c is ConditionExpression {
  return (c as ConditionExpression).op === 'and' || (c as ConditionExpression).op === 'or';
}
