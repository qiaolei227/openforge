'use client';

import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { LogOut, Sun, Moon, Monitor, Globe, Check } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/* ─── Locale helpers ─── */

const LOCALES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
];

function getCurrentLocale(): string {
  if (typeof document === 'undefined') return 'zh-CN';
  return (
    document.cookie
      .split('; ')
      .find((row) => row.startsWith('locale='))
      ?.split('=')[1] || 'zh-CN'
  );
}

/* ─── Theme config ─── */

const THEMES = [
  { value: 'light', icon: Sun, label: '浅色' },
  { value: 'dark', icon: Moon, label: '深色' },
  { value: 'system', icon: Monitor, label: '跟随系统' },
] as const;

/* ─── Avatar ─── */

function UserAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = (name || '?')[0].toUpperCase();
  return (
    <div
      className="rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-primary-foreground font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  );
}

/* ─── Main ─── */

export function UserMenu() {
  const router = useRouter();
  const t = useTranslations();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { theme, setTheme } = useTheme();

  const [currentLocale, setCurrentLocale] = useState('zh-CN');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCurrentLocale(getCurrentLocale());
  }, []);

  const displayName = user?.displayName || user?.username || '';

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleLocale = (code: string) => {
    document.cookie = `locale=${code};path=/;max-age=${365 * 24 * 3600}`;
    setCurrentLocale(code);
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 outline-none rounded-md px-1.5 py-1 hover:bg-accent transition-colors ml-1">
        <UserAvatar name={displayName} size={24} />
        <span className="text-sm max-w-[80px] truncate hidden sm:inline">{displayName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* User info */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="font-medium">{displayName}</div>
            {user?.email && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {user.email}
              </div>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Theme */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal py-1">
            主题
          </DropdownMenuLabel>
          {mounted && THEMES.map((t) => {
            const Icon = t.icon;
            return (
              <DropdownMenuItem
                key={t.value}
                onClick={() => setTheme(t.value)}
                className="flex items-center gap-2"
              >
                <Icon className="w-4 h-4" />
                <span className="flex-1">{t.label}</span>
                {theme === t.value && <Check className="w-3.5 h-3.5 text-primary" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Locale */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal py-1">
            语言
          </DropdownMenuLabel>
          {LOCALES.map((loc) => (
            <DropdownMenuItem
              key={loc.code}
              onClick={() => handleLocale(loc.code)}
              className="flex items-center gap-2"
            >
              <Globe className="w-4 h-4" />
              <span className="flex-1">{loc.label}</span>
              {currentLocale === loc.code && <Check className="w-3.5 h-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Logout */}
        <DropdownMenuItem
          onClick={handleLogout}
          variant="destructive"
        >
          <LogOut className="w-4 h-4 mr-2" />
          {t('userMenu.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
