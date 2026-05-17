'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import { zhCN as zhLocale, enUS as enLocale } from 'date-fns/locale';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNotificationStore } from '@/stores/notification-store';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const dateLocale = locale === 'zh-CN' || locale === 'zh' ? zhLocale : enLocale;
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const loadNotifications = useNotificationStore((s) => s.loadNotifications);
  const loadUnreadCount = useNotificationStore((s) => s.loadUnreadCount);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);

  useEffect(() => {
    void loadUnreadCount();
  }, [loadUnreadCount]);

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) {
          void loadNotifications();
        }
      }}
    >
      <PopoverTrigger
        aria-label={t('bell')}
        title={t('bell')}
        className="relative inline-flex w-8 h-8 items-center justify-center rounded-md hover:bg-accent transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-medium text-sm">{t('bell')}</span>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => markAllRead()}
            disabled={unreadCount === 0}
          >
            {t('markAllRead')}
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t('empty')}
            </div>
          ) : (
            notifications.slice(0, 10).map((n) => {
              const href = n.navigateTo ?? '/workspace/inbox';
              return (
                <Link
                  key={n.id}
                  href={href}
                  className={cn(
                    'flex gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-accent transition-colors',
                    !n.isRead && 'bg-accent/30',
                  )}
                  onClick={() => {
                    if (!n.isRead) void markRead(n.id);
                  }}
                >
                  <span
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      n.isRead ? 'bg-transparent' : 'bg-primary',
                    )}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-tight truncate">
                      {n.title}
                    </div>
                    {n.body && (
                      <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {n.body}
                      </div>
                    )}
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(n.createdAt), {
                        addSuffix: true,
                        locale: dateLocale,
                      })}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
        <div className="border-t px-4 py-2 text-center">
          <Link
            href="/workspace/inbox"
            className="text-sm text-primary hover:underline"
          >
            {t('viewAll')}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
