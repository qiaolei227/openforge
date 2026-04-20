'use client';
import { CopyStatusSection } from './copy-status-section';
import { SyncActionsSection } from './sync-actions-section';
import { DistributionLogSection } from './distribution-log-section';

interface Props {
  appCode: string;
  modelCode: string;
  recordId: string;
  modelId: string;
}

export function SyncTab({ appCode, modelCode, recordId, modelId }: Props) {
  return (
    <div className="flex flex-col gap-8 p-6">
      <CopyStatusSection appCode={appCode} modelCode={modelCode} recordId={recordId} />
      <SyncActionsSection appCode={appCode} modelCode={modelCode} recordId={recordId} modelId={modelId} />
      <DistributionLogSection appCode={appCode} modelCode={modelCode} recordId={recordId} />
    </div>
  );
}
