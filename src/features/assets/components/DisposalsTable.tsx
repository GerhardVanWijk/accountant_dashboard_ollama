import type { AssetDisposal, FixedAsset } from '@/types';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';

export interface DisposalsTableProps {
  disposals: AssetDisposal[];
  assets: FixedAsset[];
}

export function DisposalsTable({ disposals, assets }: DisposalsTableProps) {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const sorted = [...disposals].sort((a, b) => b.disposalDate.localeCompare(a.disposalDate));

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[780px] border-collapse text-left text-sm">
        <thead className="bg-background">
          <tr>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Disposal Date</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Asset</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Carrying Value</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Proceeds</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Gain / Loss</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((disposal) => {
            const asset = assetById.get(disposal.assetId);
            return (
              <tr key={disposal.id} className="border-t border-border">
                <td className="whitespace-nowrap px-md py-sm text-text-primary">{disposal.disposalDate}</td>
                <td className="whitespace-nowrap px-md py-sm text-text-primary">
                  {asset ? `${asset.assetNumber} - ${asset.name}` : disposal.assetId}
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                  <FinancialNumber value={disposal.carryingValueAtDisposal} format={formatCurrency} showFlash={false} />
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                  <FinancialNumber value={disposal.proceeds} format={formatCurrency} showFlash={false} />
                </td>
                <td className="whitespace-nowrap px-md py-sm text-right font-semibold tabular-nums">
                  <FinancialNumber value={disposal.gainLoss} format={formatCurrency} showFlash={false} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
