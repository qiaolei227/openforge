'use client';
import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useOrgStore } from '@/stores/org-store';
import { useToastStore } from '@/stores/toast-store';
import { getDistributionStatus, distribute, type CopyStatusEntry } from '@/lib/api/distribution';
import { Button } from '@/components/ui/button';

interface Props {
  appCode: string;
  modelCode: string;
  recordId: string;
}

type Status = 'allocated' | 'archived' | 'unallocated';

interface Row {
  orgId: string;
  orgName: string;
  status: Status;
  hasLocalEdits: boolean;
  copyId?: string;
}

export function CopyStatusSection({ appCode, modelCode, recordId }: Props) {
  const t = useTranslations('distribute');
  const orgs = useOrgStore((s) => s.accessibleOrgs);
  const showToast = useToastStore((s) => s.show);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const status = await getDistributionStatus(appCode, modelCode, [recordId]);
      const entries = status[recordId] ?? [];
      const byOrg = new Map(entries.map((e: CopyStatusEntry) => [e.orgId, e]));
      const next: Row[] = orgs
        .filter((o) => o.parentId !== null)
        .map((o) => {
          const c = byOrg.get(o.id);
          const st: Status = !c ? 'unallocated' : c.isArchived ? 'archived' : 'allocated';
          return {
            orgId: o.id,
            orgName: o.name,
            status: st,
            hasLocalEdits: c?.hasLocalEdits ?? false,
            copyId: c?.copyId,
          };
        });
      setRows(next);
    } finally {
      setLoading(false);
    }
  }, [appCode, modelCode, recordId, orgs]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(orgId: string, action: 'allocate' | 'revoke') {
    setSubmitting((prev) => new Set(prev).add(orgId));
    try {
      await distribute(appCode, modelCode, [recordId], [{ orgId, action }]);
      await load();
      showToast(action === 'allocate' ? t('copyAllocated') : t('copyRevoked'), 'success');
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? t('operationFailed'), 'error');
    } finally {
      setSubmitting((prev) => {
        const next = new Set(prev);
        next.delete(orgId);
        return next;
      });
    }
  }

  return (
    <section>
      <h3 className="text-sm font-semibold mb-3">{t('copyStatus')}</h3>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left py-2 px-3 font-medium">{t('orgColumn')}</th>
                <th className="text-left py-2 px-3 font-medium">{t('statusColumn')}</th>
                <th className="text-center py-2 px-3 font-medium">{t('localEdits')}</th>
                <th className="text-right py-2 px-3 font-medium">{t('actionColumn')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.orgId} className="border-t">
                  <td className="py-2 px-3">{r.orgName}</td>
                  <td className="py-2 px-3">
                    <span className={r.status === 'allocated' ? '' : 'text-muted-foreground'}>
                      {t(`statusValue.${r.status}`)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    {r.hasLocalEdits ? (
                      <span className="text-amber-500">●</span>
                    ) : (
                      <span className="text-muted-foreground/40">·</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {r.status === 'unallocated' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={submitting.has(r.orgId)}
                        onClick={() => toggle(r.orgId, 'allocate')}
                      >
                        {t('allocate')}
                      </Button>
                    )}
                    {r.status === 'archived' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={submitting.has(r.orgId)}
                        onClick={() => toggle(r.orgId, 'allocate')}
                      >
                        {t('restore')}
                      </Button>
                    )}
                    {r.status === 'allocated' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={submitting.has(r.orgId)}
                        onClick={() => toggle(r.orgId, 'revoke')}
                      >
                        {t('revoke')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    {t('noNonRootOrgs')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
