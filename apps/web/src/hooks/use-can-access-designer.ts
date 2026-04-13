'use client';

import { useAuthStore } from '@/stores/auth-store';

/**
 * `true` iff the current user can enter the application designer at `/apps/*`:
 * user.identity must be 'designer' or 'admin'.
 *
 * Returns `null` until the profile has loaded, so callers
 * can distinguish "unknown yet" from "denied".
 */
export function useCanAccessDesigner(): boolean | null {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  return user.identity === 'designer' || user.identity === 'admin';
}
