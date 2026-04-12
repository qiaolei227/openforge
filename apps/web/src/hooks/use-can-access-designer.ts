'use client';

import { useAuthStore } from '@/stores/auth-store';
import { useMenuStore } from '@/stores/menu-store';

/**
 * `true` iff the current user can enter the application designer at `/apps/*`:
 * either they are a platform `is_admin` (bypasses RBAC) or their role grants
 * `view` on the `sys:designer` menu.
 *
 * Returns `null` until both the profile and menu tree have loaded, so callers
 * can distinguish "unknown yet" from "denied".
 */
export function useCanAccessDesigner(): boolean | null {
  const user = useAuthStore((s) => s.user);
  const tree = useMenuStore((s) => s.globalTree);
  const menuLoaded = useMenuStore((s) => !!s.globalLoadedAt);

  if (!user) return null;
  if (user.isAdmin) return true;
  if (!menuLoaded) return null;
  return tree.some(
    (m) => m.code === 'sys:designer' && (m.permissions ?? []).includes('view'),
  );
}
