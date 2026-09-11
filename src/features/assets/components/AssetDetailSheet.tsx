import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PencilLineIcon, Trash2Icon } from 'lucide-react';
import type { Account, AssetDisposal, DepreciationEntry, FixedAsset } from '@/types';
import { RecordDetailSheet, RelatedRecordsSection, type RelatedRecordItem } from '@/components/app/record-detail-sheet';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { CATEGORY_LABELS } from '../constants';
import { AssetDetail } from './AssetDetail';

export interface AssetDetailSheetProps {
  asset: FixedAsset | undefined;
  depreciationHistory: DepreciationEntry[];
  disposal: AssetDisposal | undefined;
  accounts: Account[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRevise?: (asset: FixedAsset) => void;
  onDispose?: (asset: FixedAsset) => void;
}

/**
 * Fixed-asset record workspace in the shared wide detail sheet. The tabbed
 * body (`AssetDetail`) carries the depreciation ledger, GL mappings and
 * activity; this shell adds the header, the revise/dispose actions and the
 * cross-record links (every one a real FK on the type — none fabricated).
 */
export function AssetDetailSheet({ asset, depreciationHistory, disposal, accounts, open, onOpenChange, onRevise, onDispose }: AssetDetailSheetProps) {
  const navigate = useNavigate();

  const assetDepreciation = useMemo(
    () => (asset ? depreciationHistory.filter((e) => e.assetId === asset.id) : []),
    [asset, depreciationHistory],
  );

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!asset) return [];
    const items: RelatedRecordItem[] = [];
    if (asset.sourceBillId) {
      items.push({ label: 'Source supplier invoice', value: <RecordLink onClick={() => navigate(`/purchases/bills/${asset.sourceBillId}`)}>View invoice</RecordLink>, onActivate: () => navigate(`/purchases/bills/${asset.sourceBillId}`) });
    }
    if (asset.journalEntryId) {
      items.push({ label: 'Capitalisation journal', value: <RecordLink onClick={() => navigate(`/accounting/journals?record=${asset.journalEntryId}`)}>View journal entry</RecordLink> });
    }
    if (disposal) {
      items.push({ label: 'Disposal journal', value: <RecordLink onClick={() => navigate(`/accounting/journals?record=${disposal.journalEntryId}`)}>View journal entry</RecordLink> });
    }
    return items;
  }, [asset, disposal, navigate]);

  const canAct = asset && (asset.status === 'active' || asset.status === 'fully_depreciated');

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      title={asset?.assetNumber ?? 'Asset'}
      titleAdornment={asset ? <StatusBadge status={asset.status} /> : undefined}
      description={asset ? `${asset.name} · ${CATEGORY_LABELS[asset.category]}` : undefined}
      state={asset ? 'ready' : 'not-found'}
      notFoundMessage="This asset could not be found — it may have been deleted."
      actions={
        canAct && asset ? (
          <div className="flex gap-2">
            {onRevise && (
              <Button variant="outline" size="sm" onClick={() => onRevise(asset)}>
                <PencilLineIcon data-icon="inline-start" />
                Revise estimate
              </Button>
            )}
            {onDispose && (
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDispose(asset)}>
                <Trash2Icon data-icon="inline-start" />
                Dispose
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {asset && (
        <div className="flex flex-col gap-6">
          <AssetDetail
            asset={asset}
            depreciationHistory={assetDepreciation}
            disposal={disposal}
            accounts={accounts}
            onOpenJournal={(journalEntryId) => navigate(`/accounting/journals?record=${journalEntryId}`)}
            onOpenAccount={(accountId) => navigate(`/accounting/coa?record=${accountId}`)}
            onOpenBill={(billId) => navigate(`/purchases/bills/${billId}`)}
          />
          <RelatedRecordsSection items={relatedItems} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
