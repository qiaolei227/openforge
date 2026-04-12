'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { useTranslations } from 'next-intl';
import { Loader2, Table2, Hash } from 'lucide-react';
import { useAiStore } from '@/stores/ai-store';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';

interface ConfigParam {
  id: string;
  code: string;
  name: string;
  value: string | null;
  defaultVal: string | null;
  description: string | null;
}

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';
const btnPrimary =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none';
const btnOutline =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none';

/** Map config code -> i18n key for label, description, and unit */
const CONFIG_META: Record<
  string,
  { labelKey: string; descKey: string; unitKey: string; group: 'field' | 'decimal' }
> = {
  'system.string.default_length': {
    labelKey: 'stringDefaultLength',
    descKey: 'stringDefaultLengthDesc',
    unitKey: 'stringDefaultLengthUnit',
    group: 'field',
  },
  'system.decimal.default_precision': {
    labelKey: 'decimalPrecision',
    descKey: 'decimalPrecisionDesc',
    unitKey: 'decimalPrecisionUnit',
    group: 'decimal',
  },
  'system.decimal.default_scale': {
    labelKey: 'decimalScale',
    descKey: 'decimalScaleDesc',
    unitKey: 'decimalScaleUnit',
    group: 'decimal',
  },
};

export default function ConfigPage() {
  const tConfig = useTranslations('config');
  const tCommon = useTranslations('common');

  // --- data state ---
  const [configs, setConfigs] = useState<ConfigParam[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // original values snapshot (to detect changes)
  const originalValues = useRef<Record<string, string>>({});

  // --- confirm dialog for reset ---
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // --- toast ---
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- AI context ---
  const setAiContext = useAiStore((s) => s.setContext);
  useEffect(() => {
    setAiContext({ page: 'config' });
  }, [setAiContext]);

  // --- fetch ---
  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<ConfigParam[]>('/config');
      const list = Array.isArray(data) ? data : [];
      setConfigs(list);
      const vals: Record<string, string> = {};
      for (const c of list) {
        vals[c.code] = c.value ?? c.defaultVal ?? '';
      }
      setFormValues(vals);
      originalValues.current = { ...vals };
    } catch {
      showToast(tConfig('fetchFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, tConfig]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  // --- helpers ---
  const handleInputChange = (code: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [code]: value }));
  };

  const hasChanges = () => {
    return Object.keys(formValues).some(
      (code) => formValues[code] !== originalValues.current[code],
    );
  };

  // --- save ---
  const handleSave = async () => {
    setSaving(true);
    try {
      const changedCodes = Object.keys(formValues).filter(
        (code) => formValues[code] !== originalValues.current[code],
      );
      await Promise.all(
        changedCodes.map((code) =>
          apiClient.patch(`/config/${code}`, { value: formValues[code] }),
        ),
      );
      // update snapshot
      originalValues.current = { ...formValues };
      showToast(tConfig('saveSuccess'), 'success');
    } catch {
      showToast(tCommon('operationFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- reset to defaults ---
  const handleResetDefaults = async () => {
    setShowResetConfirm(false);
    setSaving(true);
    try {
      const resetOps: Promise<unknown>[] = [];
      const newVals: Record<string, string> = {};
      for (const c of configs) {
        const defaultValue = c.defaultVal ?? '';
        newVals[c.code] = defaultValue;
        resetOps.push(apiClient.patch(`/config/${c.code}`, { value: defaultValue }));
      }
      await Promise.all(resetOps);
      setFormValues(newVals);
      originalValues.current = { ...newVals };
      showToast(tConfig('saveSuccess'), 'success');
    } catch {
      showToast(tCommon('operationFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- group configs ---
  const fieldConfigs = configs.filter((c) => CONFIG_META[c.code]?.group === 'field');
  const decimalConfigs = configs.filter((c) => CONFIG_META[c.code]?.group === 'decimal');

  // --- render a single config input row ---
  const renderConfigItem = (config: ConfigParam) => {
    const meta = CONFIG_META[config.code];
    if (!meta) return null;
    return (
      <div key={config.code} className="space-y-1.5">
        <label className="text-sm font-medium">{tConfig(meta.labelKey as never)}</label>
        <p className="text-xs text-muted-foreground">{tConfig(meta.descKey as never)}</p>
        <div className="flex items-center gap-2 max-w-xs">
          <input
            type="number"
            min="0"
            className={inputClass}
            value={formValues[config.code] ?? ''}
            onChange={(e) => handleInputChange(config.code, e.target.value)}
            disabled={saving}
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {tConfig(meta.unitKey as never)}
          </span>
        </div>
      </div>
    );
  };

  // --- loading skeleton ---
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">{tCommon('loading')}</span>
      </div>
    );
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] rounded-md px-4 py-3 text-sm shadow-lg ${
            toast.type === 'success'
              ? 'bg-primary text-primary-foreground'
              : 'bg-destructive text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{tConfig('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{tConfig('subtitle')}</p>
      </div>

      {/* Card 1 — Field Settings */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Table2 className="w-4 h-4" />
            {tConfig('groupField')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {fieldConfigs.map(renderConfigItem)}
        </CardContent>
      </Card>

      {/* Card 2 — Decimal Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="w-4 h-4" />
            {tConfig('groupDecimal')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {decimalConfigs.map(renderConfigItem)}
        </CardContent>
      </Card>

      {/* Bottom Action Bar */}
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={() => setShowResetConfirm(true)}
          className={btnOutline}
          disabled={saving}
        >
          {tConfig('resetDefaults')}
        </button>
        <button
          onClick={handleSave}
          className={btnPrimary}
          disabled={saving || !hasChanges()}
        >
          {saving ? tCommon('processing') : tCommon('save')}
        </button>
      </div>

      {/* Reset Confirm Dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">{tCommon('actionConfirm')}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {tConfig('resetConfirm')}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowResetConfirm(false)}
                className={btnOutline}
                disabled={saving}
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleResetDefaults}
                disabled={saving}
                className={btnPrimary}
              >
                {saving ? tCommon('processing') : tCommon('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
