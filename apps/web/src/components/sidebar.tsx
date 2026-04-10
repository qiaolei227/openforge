'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  Building2,
  Users,
  Blocks,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from './logo';
import { cn } from '@/lib/utils';

interface NavChild {
  href: string;
  labelKey: string;
}

interface NavItem {
  href?: string;
  labelKey: string;
  Icon: LucideIcon;
  children?: NavChild[];
}

const navItems: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', Icon: LayoutDashboard },
  { href: '/orgs', labelKey: 'nav.orgs', Icon: Building2 },
  { href: '/users', labelKey: 'nav.users', Icon: Users },
  { href: '/apps', labelKey: 'nav.apps', Icon: Blocks },
  { href: '/config', labelKey: 'nav.config', Icon: Settings },
];

function NavItemLink({
  item,
  isActive,
  collapsed,
  t,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  t: (key: string) => string;
}) {
  return (
    <Link
      href={item.href!}
      title={collapsed ? t(item.labelKey) : undefined}
      className={cn(
        'flex items-center rounded-md px-3 py-2 text-sm transition-colors',
        collapsed ? 'justify-center px-0' : 'gap-3',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <item.Icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
    </Link>
  );
}

function NavItemWithChildren({
  item,
  pathname,
  collapsed,
  t,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  t: (key: string) => string;
}) {
  const isChildActive = item.children!.some((c) => pathname === c.href);
  const [expanded, setExpanded] = useState(isChildActive);
  const [showPopover, setShowPopover] = useState(false);

  useEffect(() => {
    if (isChildActive) setExpanded(true);
  }, [isChildActive]);

  if (collapsed) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setShowPopover(true)}
        onMouseLeave={() => setShowPopover(false)}
      >
        <div
          className={cn(
            'flex items-center justify-center rounded-md px-0 py-2 text-sm transition-colors',
            isChildActive
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <item.Icon className="w-4 h-4 shrink-0" />
        </div>
        {showPopover && (
          <div className="absolute left-full top-0 ml-2 z-50 min-w-[140px] rounded-md border bg-popover p-1 shadow-md">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              {t(item.labelKey)}
            </div>
            {item.children!.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  'block rounded-sm px-2 py-1.5 text-sm transition-colors',
                  pathname === child.href
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                {t(child.labelKey)}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm transition-colors',
          isChildActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <item.Icon className="w-4 h-4 shrink-0" />
        <span className="truncate flex-1 text-left">{t(item.labelKey)}</span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="ml-9 mt-0.5 space-y-0.5">
          {item.children!.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              className={cn(
                'block rounded-md px-3 py-1.5 text-sm transition-colors',
                pathname === child.href
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t(child.labelKey)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <aside
      className={cn(
        'border-r bg-muted/30 p-4 flex flex-col transition-all duration-300',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      <div className={cn('mb-6', collapsed ? 'px-0 flex justify-center' : 'px-2')}>
        <Logo size={28} showText={!collapsed} />
      </div>

      <nav className="space-y-1 flex-1">
        {navItems.map((item) => {
          if (item.children) {
            return (
              <NavItemWithChildren
                key={item.labelKey}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
                t={t}
              />
            );
          }
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <NavItemLink
              key={item.href}
              item={item}
              isActive={isActive}
              collapsed={collapsed}
              t={t}
            />
          );
        })}
      </nav>

      <div className="border-t pt-2">
        <button
          onClick={onToggle}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          className={cn(
            'flex items-center rounded-md py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full',
            collapsed ? 'justify-center px-0' : 'gap-3 px-3',
          )}
        >
          {collapsed ? (
            <ChevronsRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronsLeft className="w-4 h-4" />
              <span>{t('sidebar.collapse')}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
