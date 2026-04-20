'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { useOrgStore } from '@/stores/org-store';
import { useToastStore } from '@/stores/toast-store';
import {
  getDistributionStatus,
  distribute,
  type CopyStatusEntry,
  type DistAction,
} from '@/lib/api/distribution';
import { OrgTreeCheckboxes, type OrgCheckState } from './org-tree-checkboxes';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  appCode: string;
  modelCode: string;
  records: Array<{ id: string; displayName: string }>;
}

export function DistributionDialog({
  open,
  onClose,
  onSuccess,
  appCode,
  modelCode,
  records,
}: Props) {
  const t = useTranslations('distribute');
  const orgs = useOrgStore((s) => s.accessibleOrgs);
  const showToast = useToastStore((s) => s.show);
  const rootOrgIds = useMemo(
    () => new Set(orgs.filter((o) => o.parentId === null).map((o) => o.id)),
    [orgs],
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [statusMap, setStatusMap] = useState<Record<string, CopyStatusEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'edit' | 'preview'>('edit');
  const [checkedOrgs, setCheckedOrgs] = useState<Set<string>>(new Set());
  const [ackRevoke, setAckRevoke] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const recordIds = useMemo(() => records.map((r) => r.id), [records]);

  // Load distribution status when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setStep('edit');
    setAckRevoke(false);
    setSubmitting(false);
    getDistributionStatus(appCode, modelCode, recordIds)
      .then((status) => {
        setStatusMap(status);
        // Derive initial checked set: org is checked iff ALL records are actively allocated to it
        const initial = new Set<string>();
        for (const org of orgs) {
          if (rootOrgIds.has(org.id)) continue;
          if (records.length === 0) continue;
          const allAllocated = records.every((r) => {
            const entries = status[r.id] ?? [];
            return entries.some((e) => e.orgId === org.id && !e.isArchived);
          });
          if (allAllocated) initial.add(org.id);
        }
        setCheckedOrgs(new Set(initial));
      })
      .catch(() => {
        showToast(t('loadStatusFailed'), 'error');
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appCode, modelCode, recordIds.join(',')]);

  // Compute tri-state per org based on current checkedOrgs + live statusMap
  const statePerOrg = useMemo<Record<string, OrgCheckState>>(() => {
    const res: Record<string, OrgCheckState> = {};
    for (const org of orgs) {
      if (rootOrgIds.has(org.id)) {
        res[org.id] = 'unchecked';
        continue;
      }
      if (checkedOrgs.has(org.id)) {
        res[org.id] = 'checked';
      } else {
        // Indeterminate: some records already allocated (but user hasn't checked the org)
        const allocatedCount = records.filter((r) => {
          const entries = statusMap[r.id] ?? [];
          return entries.some((e) => e.orgId === org.id && !e.isArchived);
        }).length;
        if (allocatedCount > 0 && allocatedCount < records.length) {
          res[org.id] = 'indeterminate';
        } else {
          res[org.id] = 'unchecked';
        }
      }
    }
    return res;
  }, [orgs, records, statusMap, checkedOrgs, rootOrgIds]);

  // Count per org for display (always from statusMap, unaffected by checkedOrgs)
  const countPerOrg = useMemo(() => {
    const res: Record<string, { allocated: number; total: number }> = {};
    for (const org of orgs) {
      if (rootOrgIds.has(org.id)) continue;
      const allocated = records.filter((r) => {
        const entries = statusMap[r.id] ?? [];
        return entries.some((e) => e.orgId === org.id && !e.isArchived);
      }).length;
      res[org.id] = { allocated, total: records.length };
    }
    return res;
  }, [orgs, records, statusMap, rootOrgIds]);

  // Compute diff between desired state (checkedOrgs) and actual state (statusMap)
  const diff = useMemo(() => {
    const allocate: Array<{
      recordId: string;
      recordName: string;
      orgId: string;
      orgName: string;
    }> = [];
    const revoke: Array<{
      recordId: string;
      recordName: string;
      orgId: string;
      orgName: string;
    }> = [];
    const byOrgId = new Map(orgs.map((o) => [o.id, o]));
    for (const org of orgs) {
      if (rootOrgIds.has(org.id)) continue;
      const wantChecked = checkedOrgs.has(org.id);
      for (const r of records) {
        const hasActive = (statusMap[r.id] ?? []).some(
          (e) => e.orgId === org.id && !e.isArchived,
        );
        if (wantChecked && !hasActive) {
          allocate.push({
            recordId: r.id,
            recordName: r.displayName,
            orgId: org.id,
            orgName: byOrgId.get(org.id)?.name ?? org.id,
          });
        }
        if (!wantChecked && hasActive) {
          revoke.push({
            recordId: r.id,
            recordName: r.displayName,
            orgId: org.id,
            orgName: byOrgId.get(org.id)?.name ?? org.id,
          });
        }
      }
    }
    return { allocate, revoke };
  }, [orgs, records, statusMap, checkedOrgs, rootOrgIds]);

  const hasChanges = diff.allocate.length + diff.revoke.length > 0;
  const requireAck = diff.revoke.length > 0;

  function onToggle(orgId: string) {
    setCheckedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  }

  async function execute() {
    setSubmitting(true);
    // Group changes by record
    const byRecord: Record<string, Array<{ orgId: string; action: DistAction }>> = {};
    for (const r of records) byRecord[r.id] = [];
    for (const a of diff.allocate) byRecord[a.recordId].push({ orgId: a.orgId, action: 'allocate' });
    for (const a of diff.revoke) byRecord[a.recordId].push({ orgId: a.orgId, action: 'revoke' });

    let total = 0;
    let ok = 0;
    let firstErr: { code?: string; msg?: string } | null = null;

    for (const [recordId, changes] of Object.entries(byRecord)) {
      if (changes.length === 0) continue;
      try {
        const res = await distribute(appCode, modelCode, [recordId], changes);
        total += res.results.length;
        ok += res.summary.succeeded;
        if (!firstErr) {
          const firstFail = res.results.find((r) => r.status === 'failed');
          if (firstFail) firstErr = { code: firstFail.errorCode, msg: firstFail.errorMessage };
        }
      } catch (e: unknown) {
        total += changes.length;
        if (!firstErr) {
          const errMsg = e instanceof Error ? e.message : 'Unknown error';
          firstErr = { msg: errMsg };
        }
      }
    }

    setSubmitting(false);

    if (ok === total) {
      showToast(t('executeDone', { count: ok }), 'success');
    } else {
      showToast(t('executePartial', { ok, total }), 'error');
    }

    onSuccess();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        {step === 'edit' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('title')}</DialogTitle>
            </DialogHeader>
            <div className="text-sm text-muted-foreground mb-2">
              {t('selectedRecords', { count: records.length })}
              {records.length <= 5 ? (
                <span className="ml-1">
                  : {records.map((r) => r.displayName).join('、')}
                </span>
              ) : (
                <span className="ml-1">
                  : {records.slice(0, 5).map((r) => r.displayName).join('、')}
                  {' '}{t('plusMoreRecords', { count: records.length - 5 })}
                </span>
              )}
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <OrgTreeCheckboxes
                orgs={orgs}
                rootOrgIds={rootOrgIds}
                statePerOrg={statePerOrg}
                countPerOrg={countPerOrg}
                onToggle={onToggle}
              />
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                {t('cancel')}
              </Button>
              <Button onClick={() => setStep('preview')} disabled={!hasChanges || loading}>
                {t('next')}
              </Button>
            </DialogFooter>
          </>
        )}
        {step === 'preview' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('previewTitle')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              {diff.allocate.length > 0 && (
                <section>
                  <div className="font-medium mb-1.5">
                    {t('willAllocate', { count: diff.allocate.length })}
                  </div>
                  <ul className="max-h-32 overflow-y-auto space-y-0.5 text-muted-foreground border rounded-md p-2 bg-muted/30">
                    {diff.allocate.slice(0, 30).map((a, i) => (
                      <li key={i} className="truncate">
                        {a.recordName} → {a.orgName}
                      </li>
                    ))}
                    {diff.allocate.length > 30 && (
                      <li className="text-xs opacity-70">
                        {t('plusMoreChanges', { count: diff.allocate.length - 30 })}
                      </li>
                    )}
                  </ul>
                </section>
              )}
              {diff.revoke.length > 0 && (
                <section>
                  <div className="font-medium mb-1.5">
                    {t('willRevoke', { count: diff.revoke.length })}
                  </div>
                  <ul className="max-h-32 overflow-y-auto space-y-0.5 text-muted-foreground border rounded-md p-2 bg-muted/30">
                    {diff.revoke.slice(0, 30).map((a, i) => (
                      <li key={i} className="truncate">
                        {a.recordName} → {a.orgName}
                      </li>
                    ))}
                    {diff.revoke.length > 30 && (
                      <li className="text-xs opacity-70">
                        {t('plusMoreChanges', { count: diff.revoke.length - 30 })}
                      </li>
                    )}
                  </ul>
                </section>
              )}
              {requireAck && (
                <label className="flex items-center gap-2 text-sm pt-1 cursor-pointer">
                  <Checkbox
                    checked={ackRevoke}
                    onCheckedChange={(v) => setAckRevoke(!!v)}
                  />
                  <span>{t('revokeAck')}</span>
                </label>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStep('edit')}
                disabled={submitting}
              >
                {t('back')}
              </Button>
              <Button
                onClick={execute}
                disabled={submitting || (requireAck && !ackRevoke)}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : null}
                {t('execute')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
