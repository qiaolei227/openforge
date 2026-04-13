import type { ActionCategory, ActionType, DisplayType, ActionPosition } from '../constants';

export interface SysAction {
  id: string;
  modelId: string;
  parentId: string | null;
  code: string;
  name: string;
  icon: string | null;
  category: ActionCategory;
  actionType: ActionType;
  displayType: DisplayType;
  position: ActionPosition;
  sortOrder: number;
  config: Record<string, any> | null;
  visibility: ActionVisibility | null;
  children?: SysAction[];
}

export interface ActionVisibility {
  dataStatus?: string[];
  roles?: string[];
  expression?: string;
}

export interface CreateActionRequest {
  code: string;
  name: string;
  icon?: string;
  parentId?: string;
  actionType: ActionType;
  displayType?: DisplayType;
  position?: ActionPosition;
  sortOrder?: number;
  config?: Record<string, any>;
  visibility?: ActionVisibility;
}

export interface UpdateActionRequest {
  name?: string;
  icon?: string;
  parentId?: string | null;
  displayType?: DisplayType;
  position?: ActionPosition;
  sortOrder?: number;
  config?: Record<string, any>;
  visibility?: ActionVisibility;
}
