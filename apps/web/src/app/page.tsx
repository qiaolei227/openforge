'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { useMenuStore } from '@/stores/menu-store';

/**
 * 根路径重定向规则（P2.1）：
 *   未登录              → /setup（首次部署）或 /login
 *   is_admin            → /apps（设计器）
 *   有 sys:designer 权限 → /apps
 *   其他业务用户        → /workspace
 */
export default function Home() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const { tree, loaded, fetchTree } = useMenuStore();

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

    // Ensure we have both the profile (isAdmin) and the menu tree before deciding
    if (!user) {
      fetchProfile();
      return;
    }
    if (!loaded) {
      fetchTree();
      return;
    }

    const hasDesigner =
      user.isAdmin ||
      tree.some(
        (m) => m.code === 'sys:designer' && (m.permissions ?? []).includes('view'),
      );
    router.replace(hasDesigner ? '/apps' : '/workspace');
  }, [router, user, loaded, tree, fetchProfile, fetchTree]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}
