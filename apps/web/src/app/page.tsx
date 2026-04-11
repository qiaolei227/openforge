'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { useMenuStore } from '@/stores/menu-store';
import { useCanAccessDesigner } from '@/hooks/use-can-access-designer';

/**
 * 根路径重定向规则（P2.1）：
 *   未登录              → /setup（首次部署）或 /login
 *   is_admin 或有 sys:designer → /apps
 *   其他业务用户        → /workspace
 */
export default function Home() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const loaded = useMenuStore((s) => s.loaded);
  const fetchTree = useMenuStore((s) => s.fetchTree);
  const canDesign = useCanAccessDesigner();

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
    if (!loaded) {
      fetchTree();
      return;
    }
    // canDesign can only be non-null at this point (user and menu both loaded)
    router.replace(canDesign ? '/apps' : '/workspace');
  }, [router, user, loaded, canDesign, fetchProfile, fetchTree]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}
