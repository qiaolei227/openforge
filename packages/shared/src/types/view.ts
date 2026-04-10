import type { LayoutConfig } from './layout';

export interface SysView {
  id: string;
  modelId: string;
  name: string;
  type: 'form' | 'list';
  layout: LayoutConfig;
  config?: Record<string, unknown>;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
