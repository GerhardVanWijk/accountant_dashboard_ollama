import { CalendarIcon, CircleDollarSignIcon, ClockIcon, CoinsIcon, TrendingDownIcon, WalletCardsIcon } from 'lucide-react';
import type { DepreciationEntry, FixedAsset } from '@/types';
import { SectionCard } from '@/components/app/page-header';
import { Amount } from '@/components/app/figure';
import { StatTileGrid } from '@/components/app/stat-tile';
import { RecordLink } from '@/components/app/record-link';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { CATEGORY_LABELS } from '../constants';

export interface AssetDetailProps {
  asset: FixedAsset;
  depreciationHistory: DepreciationEntry[];
  onOpenJournal: (journalEntryId: string) => void;
}

/** New — AssetsTable never had a detail view before this pass, only inline Edit/Post acquisition/Delete row actions. */
export function AssetDetail({ asset, depreciationHistory, onOpenJournal }: AssetDetailProps) {
  const carryingValue = asset.cost - asset.accumulatedDepreciation;

  return (
    <>
      <SectionCard title={asset.name} description={CATEGORY_LABELS[asset.category]}>
        <StatTileGrid
          columns={3}
          metrics={[
            { label: 'Cost', value: formatCurrency(asset.cost), icon: WalletCardsIcon },
            { label: 'Accumulated depreciation', value: formatCurrency(asset.accumulatedDepreciation), icon: TrendingDownIcon },
            { label: 'Carrying value', value: formatCurrency(carryingValue), icon: CircleDollarSignIcon },
            { label: 'Acquired', value: formatDate(asset.acquisitionDate), icon: CalendarIcon },
            { label: 'Useful life', value: `${asset.usefulLifeYears} years`, icon: ClockIcon },
            { label: 'Residual value', value: formatCurrency(asset.residualValue), icon: CoinsIcon },
          ]}
        />
        {asset.status === 'disposed' && asset.disposalDate && (
          <p className="mt-4 text-xs text-muted-foreground">
            Disposed {formatDate(asset.disposalDate)}
            {asset.disposalProceeds !== undefined && ` for ${formatCurrency(asset.disposalProceeds)}`}.
          </p>
        )}
      </SectionCard>

      {depreciationHistory.length > 0 && (
        <SectionCard title="Depreciation history" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Period end</th>
                  <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Charge</th>
                  <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Carrying value after</th>
                  <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase" />
                </tr>
              </thead>
              <tbody>
                {depreciationHistory.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{formatDate(entry.periodEnd)}</td>
                    <td className="px-4 py-2 text-right">
                      <Amount value={-entry.amount} plain className="text-sm" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Amount value={entry.carryingValueAfter} plain className="text-sm font-medium" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <RecordLink onClick={() => onOpenJournal(entry.journalEntryId)} className="text-xs">
                        journal
                      </RecordLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </>
  );
}
