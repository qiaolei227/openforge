'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Loader2, AlertCircle, LayoutGrid, Plus, ArrowRight } from 'lucide-react';
import { useAccessibleApps, type AccessibleApp } from '@/hooks/use-accessible-apps';
import { useCanAccessDesigner } from '@/hooks/use-can-access-designer';
import { getLucideIcon } from '@/lib/app-icon';
import { cn } from '@/lib/utils';

/** Append 10% alpha to a 6-char hex colour, e.g. '#3b82f6' → '#3b82f61a' */
function withAlpha10(hex: string): string {
  return `${hex}1a`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function ErrorState({ error }: { error: unknown }) {
  const t = useTranslations('launcher');
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : t('loadError');

  return (
    <div className="flex flex-1 items-center justify-center min-h-[60vh]">
      <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-4 max-w-md">
        <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-destructive">{t('loadError')}</p>
          <p className="text-sm text-muted-foreground mt-1">{message}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ isDesigner }: { isDesigner: boolean }) {
  const t = useTranslations('launcher');
  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <LayoutGrid className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold">{t('empty')}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {isDesigner ? t('emptyDesignerCta') : t('emptyContact')}
        </p>
      </div>
      {isDesigner && (
        <Link
          href="/apps?create=1"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('emptyDesignerCta')}
        </Link>
      )}
    </div>
  );
}

function AppCard({ app }: { app: AccessibleApp }) {
  const accent = app.themeColor ?? '#3b82f6';
  const Icon = getLucideIcon(app.icon);

  return (
    <Link
      href={`/workspace/${app.code}`}
      className={cn(
        'group relative flex flex-col rounded-xl border bg-card text-card-foreground',
        'overflow-hidden transition-all duration-200',
        'hover:shadow-md hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {/* Top colour stripe */}
      <div
        className="h-[3px] w-full shrink-0"
        style={{ backgroundColor: accent }}
      />

      <div className="flex flex-col gap-3 p-5">
        {/* Icon badge */}
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0"
          style={{
            backgroundColor: withAlpha10(accent),
            color: accent,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>

        {/* Name + code */}
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold leading-snug line-clamp-1">{app.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{app.code}</span>
        </div>

        {/* Description */}
        {app.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {app.description}
          </p>
        )}
      </div>

      {/* Subtle hover arrow indicator */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}

function NewAppTile() {
  const t = useTranslations('launcher');
  return (
    <Link
      href="/apps?create=1"
      className={cn(
        'group flex flex-col items-center justify-center gap-3 rounded-xl',
        'border-2 border-dashed border-border bg-card/50',
        'p-8 min-h-[144px]',
        'transition-all duration-200',
        'hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-primary/10">
        <Plus className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>
      <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-primary">
        {t('newSystem')}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LauncherPage() {
  const t = useTranslations('launcher');
  const { apps, loading, error } = useAccessibleApps();
  const canDesign = useCanAccessDesigner();
  const isDesigner = canDesign === true;

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;

  const isEmpty = apps.length === 0;

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('subtitle', { count: apps.length })}
        </p>
      </div>

      {/* Content */}
      {isEmpty ? (
        <EmptyState isDesigner={isDesigner} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
          {isDesigner && <NewAppTile />}
        </div>
      )}
    </div>
  );
}
