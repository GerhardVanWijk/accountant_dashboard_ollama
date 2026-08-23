import type { RelatedPartyDisclosureSummaryRow } from '../services';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { RELATIONSHIP_TYPE_LABELS } from '../constants';

export interface DisclosureSummaryTableProps {
  rows: RelatedPartyDisclosureSummaryRow[];
}

/**
 * Renders the per-related-party disclosure summary (§88 "available for
 * financial statement disclosure") — one row per related party with at
 * least one transaction, built by buildRelatedPartyDisclosureSummary().
 */
export function DisclosureSummaryTable({ rows }: DisclosureSummaryTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead className="bg-background">
          <tr>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Related Party</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Relationship</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Transaction Count</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Total Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.relatedPartyId} className="border-t border-border hover:bg-background">
              <td className="whitespace-nowrap px-md py-sm text-text-primary">{row.name}</td>
              <td className="whitespace-nowrap px-md py-sm text-text-primary">{RELATIONSHIP_TYPE_LABELS[row.relationshipType]}</td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums text-text-primary">{row.transactionCount}</td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={row.totalAmount} format={formatCurrency} showFlash={false} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
