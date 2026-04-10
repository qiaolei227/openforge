'use client';

import { useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { MousePointerClick } from 'lucide-react';
import type { Field } from '@openforge/shared';
import { componentRegistry } from '@openforge/render-engine';
import type { PropDef } from '@openforge/render-engine';
import { useCanvasStore, findNode, findParent } from './canvas-store';
import { fieldTypeBadgeClass } from './field-type-styles';

/* ------------------------------------------------------------------ */
/*  Prop Editors                                                       */
/* ------------------------------------------------------------------ */

interface PropEditorProps {
  propDef: PropDef;
  value: any;
  onChange: (key: string, value: any) => void;
  fields: Field[];
}

function StringEditor({ propDef, value, onChange }: PropEditorProps) {
  return (
    <input
      type="text"
      value={value ?? propDef.defaultValue ?? ''}
      onChange={(e) => onChange(propDef.key, e.target.value)}
      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
    />
  );
}

function NumberEditor({ propDef, value, onChange }: PropEditorProps) {
  return (
    <input
      type="number"
      value={value ?? propDef.defaultValue ?? 0}
      onChange={(e) => {
        const num = e.target.value === '' ? propDef.defaultValue ?? 0 : Number(e.target.value);
        onChange(propDef.key, num);
      }}
      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
    />
  );
}

function BooleanEditor({ propDef, value, onChange }: PropEditorProps) {
  const t = useTranslations('designer');
  const checked = value ?? propDef.defaultValue ?? false;

  return (
    <button
      type="button"
      onClick={() => onChange(propDef.key, !checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
        checked ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function SelectEditor({ propDef, value, onChange }: PropEditorProps) {
  const t = useTranslations('designer');
  const currentValue = value ?? propDef.defaultValue;
  const options = propDef.options ?? [];

  return (
    <div className="flex gap-1">
      {options.map((opt) => {
        // Handle null comparison properly
        const isSelected =
          currentValue === opt.value ||
          (currentValue === null && opt.value === null) ||
          (currentValue === undefined && opt.value === null);

        const label = SELECT_OPTION_MAP[opt.label] ? t(SELECT_OPTION_MAP[opt.label]) : opt.label;

        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(propDef.key, opt.value)}
            className={`h-8 flex-1 rounded-md border text-xs transition-colors ${
              isSelected
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-input bg-background text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function FieldSelectEditor({ propDef, value, onChange, fields }: PropEditorProps) {
  const t = useTranslations('designer');
  const currentValue = value ?? '';

  // Filter out system fields and deleted fields
  const availableFields = useMemo(
    () => fields.filter((f) => !f.isSystem && !f.deletedAt),
    [fields],
  );

  return (
    <select
      value={currentValue}
      onChange={(e) => onChange(propDef.key, e.target.value)}
      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
    >
      <option value="">{t('selectField')}</option>
      {availableFields.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name} ({f.columnName})
        </option>
      ))}
    </select>
  );
}

const PROP_LABEL_MAP: Record<string, string> = {
  'Title': 'gridTitle',
  'Columns': 'gridColumns',
  'Collapsible': 'gridCollapsible',
  'Field': 'propField',
  'Span': 'propSpan',
  'Required': 'propRequired',
  'Label': 'propLabel',
  'Width': 'propWidth',
  'Align': 'propAlign',
  'Fixed': 'propFixed',
};

const SELECT_OPTION_MAP: Record<string, string> = {
  'Inherit': 'propInherit',
  'Yes': 'propYes',
  'No': 'propNo',
  'Left': 'propLeft',
  'Center': 'propCenter',
  'Right': 'propRight',
  'None': 'propNone',
};

const TYPE_NAME_MAP: Record<string, string> = {
  'Grid': 'compGrid',
  'Field': 'compField',
  'Column': 'compColumn',
  'SubTable': 'compSubTable',
};

/* ------------------------------------------------------------------ */
/*  Property Panel                                                     */
/* ------------------------------------------------------------------ */

interface PropertyPanelProps {
  fields: Field[];
}

export function PropertyPanel({ fields }: PropertyPanelProps) {
  const t = useTranslations('designer');
  const tFields = useTranslations('fields');
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const layout = useCanvasStore((s) => s.layout);
  const updateNodeProps = useCanvasStore((s) => s.updateNodeProps);
  const selectedNode = useMemo(
    () => (selectedNodeId ? findNode(layout, selectedNodeId) : null),
    [layout, selectedNodeId],
  );

  // Find parent of selected node to detect context (e.g., Field inside 1:N SubTable)
  const parentNode = useMemo(
    () => (selectedNodeId ? findParent(layout, selectedNodeId).parent : null),
    [layout, selectedNodeId],
  );

  const isFieldIn1NSubTable = selectedNode?.type === 'Field'
    && parentNode?.type === 'SubTable'
    && (parentNode.props?.entityType !== 'one_to_one');

  const meta = useMemo(
    () => (selectedNode ? componentRegistry.getMeta(selectedNode.type) : undefined),
    [selectedNode],
  );

  // For Fields inside 1:N SubTable, replace span with width
  const effectivePropsSchema = useMemo(() => {
    if (!meta) return [];
    if (!isFieldIn1NSubTable) return meta.propsSchema;
    return meta.propsSchema.map((p) => {
      if (p.key === 'span') {
        return { key: 'width', label: 'Width', type: 'number' as const, defaultValue: 150 };
      }
      return p;
    });
  }, [meta, isFieldIn1NSubTable]);

  const handleChange = useCallback(
    (key: string, value: any) => {
      if (selectedNodeId) {
        updateNodeProps(selectedNodeId, { [key]: value });
      }
    },
    [selectedNodeId, updateNodeProps],
  );

  // Get display name for the selected node
  const displayName = useMemo(() => {
    if (!selectedNode || !meta) return '';
    const field = fields.find((f) => f.id === selectedNode.props?.fieldId);
    if (selectedNode.type === 'Grid') {
      return selectedNode.props?.title || t('untitledGrid');
    }
    if (selectedNode.type === 'Column' || selectedNode.type === 'Field') {
      return selectedNode.props?.label || field?.name || selectedNode.props?.fieldId || '';
    }
    if (selectedNode.type === 'SubTable') {
      return selectedNode.props?.title || selectedNode.props?.entityCode || 'SubTable';
    }
    return '';
  }, [selectedNode, meta, fields, t]);

  // ── Empty state ──
  if (!selectedNodeId || !selectedNode || !meta) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <MousePointerClick className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">{t('selectComponentToEdit')}</p>
      </div>
    );
  }

  const props = selectedNode.props ?? {};

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {TYPE_NAME_MAP[meta.type] ? t(TYPE_NAME_MAP[meta.type]) : meta.name}
          </span>
          {(selectedNode.type === 'Field' || selectedNode.type === 'Column') && (() => {
            const field = fields.find((f) => f.id === selectedNode.props?.fieldId);
            if (!field) return null;
            const cls = fieldTypeBadgeClass[field.fieldType] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
            return (
              <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
                {tFields(`type${field.fieldType}` as any)}
              </span>
            );
          })()}
        </div>
      </div>

      {/* Properties Form */}
      <div className="flex-1 overflow-y-auto p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('properties')}
        </h4>

        <div className="space-y-4">
          {effectivePropsSchema
            .filter((propDef) => {
              // Hide 'cols' for 1:N SubTable entities
              if (propDef.key === 'cols' && selectedNode.type === 'SubTable') {
                return props.entityType === 'one_to_one';
              }
              return true;
            })
            .map((propDef) => (
            <div key={propDef.key}>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                {PROP_LABEL_MAP[propDef.label] ? t(PROP_LABEL_MAP[propDef.label]) : propDef.label}
              </label>

              {propDef.type === 'string' && (
                <StringEditor
                  propDef={propDef}
                  value={props[propDef.key]}
                  onChange={handleChange}
                  fields={fields}
                />
              )}
              {propDef.type === 'number' && (
                <NumberEditor
                  propDef={propDef}
                  value={props[propDef.key]}
                  onChange={handleChange}
                  fields={fields}
                />
              )}
              {propDef.type === 'boolean' && (
                <BooleanEditor
                  propDef={propDef}
                  value={props[propDef.key]}
                  onChange={handleChange}
                  fields={fields}
                />
              )}
              {propDef.type === 'select' && (
                <SelectEditor
                  propDef={propDef}
                  value={props[propDef.key]}
                  onChange={handleChange}
                  fields={fields}
                />
              )}
              {propDef.type === 'field-select' && (
                <div className="h-8 flex items-center px-2 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">
                  {fields.find((f) => f.id === props[propDef.key])?.name ?? props[propDef.key] ?? '-'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
