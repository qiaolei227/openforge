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

  const [statusMap, setStatusMap] = useState<Record<string, CopyStatusEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'edit' | 'preview'>('edit');
  // Tri-state user intent: 'yes' = fill all / 'no' = clear all / absent = preserve current
  const [intent, setIntent] = useState<Map<string, 'yes' | 'no'>>(new Map());
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
        // Reset intent — derived state from statusMap is used for display;
        // the diff is empty until user clicks a checkbox
        setIntent(new Map());
      })
      .catch(() => {
        showToast(t('loadStatusFailed'), 'error');
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appCode, modelCode, recordIds.join(',')]);

  // Compute tri-state per org:
  //   - explicit intent 'yes' → checked
  //   - explicit intent 'no'  → unchecked
  //   - no intent: derive from statusMap (all allocated → checked, some → indeterminate, none → unchecked)
  const statePerOrg = useMemo<Record<string, OrgCheckState>>(() => {
    const res: Record<string, OrgCheckState> = {};
    for (const org of orgs) {
      if (rootOrgIds.has(org.id)) {
        res[org.id] = 'unchecked';
        continue;
      }
      const explicit = intent.get(org.id);
      if (explicit === 'yes') {
        res[org.id] = 'checked';
        continue;
      }
      if (explicit === 'no') {
        res[org.id] = 'unchecked';
        continue;
      }
      if (records.length === 0) {
        res[org.id] = 'unchecked';
        continue;
      }
      const allocatedCount = records.filter((r) => {
        const entries = statusMap[r.id] ?? [];
        return entries.some((e) => e.orgId === org.id && !e.isArchived);
      }).length;
      if (allocatedCount === records.length) {
        res[org.id] = 'checked';
      } else if (allocatedCount > 0) {
        res[org.id] = 'indeterminate';
      } else {
        res[org.id] = 'unchecked';
      }
    }
    return res;
  }, [orgs, records, statusMap, intent, rootOrgIds]);

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

  // Diff: only orgs with explicit intent produce changes. Orgs without intent are preserved.
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
    for (const [orgId, decision] of intent.entries()) {
      if (rootOrgIds.has(orgId)) continue;
      const orgName = byOrgId.get(orgId)?.name ?? orgId;
      for (const r of records) {
        const hasActive = (statusMap[r.id] ?? []).some(
          (e) => e.orgId === orgId && !e.isArchived,
        );
        if (decision === 'yes' && !hasActive) {
          allocate.push({ recordId: r.id, recordName: r.displayName, orgId, orgName });
        }
        if (decision === 'no' && hasActive) {
          revoke.push({ recordId: r.id, recordName: r.displayName, orgId, orgName });
        }
      }
    }
    return { allocate, revoke };
  }, [orgs, records, statusMap, intent, rootOrgIds]);

  const hasChanges = diff.allocate.length + diff.revoke.length > 0;
  const requireAck = diff.revoke.length > 0;

  // Click cycle: the current displayed state (statePerOrg) dictates next intent.
  //   - 'checked'        (either explicit 'yes' or derived from full allocation) → click → 'no' (revoke all)
  //   - 'indeterminate'  (partial) → click → 'yes' (fill gaps)
  //   - 'unchecked'      (explicit 'no' or empty) → click → 'yes' (allocate all)
  function onToggle(orgId: string) {
    const current = statePerOrg[orgId];
    const nextDecision: 'yes' | 'no' = current === 'checked' ? 'no' : 'yes';
    setIntent((prev) => {
      const next = new Map(prev);
      next.set(orgId, nextDecision);
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

    const pending = Object.entries(byRecord).filter(([, c]) => c.length > 0);
    const settled = await Promise.allSettled(
      pending.map(([recordId, changes]) => distribute(appCode, modelCode, [recordId], changes)),
    );

    let total = 0;
    let ok = 0;
    settled.forEach((s, i) => {
      const changes = pending[i][1];
      if (s.status === 'fulfilled') {
        total += s.value.results.length;
        ok += s.value.summary.succeeded;
      } else {
        total += changes.length;
      }
    });

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
