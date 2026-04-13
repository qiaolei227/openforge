'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SETTINGS_NAV } from '@/config/settings-nav';
import { cn } from '@/lib/utils';

export function SettingsSidebar() {
  const pathname = usePathname() ?? '';
  const t = useTranslations('settingsNav');

  return (
    <aside className="w-56 border-r border-border shrink-0 overflow-y-auto bg-background">
      <nav className="p-2 pt-4 space-y-4">
        {SETTINGS_NAV.map((group) => (
          <div key={group.labelKey}>
            <div className="px-2 py-1 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              {t(group.labelKey)}
            </div>
            <ul className="mt-1">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                const isPlanned = item.feature === 'planned';
                const Icon = item.icon;
                return (
                  <li key={item.code}>
                    {isPlanned ? (
                      <span className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md text-muted-foreground/50 cursor-not-allowed" title={t('comingSoon')}>
                        <Icon className="w-4 h-4" />
                        <span className="flex-1">{t(item.labelKey)}</span>
                      </span>
                    ) : (
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors',
                          isActive && 'bg-accent font-medium',
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="flex-1">{t(item.labelKey)}</span>
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
