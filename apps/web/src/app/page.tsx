'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

/**
 * 根路径重定向规则：
 *   未登录              → /setup（首次部署）或 /login
 *   已登录任何用户      → /launcher
 */
export default function Home() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  useEffect(() => {
    if (!getAccessToken()) {
      apiClient
        .get('/setup/status')
        .then(({ data }) => {
          router.replace(data.initialized ? '/login' : '/setup');
        })
        .catch(() => {
          router.replace('/login');
        });
      return;
    }

    if (!user) {
      fetchProfile();
      return;
    }

    router.replace('/launcher');
  }, [router, user, fetchProfile]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}
