'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { UpdateProfileRequest, ChangePasswordRequest } from '@openforge/shared';

function ProfileTab() {
  const t = useTranslations('settings');
  const user = useAuthStore((s) => s.user);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setEmail(user.email || '');
    }
  }, [user]);

  const handleSave = async () => {
    setMessage(null);

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage({ type: 'error', text: t('invalidEmail') });
      return;
    }

    setSaving(true);
    try {
      await apiClient.patch<void>('/auth/profile', {
        displayName,
        email: email || undefined,
      } satisfies UpdateProfileRequest);
      await fetchProfile();
      setMessage({ type: 'success', text: t('profileSaved') });
    } catch {
      setMessage({ type: 'error', text: t('saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md space-y-6">
      <div className="space-y-2">
        <Label>{t('username')}</Label>
        <Input value={user?.username || ''} disabled />
      </div>
      <div className="space-y-2">
        <Label>{t('email')}</Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>{t('displayName')}</Label>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      {message && (
        <p className={message.type === 'success' ? 'text-sm text-green-600' : 'text-sm text-destructive'}>
          {message.text}
        </p>
      )}
      <Button onClick={handleSave} disabled={saving}>
        {t('save')}
      </Button>
    </div>
  );
}

function SecurityTab() {
  const t = useTranslations('settings');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async () => {
    setMessage(null);

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: t('passwordTooShort') });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: t('passwordMismatch') });
      return;
    }

    setSaving(true);
    try {
      await apiClient.post('/auth/change-password', {
        oldPassword,
        newPassword,
      } satisfies ChangePasswordRequest);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ type: 'success', text: t('passwordChanged') });
    } catch (err: any) {
      const errorCode = err?.response?.data?.errorCode;
      if (errorCode === 'AUTH_WRONG_PASSWORD') {
        setMessage({ type: 'error', text: t('wrongPassword') });
      } else {
        setMessage({ type: 'error', text: t('saveFailed') });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md space-y-6">
      <div className="space-y-2">
        <Label>{t('currentPassword')}</Label>
        <PasswordInput
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>{t('newPassword')}</Label>
        <PasswordInput
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>{t('confirmPassword')}</Label>
        <PasswordInput
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      {message && (
        <p className={message.type === 'success' ? 'text-sm text-green-600' : 'text-sm text-destructive'}>
          {message.text}
        </p>
      )}
      <Button onClick={handleSubmit} disabled={saving || !oldPassword || !newPassword || !confirmPassword}>
        {t('changePassword')}
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  const t = useTranslations('settings');

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t('title')}</h1>
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">{t('profile')}</TabsTrigger>
          <TabsTrigger value="security">{t('security')}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-6">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="security" className="mt-6">
          <SecurityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
