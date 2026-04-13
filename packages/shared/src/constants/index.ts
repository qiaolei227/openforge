export const PLATFORMS = ['web', 'mobile'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const USER_STATUS = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUS)[number];

export const ORG_STATUS = ['active', 'disabled'] as const;
export type OrgStatus = (typeof ORG_STATUS)[number];

export const DATA_SCOPE = ['private', 'shared', 'distributed'] as const;
export const FIELD_TYPES = [
  'STRING', 'TEXT', 'RICHTEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN',
  'DATE', 'DATETIME', 'TIME', 'ENUM', 'MULTI_ENUM',
  'AUTO_NUMBER', 'REFERENCE', 'MULTI_REFERENCE', 'USER', 'ORGANIZATION',
  'FILE', 'IMAGE',
] as const;
export const REFERENCE_FIELD_TYPES = ['REFERENCE', 'USER', 'ORGANIZATION'] as const;
export const VIRTUAL_FIELD_TYPES = ['MULTI_REFERENCE'] as const;
export const FILE_FIELD_TYPES = ['FILE', 'IMAGE'] as const;
export function isVirtualFieldType(type: string): boolean {
  return (VIRTUAL_FIELD_TYPES as readonly string[]).includes(type);
}

export const ENTITY_TYPES = ['one_to_one', 'one_to_many'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const TREE_SYSTEM_FIELD = 'parent_id';

export const SYSTEM_FIELDS = [
  'id', 'org_id', 'is_archived', 'version',
  'created_by', 'updated_by', 'created_at', 'updated_at',
] as const;

export const DATA_STATUS = ['draft', 'submitted', 'approved', 'pending_revision'] as const;
export type DataStatus = (typeof DATA_STATUS)[number];

export const DATA_STATUS_FIELDS = [
  'data_status', 'submitted_by', 'submitted_at',
] as const;

export const ACTION_CATEGORIES = ['system', 'custom'] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

export const ACTION_TYPES = ['builtin', 'openUrl', 'callApi', 'script'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const DISPLAY_TYPES = ['button', 'split', 'menu'] as const;
export type DisplayType = (typeof DISPLAY_TYPES)[number];

export const ACTION_POSITIONS = ['list', 'detail', 'both'] as const;
export type ActionPosition = (typeof ACTION_POSITIONS)[number];
