import type { FilterGroup, FilterCondition } from '@openforge/shared';

export function isFilterGroup(node: FilterCondition | FilterGroup): node is FilterGroup {
  return 'conditions' in node;
}

/** Immutably remove a node at a given path */
export function removeAtPath(group: FilterGroup, path: number[]): FilterGroup {
  if (path.length === 1) {
    return { ...group, conditions: group.conditions.filter((_, i) => i !== path[0]) };
  }
  const [head, ...tail] = path;
  const newConditions = [...group.conditions];
  newConditions[head] = removeAtPath(newConditions[head] as FilterGroup, tail);
  return { ...group, conditions: newConditions };
}

/** Immutably update a condition/group at a given path */
export function updateAtPath(
  group: FilterGroup,
  path: number[],
  updater: (node: FilterCondition | FilterGroup) => FilterCondition | FilterGroup,
): FilterGroup {
  if (path.length === 0) {
    return updater(group) as FilterGroup;
  }
  const [head, ...tail] = path;
  const newConditions = [...group.conditions];
  const child = newConditions[head];
  if (tail.length === 0) {
    newConditions[head] = updater(child);
  } else {
    newConditions[head] = updateAtPath(child as FilterGroup, tail, updater);
  }
  return { ...group, conditions: newConditions };
}

/** Immutably push a new node to a group at a given path */
export function pushAtPath(
  group: FilterGroup,
  path: number[],
  node: FilterCondition | FilterGroup,
): FilterGroup {
  if (path.length === 0) {
    return { ...group, conditions: [...group.conditions, node] };
  }
  const [head, ...tail] = path;
  const newConditions = [...group.conditions];
  newConditions[head] = pushAtPath(newConditions[head] as FilterGroup, tail, node);
  return { ...group, conditions: newConditions };
}
