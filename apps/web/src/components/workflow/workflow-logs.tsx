'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  instance: any;
}

/**
 * Collapsible operation history for the form-page workflow section.
 *
 * Sorted newest-first. Each entry shows: timestamp · localized action · optional comment.
 */
export function WorkflowLogs({ instance }: Props) {
  const tSection = useTranslations('workflow.section');
  const tLog = useTranslations('workflow.logActions');

  const [expanded, setExpanded] = useState(false);

  const logs = useMemo(() => {
    const raw: any[] = instance?.logs ?? [];
    return raw
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [instance?.logs]);

  if (logs.length === 0) return null;

  const labelFor = (action: string): string => {
    try {
      return tLog(action as any);
    } catch {
      return action;
    }
  };

  return (
    <div className="border-t pt-3">
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <span>{tSection('logsToggle', { count: logs.length })}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto pr-2">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 text-xs">
              <span className="text-muted-foreground whitespace-nowrap min-w-[110px] tabular-nums">
                {format(new Date(log.createdAt), 'MM-dd HH:mm:ss')}
              </span>
              <span className="font-medium text-foreground/90 whitespace-nowrap">
                {labelFor(log.action)}
              </span>
              {log.comment && (
                <span className="text-muted-foreground italic break-all">
                  &ldquo;{log.comment}&rdquo;
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
