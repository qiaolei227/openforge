'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (getAccessToken()) {
      router.replace('/dashboard');
      return;
    }
    apiClient.get('/setup/status').then(({ data }) => {
      router.replace(data.initialized ? '/login' : '/setup');
    }).catch(() => {
      router.replace('/login');
    });
  }, [router]);
  return null;
}
