import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { CATEGORY_LABELS } from '../constants';
import type { TaxRegisterRow } from '../services';

export interface TaxRegisterTableProps {
  rows: TaxRegisterRow[];
}

export function TaxRegisterTable({ rows }: TaxRegisterTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[920px] border-collapse text-left text-sm">
        <thead className="bg-background">
          <tr>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Asset</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Category</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Cost</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Accounting Carrying Value</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Tax Written-Down Value</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Temporary Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.assetId} className="border-t border-border">
              <td className="whitespace-nowrap px-md py-sm text-text-primary">
                {row.assetNumber} - {row.name}
              </td>
              <td className="whitespace-nowrap px-md py-sm text-text-primary">{CATEGORY_LABELS[row.category]}</td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={row.cost} format={formatCurrency} showFlash={false} />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={row.accountingCarryingValue} format={formatCurrency} showFlash={false} />
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                {row.taxWrittenDownValue !== undefined ? (
                  <FinancialNumber value={row.taxWrittenDownValue} format={formatCurrency} showFlash={false} />
                ) : (
                  <span className="text-text-muted">No rate set</span>
                )}
              </td>
              <td className="whitespace-nowrap px-md py-sm text-right font-semibold tabular-nums">
                {row.temporaryDifference !== undefined ? (
                  <FinancialNumber value={row.temporaryDifference} format={formatCurrency} showFlash={false} />
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
