'use client';

import { useTranslations } from 'next-intl';
import type { Field, LayoutConfig } from '@openforge/shared';
import {
  RenderProvider,
  FormRenderer,
  ListRenderer,
  type EntityWithFields,
  type LayoutColumnConfig,
} from '@openforge/render-engine';
import { useRenderServices } from '@/hooks/use-render-services';

/* ------------------------------------------------------------------ */
/*  Lightweight list preview table                                     */
/* ------------------------------------------------------------------ */

function ListPreviewTable({
  columns,
  fields,
}: {
  columns: LayoutColumnConfig[];
  fields: Field[];
}) {
  const t = useTranslations('designer');
  const fieldMap = new Map(fields.map((f) => [f.id, f]));
  const mockRows = [0, 1, 2];

  if (columns.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        {t('noColumnsConfigured')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/40">
            <th className="h-10 w-8 min-w-[32px] border-b px-2 text-center">
              <input type="checkbox" className="h-4 w-4 rounded border-input" disabled />
            </th>
            <th className="h-10 w-8 min-w-[32px] border-b px-2 text-center text-xs font-medium text-muted-foreground">
              #
            </th>
            {columns.map((col) => {
              const field = fieldMap.get(col.fieldId);
              const label = col.label ?? field?.name ?? '?';
              const width = col.width ?? 150;
              const align = col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left';
              return (
                <th
                  key={col.fieldId}
                  className={`h-10 border-b px-3 text-xs font-medium text-muted-foreground whitespace-nowrap ${align}`}
                  style={{ width, minWidth: width }}
                >
                  {label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {mockRows.map((rowIdx) => (
            <tr key={rowIdx} className="hover:bg-muted/30">
              <td className="h-10 border-b px-2 text-center">
                <input type="checkbox" className="h-4 w-4 rounded border-input" disabled />
              </td>
              <td className="h-10 border-b px-2 text-center text-xs text-muted-foreground">
                {rowIdx + 1}
              </td>
              {columns.map((col) => (
                <td key={col.fieldId} className="h-10 border-b px-3">
                  <div className="h-5 w-3/4 rounded bg-muted/40" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Preview Mode Container                                             */
/* ------------------------------------------------------------------ */

interface PreviewModeProps {
  layout: LayoutConfig;
  viewType: 'form' | 'list';
  fields: Field[];
  entities?: EntityWithFields[];
}

export function PreviewMode({ layout, viewType, fields, entities = [] }: PreviewModeProps) {
  const tAll = useTranslations();
  const services = useRenderServices(fields, entities);

  return (
    <div className="h-full overflow-auto bg-muted/20">
      <RenderProvider
        mode="preview"
        fields={fields}
        entities={entities}
        t={tAll}
        services={services}
      >
        {viewType === 'form' ? (
          <FormRenderer layout={layout} />
        ) : (
          <ListRenderer layout={layout}>
            {({ layoutColumns, fields: ctxFields }) => (
              <div className="p-8">
                <ListPreviewTable columns={layoutColumns} fields={ctxFields} />
              </div>
            )}
          </ListRenderer>
        )}
      </RenderProvider>
    </div>
  );
}
