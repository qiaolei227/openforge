'use client';

import type { FieldComponentProps } from './field-props';

const INPUT_BASE =
  'flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs border-input disabled:cursor-not-allowed disabled:opacity-50';

/** Default color palette for choices without explicit color */
const DEFAULT_COLORS: Record<string, { bg: string; text: string }> = {
  red: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400' },
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400' },
  green: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-400' },
  gray: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-400' },
};

function getColorClasses(color?: string): string {
  const c = DEFAULT_COLORS[color ?? 'gray'] ?? DEFAULT_COLORS.gray;
  return `${c.bg} ${c.text}`;
}

export default function EnumField({ field, value, onChange, disabled, error, mode }: FieldComponentProps) {
  const choices = field.options?.choices ?? [];

  if (mode === 'view') {
    if (!value) return <span className="text-sm">{'\u2014'}</span>;
    const choice = choices.find((c) => c.value === value);
    if (!choice) return <span className="text-sm">{String(value)}</span>;
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getColorClasses(choice.color)}`}
      >
        {choice.label}
      </span>
    );
  }

  return (
    <div>
      <select
        className={`${INPUT_BASE} ${error ? 'border-red-500' : ''}`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
      >
        <option value="">{'\u2014'}</option>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
