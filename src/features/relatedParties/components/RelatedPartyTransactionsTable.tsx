import type { RelatedParty, RelatedPartyTransaction } from '@/types/relatedParty';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';

export interface RelatedPartyTransactionsTableProps {
  transactions: RelatedPartyTransaction[];
  relatedPartiesById: Map<string, RelatedParty>;
  onEdit: (transaction: RelatedPartyTransaction) => void;
  onDelete: (transaction: RelatedPartyTransaction) => void;
}

/** Related Party Transactions table — mirrors RelatedPartiesTable.tsx's shape. */
export function RelatedPartyTransactionsTable({ transactions, relatedPartiesById, onEdit, onDelete }: RelatedPartyTransactionsTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[860px] border-collapse text-left text-sm">
        <thead className="bg-background">
          <tr>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Date</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Related Party</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Nature</th>
            <th className="whitespace-nowrap px-md py-sm text-right font-medium text-text-secondary">Amount</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary">Description</th>
            <th className="whitespace-nowrap px-md py-sm font-medium text-text-secondary" />
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id} className="border-t border-border hover:bg-background">
              <td className="whitespace-nowrap px-md py-sm text-text-primary">{transaction.transactionDate}</td>
              <td className="whitespace-nowrap px-md py-sm text-text-primary">
                {relatedPartiesById.get(transaction.relatedPartyId)?.name ?? 'Unknown'}
              </td>
              <td className="whitespace-nowrap px-md py-sm text-text-primary">{transaction.natureOfTransaction}</td>
              <td className="whitespace-nowrap px-md py-sm text-right tabular-nums">
                <FinancialNumber value={transaction.amount} format={formatCurrency} showFlash={false} />
              </td>
              <td className="max-w-xs truncate px-md py-sm text-text-secondary">{transaction.description ?? '—'}</td>
              <td className="whitespace-nowrap px-md py-sm">
                <div className="flex justify-end gap-sm">
                  <button
                    type="button"
                    onClick={() => onEdit(transaction)}
                    className="rounded-md px-sm py-xs text-xs font-medium text-primary hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(transaction)}
                    className="rounded-md px-sm py-xs text-xs font-medium text-danger hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
