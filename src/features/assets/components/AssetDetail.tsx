import { useMemo, type ReactNode } from 'react';
import {
  ActivityIcon,
  BanknoteIcon,
  CircleDollarSignIcon,
  CoinsIcon,
  FileTextIcon,
  LayersIcon,
  TrendingDownIcon,
  WalletCardsIcon,
} from 'lucide-react';
import type { Account, AssetDisposal, DepreciationEntry, FixedAsset } from '@/types';
import { RecordTabs, type RecordTab } from '@/components/app/record-page';
import { RecordDetailField, RecordDetailGrid, RecordDetailSection } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { StatStrip, StatTile } from '@/components/app/stat-tile';
import { Amount } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { CATEGORY_LABELS, DEPRECIATION_METHOD_LABELS } from '../constants';
import { calculateMonthlyDepreciation } from '../services';

export interface AssetDetailProps {
  asset: FixedAsset;
  depreciationHistory: DepreciationEntry[];
  disposal?: AssetDisposal;
  accounts: Account[];
  onOpenJournal: (journalEntryId: string) => void;
  onOpenAccount?: (accountId: string) => void;
  onOpenBill?: (billId: string) => void;
}

function AccountRef({ id, accounts, onOpen }: { id: string; accounts: Account[]; onOpen?: (id: string) => void }) {
  const account = accounts.find((a) => a.id === id);
  const text = account ? `${account.code} · ${account.name}` : id;
  return onOpen && account ? <RecordLink onClick={() => onOpen(id)}>{text}</RecordLink> : <span>{text}</span>;
}

/**
 * Fixed-asset record workspace — one shared `RecordTabs` strip (Overview /
 * Depreciation / Accounting / Documents / Activity, plus Tax when the asset
 * carries a wear-and-tear rate). Every figure is read off the authoritative
 * `FixedAsset` / `DepreciationEntry` / `AssetDisposal` record — carrying
 * value is `cost − accumulatedDepreciation` everywhere, computed once.
 */
export function AssetDetail({ asset, depreciationHistory, disposal, accounts, onOpenJournal, onOpenAccount, onOpenBill }: AssetDetailProps) {
  const carryingValue = asset.cost - asset.accumulatedDepreciation;
  const remainingDepreciable = Math.max(0, asset.cost - asset.residualValue - asset.accumulatedDepreciation);
  const currentPeriodCharge = asset.status === 'active' ? calculateMonthlyDepreciation(asset) : 0;

  const rows = useMemo(
    () => [...depreciationHistory].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)),
    [depreciationHistory],
  );
  const depreciationJournalIds = useMemo(
    () => [...new Set(depreciationHistory.map((e) => e.journalEntryId))],
    [depreciationHistory],
  );

  const overview = (
    <>
      <StatStrip columns={3}>
        <StatTile variant="compact" icon={WalletCardsIcon} label="Cost" value={formatCurrency(asset.cost)} />
        <StatTile variant="compact" icon={TrendingDownIcon} label="Accumulated depreciation" value={formatCurrency(asset.accumulatedDepreciation)} />
        <StatTile variant="compact" icon={CircleDollarSignIcon} label="Carrying value" value={formatCurrency(carryingValue)} />
      </StatStrip>

      <RecordDetailGrid>
        <RecordDetailField label="Asset number" value={<span className="font-mono">{asset.assetNumber}</span>} />
        <RecordDetailField label="Category" value={CATEGORY_LABELS[asset.category]} />
        <RecordDetailField label="Acquired / available for use" value={formatDate(asset.acquisitionDate)} />
        <RecordDetailField label="Useful life" value={`${asset.usefulLifeYears} years`} />
        <RecordDetailField label="Depreciation method" value={DEPRECIATION_METHOD_LABELS[asset.depreciationMethod]} />
        <RecordDetailField
          label="Residual value"
          value={formatCurrency(asset.residualValue)}
        />
        {asset.depreciationMethod === 'reducing_balance' && (
          <RecordDetailField label="Annual rate" value={`${asset.reducingBalanceRatePercent ?? '—'}%`} />
        )}
        <RecordDetailField label="Current-period charge" value={formatCurrency(currentPeriodCharge)} />
        <RecordDetailField label="Remaining depreciable amount" value={formatCurrency(remainingDepreciable)} />
      </RecordDetailGrid>

      {asset.description && (
        <RecordDetailSection title="Description">
          <p className="text-sm text-foreground [overflow-wrap:anywhere]">{asset.description}</p>
        </RecordDetailSection>
      )}

      {asset.status === 'disposed' && disposal && (
        <RecordDetailSection title="Disposal">
          <RecordDetailGrid>
            <RecordDetailField label="Disposal date" value={formatDate(disposal.disposalDate)} />
            <RecordDetailField label="Proceeds" value={formatCurrency(disposal.proceeds)} />
            <RecordDetailField label="Carrying value at disposal" value={formatCurrency(disposal.carryingValueAtDisposal)} />
            <RecordDetailField label={disposal.gainLoss >= 0 ? 'Gain on disposal' : 'Loss on disposal'} value={<Amount value={disposal.gainLoss} />} />
          </RecordDetailGrid>
        </RecordDetailSection>
      )}
    </>
  );

  const depreciationTab =
    rows.length === 0 ? (
      <p className="text-sm text-muted-foreground">No depreciation has been posted for this asset yet.</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-3 py-2 text-left font-medium">Period</th>
              <th className="px-3 py-2 text-right font-medium">Charge</th>
              <th className="px-3 py-2 text-right font-medium">Accumulated</th>
              <th className="px-3 py-2 text-right font-medium">Carrying value</th>
              <th className="px-3 py-2 text-right font-medium">Journal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">{formatDate(entry.periodEnd)}</td>
                <td className="px-3 py-2 text-right"><Amount value={-entry.amount} plain className="text-sm" /></td>
                <td className="px-3 py-2 text-right text-muted-foreground"><Amount value={entry.accumulatedDepreciationAfter} plain className="text-sm" /></td>
                <td className="px-3 py-2 text-right font-medium"><Amount value={entry.carryingValueAfter} plain className="text-sm" /></td>
                <td className="px-3 py-2 text-right">
                  <RecordLink onClick={() => onOpenJournal(entry.journalEntryId)} className="text-xs">View</RecordLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const accountingTab = (
    <>
      <RecordDetailSection title="GL account mappings">
        <RecordDetailGrid>
          <RecordDetailField label="Asset cost" value={<AccountRef id={asset.glAssetAccountId} accounts={accounts} onOpen={onOpenAccount} />} />
          <RecordDetailField label="Accumulated depreciation" value={<AccountRef id={asset.glAccumulatedDepreciationAccountId} accounts={accounts} onOpen={onOpenAccount} />} />
          <RecordDetailField label="Depreciation expense" value={<AccountRef id={asset.glDepreciationExpenseAccountId} accounts={accounts} onOpen={onOpenAccount} />} />
        </RecordDetailGrid>
      </RecordDetailSection>

      <RecordDetailSection title="Position">
        <RecordDetailGrid>
          <RecordDetailField label="Capitalised cost" value={formatCurrency(asset.cost)} />
          <RecordDetailField label="Accumulated depreciation" value={formatCurrency(asset.accumulatedDepreciation)} />
          <RecordDetailField label="Carrying amount" value={formatCurrency(carryingValue)} />
          <RecordDetailField label="Lifetime depreciation posted" value={formatCurrency(depreciationHistory.reduce((s, e) => s + e.amount, 0))} />
        </RecordDetailGrid>
      </RecordDetailSection>

      <RecordDetailSection title="Journals">
        <dl className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border text-sm">
          {asset.journalEntryId && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-xs text-muted-foreground">Capitalisation</dt>
              <dd><RecordLink onClick={() => onOpenJournal(asset.journalEntryId!)}>View journal</RecordLink></dd>
            </div>
          )}
          {depreciationJournalIds.map((id, i) => (
            <div key={id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-xs text-muted-foreground">Depreciation {depreciationJournalIds.length > 1 ? `#${i + 1}` : ''}</dt>
              <dd><RecordLink onClick={() => onOpenJournal(id)}>View journal</RecordLink></dd>
            </div>
          ))}
          {asset.disposalJournalEntryId && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-xs text-muted-foreground">Disposal</dt>
              <dd><RecordLink onClick={() => onOpenJournal(asset.disposalJournalEntryId!)}>View journal</RecordLink></dd>
            </div>
          )}
        </dl>
      </RecordDetailSection>
    </>
  );

  const documentItems: { label: string; node: ReactNode }[] = [];
  if (asset.sourceBillId && onOpenBill) documentItems.push({ label: 'Source supplier invoice', node: <RecordLink onClick={() => onOpenBill(asset.sourceBillId!)}>View invoice</RecordLink> });
  if (asset.journalEntryId) documentItems.push({ label: 'Capitalisation journal', node: <RecordLink onClick={() => onOpenJournal(asset.journalEntryId!)}>View journal</RecordLink> });
  if (asset.disposalJournalEntryId) documentItems.push({ label: 'Disposal journal', node: <RecordLink onClick={() => onOpenJournal(asset.disposalJournalEntryId!)}>View journal</RecordLink> });

  const documentsTab =
    documentItems.length === 0 ? (
      <p className="text-sm text-muted-foreground">No linked documents.</p>
    ) : (
      <dl className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border text-sm">
        {documentItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd>{item.node}</dd>
          </div>
        ))}
      </dl>
    );

  const tabs: RecordTab[] = [
    { value: 'overview', label: 'Overview', icon: LayersIcon, content: overview },
    { value: 'depreciation', label: 'Depreciation', icon: TrendingDownIcon, count: rows.length, content: depreciationTab },
    { value: 'accounting', label: 'Accounting', icon: BanknoteIcon, content: accountingTab },
    { value: 'documents', label: 'Documents', icon: FileTextIcon, count: documentItems.length, content: documentsTab },
    { value: 'activity', label: 'Activity', icon: ActivityIcon, content: <RecordAuditHistorySection recordType="FixedAsset" recordId={asset.id} /> },
  ];

  if (asset.taxWearTearRatePercent !== undefined) {
    tabs.splice(3, 0, {
      value: 'tax',
      label: 'Tax',
      icon: CoinsIcon,
      content: (
        <>
          <p className="mb-3 rounded-lg border border-status-warning-outline bg-status-warning-surface px-3 py-2 text-xs text-status-warning">
            Wear-and-tear allowance figures are indicative, not verified against SARS Binding General Practice Note 7.
          </p>
          <RecordDetailGrid>
            <RecordDetailField label="Accounting cost" value={formatCurrency(asset.cost)} />
            <RecordDetailField label="Accounting carrying value" value={formatCurrency(carryingValue)} />
            <RecordDetailField label="Wear-and-tear rate" value={`${asset.taxWearTearRatePercent}%`} />
            <RecordDetailField label="Acquisition date" value={formatDate(asset.acquisitionDate)} />
          </RecordDetailGrid>
        </>
      ),
    });
  }

  return <RecordTabs tabs={tabs} embedded ariaLabel={`${asset.assetNumber} sections`} />;
}
