'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, ChevronLeft, ChevronRight, Check, Globe } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { setTokens } from '@/lib/auth';
import { getApiErrorMessage } from '@/lib/utils';
import { Logo } from '@/components/logo';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const TOTAL_STEPS = 4;

export default function SetupPage() {
  const router = useRouter();
  const t = useTranslations('setup');
  const tErrors = useTranslations('errorCodes');

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Language
  const [locale, setLocale] = useState('zh-CN');

  // Step 2: Organization
  const [orgName, setOrgName] = useState('');
  const [orgCode, setOrgCode] = useState('');

  // Step 3: Admin
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [adminDisplayName, setAdminDisplayName] = useState('');

  // Step 4: System
  const [systemName, setSystemName] = useState('OpenForge');

  const stepTitles = [
    t('step1Title'),
    t('step2Title'),
    t('step3Title'),
    t('step4Title'),
  ];

  const validateStep = (): string | null => {
    if (step === 2) {
      if (!orgName.trim()) return t('orgName');
      if (!orgCode.trim()) return t('orgCode');
    }
    if (step === 3) {
      if (!adminUsername.trim()) return t('adminUsername');
      if (!adminPassword) return t('adminPassword');
      if (adminPassword.length < 6) return t('passwordTooShort');
      if (adminPassword !== adminPasswordConfirm) return t('passwordMismatch');
    }
    if (step === 4) {
      if (!systemName.trim()) return t('systemName');
    }
    return null;
  };

  const handleNext = () => {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const handlePrev = () => {
    setError('');
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { data } = await apiClient.post('/setup/init', {
        locale,
        orgName: orgName.trim(),
        orgCode: orgCode.trim(),
        adminUsername: adminUsername.trim(),
        adminPassword,
        adminDisplayName: adminDisplayName.trim() || adminUsername.trim(),
        systemName: systemName.trim(),
      });
      setTokens(data.accessToken, data.refreshToken);
      router.push('/dashboard');
    } catch (err) {
      setError(getApiErrorMessage(err, (key: string) => tErrors(key), t('initFailed')));
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="flex flex-col gap-3">
            <Label>{t('selectLanguage')}</Label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'zh-CN', label: '中文' },
                { value: 'en', label: 'English' },
              ].map((lang) => (
                <button
                  key={lang.value}
                  type="button"
                  onClick={() => setLocale(lang.value)}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                    locale === lang.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  {lang.label}
                </button>
              ))}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="orgName">{t('orgName')}</Label>
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder={t('orgNamePlaceholder')}
                className="bg-background"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="orgCode">{t('orgCode')}</Label>
              <Input
                id="orgCode"
                value={orgCode}
                onChange={(e) => setOrgCode(e.target.value)}
                placeholder={t('orgCodePlaceholder')}
                className="bg-background"
                required
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adminUsername">{t('adminUsername')}</Label>
              <Input
                id="adminUsername"
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                className="bg-background"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adminDisplayName">{t('adminDisplayName')}</Label>
              <Input
                id="adminDisplayName"
                value={adminDisplayName}
                onChange={(e) => setAdminDisplayName(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adminPassword">{t('adminPassword')}</Label>
              <PasswordInput
                id="adminPassword"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="bg-background"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adminPasswordConfirm">{t('adminPasswordConfirm')}</Label>
              <PasswordInput
                id="adminPasswordConfirm"
                value={adminPasswordConfirm}
                onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                className="bg-background"
                required
              />
            </div>
          </div>
        );

      case 4:
        return (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="systemName">{t('systemName')}</Label>
              <Input
                id="systemName"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                placeholder={t('systemNameDefault')}
                className="bg-background"
                required
              />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2">
          <Logo size={36} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center text-xl">{t('title')}</CardTitle>
            <CardDescription className="text-center">{t('subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Step indicator */}
            <div className="mb-6 flex items-center justify-center gap-1">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => {
                const stepNum = i + 1;
                const isActive = stepNum === step;
                const isDone = stepNum < step;
                return (
                  <div key={stepNum} className="flex items-center gap-1">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : isDone
                            ? 'bg-primary/20 text-primary'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isDone ? <Check className="w-3.5 h-3.5" /> : stepNum}
                    </div>
                    {stepNum < TOTAL_STEPS && (
                      <div
                        className={`h-px w-6 ${isDone ? 'bg-primary/40' : 'bg-border'}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Step title */}
            <div className="mb-4 text-center text-sm font-medium text-muted-foreground">
              {stepTitles[step - 1]}
            </div>

            <form onSubmit={step === TOTAL_STEPS ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              {renderStepContent()}

              {/* Navigation buttons */}
              <div className="mt-6 flex justify-between gap-3">
                {step > 1 ? (
                  <Button type="button" variant="outline" onClick={handlePrev}>
                    <ChevronLeft className="w-4 h-4" />
                    {t('prev')}
                  </Button>
                ) : (
                  <div />
                )}

                {step < TOTAL_STEPS ? (
                  <Button type="submit">
                    {t('next')}
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {loading ? t('initializing') : t('finish')}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
