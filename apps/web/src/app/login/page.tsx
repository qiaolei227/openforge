'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { setTokens, getAccessToken } from '@/lib/auth';
import { getApiErrorMessage } from '@/lib/utils';
import { Logo } from '@/components/logo';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const REMEMBER_KEY = 'openforge_remember_username';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('auth');
  const tErrors = useTranslations('errorCodes');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  // Show warning from redirect reason
  useEffect(() => {
    if (searchParams.get('reason') === 'session_replaced') {
      setWarning(t('sessionReplaced'));
    }
  }, [searchParams, t]);

  // Check initialization status + redirect if already authenticated
  useEffect(() => {
    if (getAccessToken()) {
      router.replace('/launcher');
      return;
    }
    apiClient.get('/setup/status').then(({ data }) => {
      if (!data.initialized) {
        router.replace('/setup');
      }
    }).catch(() => {});
  }, [router]);

  // Restore remembered username
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setUsername(saved);
      setRemember(true);
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError(t('usernameRequired'));
      return;
    }
    if (!password) {
      setError(t('passwordRequired'));
      return;
    }

    setLoading(true);

    try {
      const { data } = await apiClient.post('/auth/login', { username, password, platform: 'web' });
      setTokens(data.accessToken, data.refreshToken);

      // Remember / forget username
      if (remember) {
        localStorage.setItem(REMEMBER_KEY, username);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      router.push('/launcher');
    } catch (err) {
      setError(getApiErrorMessage(err, (key: string) => tErrors(key), t('loginFailed')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <Logo size={36} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center text-xl">{t('login')}</CardTitle>
            <CardDescription className="text-center">
              AI-Native Low-Code Platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {warning && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                  {warning}
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="username">{t('username')}</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('usernamePlaceholder')}
                  autoComplete="username"
                  autoFocus
                  className="bg-background"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">{t('password')}</Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  autoComplete="current-password"
                  className="bg-background"
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(checked) => setRemember(checked === true)}
                />
                <Label htmlFor="remember" className="cursor-pointer text-sm font-normal text-muted-foreground">
                  {t('rememberUsername')}
                </Label>
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? t('loggingIn') : t('loginButton')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
