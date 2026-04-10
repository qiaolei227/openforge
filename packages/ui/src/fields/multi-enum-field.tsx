'use client';

import type { FieldComponentProps } from './field-props';

/** Default color palette for choices without explicit color */
const DEFAULT_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  red: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', ring: 'ring-red-300 dark:ring-red-700' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', ring: 'ring-orange-300 dark:ring-orange-700' },
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', ring: 'ring-yellow-300 dark:ring-yellow-700' },
  green: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', ring: 'ring-green-300 dark:ring-green-700' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', ring: 'ring-blue-300 dark:ring-blue-700' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', ring: 'ring-purple-300 dark:ring-purple-700' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-400', ring: 'ring-pink-300 dark:ring-pink-700' },
  gray: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-400', ring: 'ring-gray-300 dark:ring-gray-600' },
};

function getColorClasses(color?: string, selected?: boolean): string {
  const c = DEFAULT_COLORS[color ?? 'gray'] ?? DEFAULT_COLORS.gray;
  if (selected) {
    return `${c.bg} ${c.text} ring-2 ${c.ring}`;
  }
  return `bg-transparent ${c.text} opacity-50`;
}

export default function MultiEnumField({ field, value, onChange, disabled, error, mode }: FieldComponentProps) {
  const choices = field.options?.choices ?? [];
  const selected: string[] = Array.isArray(value) ? value : value ? [value] : [];

  if (mode === 'view') {
    if (selected.length === 0) return <span className="text-sm">{'\u2014'}</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {selected.map((val) => {
          const choice = choices.find((c) => c.value === val);
          const label = choice?.label ?? val;
          const colorCls = choice
            ? getColorClasses(choice.color, true)
            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400';
          return (
            <span
              key={val}
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorCls}`}
            >
              {label}
            </span>
          );
        })}
      </div>
    );
  }

  const toggleValue = (val: string) => {
    if (disabled) return;
    const next = selected.includes(val)
      ? selected.filter((v) => v !== val)
      : [...selected, val];
    onChange(next);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {choices.map((choice) => {
          const isSelected = selected.includes(choice.value);
          return (
            <button
              key={choice.value}
              type="button"
              disabled={disabled}
              onClick={() => toggleValue(choice.value)}
              className={`
                inline-flex items-center rounded-full px-3 py-1 text-xs font-medium
                transition-all duration-150 cursor-pointer
                disabled:cursor-not-allowed disabled:opacity-50
                border
                ${isSelected
                  ? getColorClasses(choice.color, true) + ' border-transparent'
                  : 'border-input bg-transparent text-muted-foreground hover:bg-accent'
                }
              `}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
