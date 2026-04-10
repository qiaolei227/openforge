import type { ComponentType } from 'react';

/* ── Prop definition for the property panel ── */

export interface PropDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'field-select';
  options?: { label: string; value: any }[];
  defaultValue?: any;
}

/* ── Component metadata ── */

export interface ComponentMeta {
  type: string;
  name: string;
  icon?: string;
  category: 'layout' | 'field' | 'advanced';
  allowChildren: boolean;
  defaultProps: Record<string, any>;
  propsSchema: PropDef[];
}

/* ── Registered component entry ── */

export interface RegisteredComponent {
  meta: ComponentMeta;
  component: ComponentType<any>;
  designComponent?: ComponentType<any>;
}

/* ── Component Registry ── */

export class ComponentRegistry {
  private registry = new Map<string, RegisteredComponent>();

  register(
    meta: ComponentMeta,
    component: ComponentType<any>,
    designComponent?: ComponentType<any>,
  ): void {
    this.registry.set(meta.type, { meta, component, designComponent });
  }

  get(type: string): RegisteredComponent | undefined {
    return this.registry.get(type);
  }

  getMeta(type: string): ComponentMeta | undefined {
    return this.registry.get(type)?.meta;
  }

  getAll(): RegisteredComponent[] {
    return Array.from(this.registry.values());
  }

  getByCategory(category: ComponentMeta['category']): RegisteredComponent[] {
    return this.getAll().filter((r) => r.meta.category === category);
  }
}

/* ── Global singleton ── */

export const componentRegistry = new ComponentRegistry();

/* ── Placeholder component (returns null) ── */

const Placeholder: ComponentType<any> = () => null;

/* ── Shared prop definitions ── */

const COLS_OPTIONS: PropDef = {
  key: 'cols',
  label: 'Columns',
  type: 'select',
  options: [
    { label: '1', value: 1 },
    { label: '2', value: 2 },
    { label: '3', value: 3 },
    { label: '4', value: 4 },
  ],
  defaultValue: 4,
};

/* ── Register default components ── */

componentRegistry.register(
  {
    type: 'Grid',
    name: 'Grid',
    icon: 'LayoutGrid',
    category: 'layout',
    allowChildren: true,
    defaultProps: { title: '', cols: 4, collapsible: false },
    propsSchema: [
      { key: 'title', label: 'Title', type: 'string' },
      COLS_OPTIONS,
      { key: 'collapsible', label: 'Collapsible', type: 'boolean', defaultValue: false },
    ],
  },
  Placeholder,
);

componentRegistry.register(
  {
    type: 'Field',
    name: 'Field',
    icon: 'FormInput',
    category: 'field',
    allowChildren: false,
    defaultProps: { fieldId: '', span: 1, required: null },
    propsSchema: [
      { key: 'fieldId', label: 'Field', type: 'field-select' },
      { key: 'span', label: 'Span', type: 'number', defaultValue: 1 },
      {
        key: 'required',
        label: 'Required',
        type: 'select',
        options: [
          { label: 'Inherit', value: null },
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ],
        defaultValue: null,
      },
    ],
  },
  Placeholder,
);

componentRegistry.register(
  {
    type: 'Column',
    name: 'Column',
    icon: 'Columns3',
    category: 'field',
    allowChildren: false,
    defaultProps: { fieldId: '', label: '', width: 150, align: 'left' },
    propsSchema: [
      { key: 'label', label: 'Label', type: 'string' },
      { key: 'width', label: 'Width', type: 'number', defaultValue: 150 },
      {
        key: 'align',
        label: 'Align',
        type: 'select',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' },
        ],
        defaultValue: 'left',
      },
    ],
  },
  Placeholder,
);

componentRegistry.register(
  {
    type: 'SubTable',
    name: 'Sub Table',
    icon: 'Table2',
    category: 'advanced',
    allowChildren: true,
    defaultProps: { entityId: '', entityCode: '', entityType: '', title: '', cols: 4, collapsible: false },
    propsSchema: [
      { key: 'title', label: 'Title', type: 'string' },
      COLS_OPTIONS,
      { key: 'collapsible', label: 'Collapsible', type: 'boolean', defaultValue: false },
    ],
  },
  Placeholder,
);
