// Types
export type { LayoutConfig, LayoutNode } from '@openforge/shared';
export type { RenderMode, RenderContextValue, ServiceContextValue, EntityWithFields, TranslateFn } from './context';
export type { LayoutColumnConfig, ListRendererProps } from './list/list-renderer';

// Provider & Hooks
export { RenderProvider } from './provider';
export type { RenderProviderProps } from './provider';
export { useRenderContext, useServiceContext, useFieldComponent } from './hooks';

// Form
export { FormRenderer } from './form/form-renderer';
export { GridSection } from './form/grid-section';
export { SubTableSection } from './form/sub-table-section';
export { FieldNode } from './form/field-node';

// List
export { ListRenderer } from './list/list-renderer';

// Utilities (kept from before)
export { generateDefaultFormLayout, generateDefaultListLayout } from './auto-layout';
export { ensureNodeIds } from './ensure-ids';

// Designer registry (used by property panel)
export { componentRegistry } from './registry';
export type { ComponentMeta, PropDef, RegisteredComponent, ComponentRegistry } from './registry';
