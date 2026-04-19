'use client';

import { useLookupValue } from './use-lookup-value';
import type { FieldComponentProps } from './field-props';

// ─── Lock icon (lucide-react inline SVG for bundle isolation) ───────────────
function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// ─── Color palette reused from enum-field ───────────────────────────────────
const CHOICE_COLORS: Record<string, { bg: string; text: string }> = {
  red:    { bg: 'bg-red-100 dark:bg-red-900/30',    text: 'text-red-700 dark:text-red-400' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400' },
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400' },
  green:  { bg: 'bg-green-100 dark:bg-green-900/30',  text: 'text-green-700 dark:text-green-400' },
  blue:   { bg: 'bg-blue-100 dark:bg-blue-900/30',    text: 'text-blue-700 dark:text-blue-400' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400' },
  pink:   { bg: 'bg-pink-100 dark:bg-pink-900/30',    text: 'text-pink-700 dark:text-pink-400' },
  gray:   { bg: 'bg-gray-100 dark:bg-gray-800',       text: 'text-gray-700 dark:text-gray-400' },
};

function getChoiceColorClasses(color?: string): string {
  const c = CHOICE_COLORS[color ?? 'gray'] ?? CHOICE_COLORS.gray;
  return `${c.bg} ${c.text}`;
}

// ─── Value formatter ─────────────────────────────────────────────────────────
function formatLookupValue(
  value: any,
  targetFieldType: string | null,
  targetFieldOptions: Record<string, any>,
): React.ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground/60 italic select-none">—</span>;
  }

  switch (targetFieldType) {
    case 'INTEGER':
      return (
        <span className="font-mono tabular-nums">
          {typeof value === 'number' ? value.toString() : String(value)}
        </span>
      );

    case 'DECIMAL': {
      const scale: number = targetFieldOptions.scale ?? 2;
      const n = typeof value === 'string' ? Number(value) : Number(value);
      return (
        <span className="font-mono tabular-nums">
          {Number.isFinite(n)
            ? n.toLocaleString(undefined, { minimumFractionDigits: scale, maximumFractionDigits: scale })
            : String(value)}
        </span>
      );
    }

    case 'BOOLEAN':
      return (
        <span>{value ? '是' : '否'}</span>
      );

    case 'DATE': {
      try {
        // Accept ISO strings, timestamps, etc.
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          return <span>{d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>;
        }
      } catch {
        // fall through
      }
      return <span>{String(value)}</span>;
    }

    case 'DATETIME': {
      try {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          return (
            <span>
              {d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
              {' '}
              {d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </span>
          );
        }
      } catch {
        // fall through
      }
      return <span>{String(value)}</span>;
    }

    case 'ENUM': {
      const choices: Array<{ value: string; label: string; color?: string }> =
        targetFieldOptions.choices ?? [];
      const choice = choices.find((c) => c.value === String(value));
      if (choice) {
        return (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getChoiceColorClasses(choice.color)}`}
          >
            {choice.label}
          </span>
        );
      }
      return <span>{String(value)}</span>;
    }

    case 'MULTI_ENUM': {
      const choices: Array<{ value: string; label: string; color?: string }> =
        targetFieldOptions.choices ?? [];
      const vals: string[] = Array.isArray(value) ? value : [String(value)];
      if (vals.length === 0) return <span className="text-muted-foreground/60 italic select-none">—</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {vals.map((v) => {
            const choice = choices.find((c) => c.value === v);
            return (
              <span
                key={v}
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  choice ? getChoiceColorClasses(choice.color) : getChoiceColorClasses()
                }`}
              >
                {choice?.label ?? v}
              </span>
            );
          })}
        </div>
      );
    }

    case 'AUTO_NUMBER':
      return <span className="font-mono text-muted-foreground">{String(value)}</span>;

    // REFERENCE / USER / ORGANIZATION — server already resolved to display text
    case 'REFERENCE':
    case 'USER':
    case 'ORGANIZATION':
    case 'STRING':
    case 'TEXT':
    case 'RICHTEXT':
    case 'TIME':
    default:
      return <span className="truncate">{String(value)}</span>;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface LookupFieldExtraProps {
  /** Source field's columnName — injected by buildFieldExtraProps so the hook can subscribe */
  sourceColumnName?: string;
}

export default function LookupField(
  props: FieldComponentProps & Partial<LookupFieldExtraProps>,
) {
  const { field, value: valueProp, mode, sourceColumnName } = props;
  const opts = (field.options ?? {}) as Record<string, any>;

  const targetFieldType: string | null = opts._resolvedTargetFieldType ?? null;
  const targetFieldOptions: Record<string, any> = opts._resolvedTargetFieldOptions ?? {};

  // In edit mode, read live value from the form's reference-record cache.
  // Fall back to valueProp if sourceColumnName is unavailable.
  const resolvedSourceColumnName: string =
    sourceColumnName ?? opts._resolvedSourceColumnName ?? '';
  const targetFieldColumnName: string = opts.targetFieldColumnName ?? '';

  const hookValue = useLookupValue(resolvedSourceColumnName, targetFieldColumnName);

  // edit mode uses live hook value; view/preview/list mode uses server-provided prop value
  const value = mode === 'edit' ? hookValue : valueProp;

  const formatted = formatLookupValue(value, targetFieldType, targetFieldOptions);
  const isEmpty = value === null || value === undefined || value === '';

  // ── View mode: plain text, no chrome ──────────────────────────────────────
  if (mode === 'view') {
    return (
      <span className="text-sm">
        {formatted}
      </span>
    );
  }

  // ── Edit / preview mode: readonly input box with lock affordance ───────────
  return (
    <div
      className={[
        'flex h-9 w-full items-center rounded-md border border-input',
        'bg-muted/30 px-3 text-sm',
        'cursor-not-allowed select-none',
        isEmpty ? 'text-muted-foreground/50' : 'text-foreground',
      ].join(' ')}
      aria-disabled="true"
      aria-readonly="true"
      title={field.name}
    >
      {/* Value area — fills available space */}
      <span className="flex-1 truncate leading-none">
        {formatted}
      </span>

      {/* Divider + lock icon */}
      <span className="ml-2 flex shrink-0 items-center gap-1.5 text-muted-foreground/40">
        <span className="h-4 w-px bg-border" aria-hidden="true" />
        <LockIcon />
      </span>
    </div>
  );
}
