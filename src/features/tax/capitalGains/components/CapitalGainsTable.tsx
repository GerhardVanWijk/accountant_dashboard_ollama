import { useState } from 'react';
import type { CgtDisposalComputation } from '@/types';
import { Input } from '@/components/ui/shadcn/input';
import { Amount } from '@/components/app/figure';

export interface CapitalGainsTableProps {
  disposals: CgtDisposalComputation[];
  onSellingCostsChange: (disposalId: string, sellingCosts: number) => void | Promise<void>;
}

/** One row's editable selling-costs cell — local input state so typing doesn't refetch on every keystroke. */
function SellingCostsCell({ disposal, onSellingCostsChange }: { disposal: CgtDisposalComputation; onSellingCostsChange: CapitalGainsTableProps['onSellingCostsChange'] }) {
  const [value, setValue] = useState(String(disposal.sellingCosts));

  const commit = () => {
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed < 0) {
      setValue(String(disposal.sellingCosts));
      return;
    }
    if (parsed !== disposal.sellingCosts) onSellingCostsChange(disposal.disposalId, parsed);
  };

  return (
    <Input aria-label={`Selling costs for ${disposal.assetNumber}`} type="number" step="0.01" min="0" className="text-right tabular-nums" value={value} onChange={(e) => setValue(e.target.value)} onBlur={commit} />
  );
}

/**
 * Reconciliation table — accounting figures (Proceeds, Carrying Value,
 * Accounting Gain/Loss) side by side with tax figures (Base Cost, Selling
 * Costs, Capital Gain/Loss) so accounting profit stays visibly separate
 * from taxable capital gain. Re-skinned onto shadcn table styling (M7);
 * logic unchanged.
 */
export function CapitalGainsTable({ disposals, onSellingCostsChange }: CapitalGainsTableProps) {
  const sorted = [...disposals].sort((a, b) => b.disposalDate.localeCompare(a.disposalDate));

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Disposal Date</th>
            <th className="whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground">Asset</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Proceeds</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Carrying Value</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Accounting Gain / Loss</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Base Cost</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Selling Costs</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-muted-foreground">Capital Gain / Loss</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((disposal) => (
            <tr key={disposal.disposalId} className="border-t border-border">
              <td className="whitespace-nowrap px-4 py-2.5">{disposal.disposalDate.slice(0, 10)}</td>
              <td className="whitespace-nowrap px-4 py-2.5">
                {disposal.assetNumber} - {disposal.assetName}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right">
                <Amount value={disposal.proceeds} plain />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right">
                <Amount value={disposal.accountingCarryingValue} plain />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right">
                <Amount value={disposal.accountingGainLoss} />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right">
                <Amount value={disposal.baseCost} plain />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right">
                <SellingCostsCell disposal={disposal} onSellingCostsChange={onSellingCostsChange} />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">
                <Amount value={disposal.capitalGainLoss} className="font-semibold" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
