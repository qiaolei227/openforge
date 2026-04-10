export interface LayoutNode {
  id?: string;             // Optional for backward compat with P1.3 auto-generated layouts
  type: string;
  props?: Record<string, any>;
  children?: LayoutNode[];
}

export interface LayoutConfig {
  type: 'Form' | 'List';
  children: LayoutNode[];
}
