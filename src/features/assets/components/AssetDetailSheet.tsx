import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AssetDisposal, DepreciationEntry, FixedAsset } from '@/types';
import { RecordDetailSheet, RelatedRecordsSection, type RelatedRecordItem } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { AssetDetail } from './AssetDetail';

export interface AssetDetailSheetProps {
  asset: FixedAsset | undefined;
  depreciationHistory: DepreciationEntry[];
  disposal: AssetDisposal | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * FixedAsset has the richest relationship graph of any Assets & Inventory
 * record: capitalization journal, optional source Bill, per-period
 * DepreciationEntry history (own section in AssetDetail, not here — it's
 * the asset's primary content, not a "related record"), and a disposal
 * record with its own journal. Every link below is a real FK on the type
 * (journalEntryId / sourceBillId / disposalJournalEntryId) — none fabricated.
 */
export function AssetDetailSheet({ asset, depreciationHistory, disposal, open, onOpenChange }: AssetDetailSheetProps) {
  const navigate = useNavigate();

  const assetDepreciation = useMemo(() => (asset ? depreciationHistory.filter((e) => e.assetId === asset.id) : []), [asset, depreciationHistory]);

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!asset) return [];
    const items: RelatedRecordItem[] = [];
    if (asset.sourceBillId) {
      items.push({ label: 'Source bill', value: <RecordLink onClick={() => navigate(`/purchases/bills?record=${asset.sourceBillId}`)}>View bill</RecordLink> });
    }
    if (asset.journalEntryId) {
      items.push({ label: 'Capitalization journal', value: <RecordLink onClick={() => navigate(`/accounting/journals?record=${asset.journalEntryId}`)}>View journal entry</RecordLink> });
    }
    if (disposal) {
      items.push({ label: 'Disposal journal', value: <RecordLink onClick={() => navigate(`/accounting/journals?record=${disposal.journalEntryId}`)}>View journal entry</RecordLink> });
    }
    return items;
  }, [asset, disposal, navigate]);

  const state = asset ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={asset?.assetNumber ?? 'Asset'}
      titleAdornment={asset ? <StatusBadge status={asset.status} /> : undefined}
      state={state}
      notFoundMessage="This asset could not be found — it may have been deleted."
      className="sm:max-w-xl"
    >
      {asset && (
        <div className="flex flex-col gap-6">
          <AssetDetail asset={asset} depreciationHistory={assetDepreciation} onOpenJournal={(journalEntryId) => navigate(`/accounting/journals?record=${journalEntryId}`)} />
          <RelatedRecordsSection items={relatedItems} />
          <RecordAuditHistorySection recordType="FixedAsset" recordId={asset.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
