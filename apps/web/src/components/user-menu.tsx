'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { User, LogOut } from 'lucide-react';
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

export function UserMenu() {
  const router = useRouter();
  const t = useTranslations();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const displayName = user?.displayName || user?.username || '';

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 outline-none">
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {displayName}
        </span>
        <UserAvatar name={displayName} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
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
        <DropdownMenuItem onClick={() => router.push('/settings')}>
          <User className="w-4 h-4 mr-2" />
          {t('userMenu.settings')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
