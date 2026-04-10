'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { useAuthStore } from '@/stores/auth-store';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const [ready, setReady] = useState(false);

  const redirectToLogin = useCallback(() => {
    router.push('/login');
  }, [router]);

  // Initial auth check
  useEffect(() => {
    if (!checkAuth()) {
      redirectToLogin();
      return;
    }
    setReady(true);
  }, [checkAuth, redirectToLogin]);

  // Re-check auth when page is restored from bfcache
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted && !checkAuth()) {
        redirectToLogin();
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [checkAuth, redirectToLogin]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchProfile();
    }
  }, [isAuthenticated, fetchProfile]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
