import { useState } from 'react';
import type { CgtDisposalComputation } from '@/types';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { fieldInput } from './formStyles';

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
    <input
      aria-label={`Selling costs for ${disposal.assetNumber}`}
      type="number"
      step="0.01"
      min="0"
      className={fieldInput}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
    />
  );
}

/**
 * Reconciliation table — accounting figures (Proceeds, Carrying Value,
 * Accounting Gain/Loss) side by side with tax figures (Base Cost, Selling
 * Costs, Capital Gain/Loss) so §55's "separate accounting profit from
 * taxable capital gain" is visually obvious.
 */
export function CapitalGainsTable({ disposals, onSellingCostsChange }: CapitalGainsTableProps) {
  const sorted = [...disposals].sort((a, b) => b.disposalDate.localeCompare(a.disposalDate));

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
        <thead className="bg-background">
          <tr>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Disposal Date</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Asset</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Proceeds</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Carrying Value</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Accounting Gain / Loss</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Base Cost</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Selling Costs</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Capital Gain / Loss</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((disposal) => (
            <tr key={disposal.disposalId} className="border-t border-border">
              <td className="whitespace-nowrap px-md py-sm text-text-primary">{disposal.disposalDate.slice(0, 10)}</td>
              <td className="whitespace-nowrap px-md py-sm text-text-primary">
                {disposal.assetNumber} - {disposal.assetName}
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={disposal.proceeds} format={formatCurrency} showFlash={false} />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={disposal.accountingCarryingValue} format={formatCurrency} showFlash={false} />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={disposal.accountingGainLoss} format={formatCurrency} showFlash={false} />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={disposal.baseCost} format={formatCurrency} showFlash={false} />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right">
                <SellingCostsCell disposal={disposal} onSellingCostsChange={onSellingCostsChange} />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right font-semibold tabular-nums">
                <FinancialNumber value={disposal.capitalGainLoss} format={formatCurrency} showFlash={false} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
