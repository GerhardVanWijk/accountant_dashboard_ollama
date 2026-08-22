import type { DepreciationEntry, FixedAsset } from '@/types';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';

export interface DepreciationHistoryTableProps {
  entries: DepreciationEntry[];
  assets: FixedAsset[];
}

export function DepreciationHistoryTable({ entries, assets }: DepreciationHistoryTableProps) {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const sorted = [...entries].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="bg-background">
          <tr>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Period End</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Asset</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Charge</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Accum. Depreciation After</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Carrying Value After</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry) => {
            const asset = assetById.get(entry.assetId);
            return (
              <tr key={entry.id} className="border-t border-border">
                <td className="whitespace-nowrap px-md py-sm text-text-primary">{entry.periodEnd}</td>
                <td className="whitespace-nowrap px-md py-sm text-text-primary">
                  {asset ? `${asset.assetNumber} - ${asset.name}` : entry.assetId}
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                  <FinancialNumber value={entry.amount} format={formatCurrency} showFlash={false} isInverted />
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                  <FinancialNumber value={entry.accumulatedDepreciationAfter} format={formatCurrency} showFlash={false} />
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right font-semibold tabular-nums">
                  <FinancialNumber value={entry.carryingValueAfter} format={formatCurrency} showFlash={false} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
