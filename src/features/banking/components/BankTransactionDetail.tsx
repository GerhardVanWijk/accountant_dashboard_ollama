import type { BankAccount } from '@/types';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { formatDate } from '@/lib/app/format';
import type { BankTransactionWithAllocations } from '../types';

export interface BankTransactionDetailProps {
  transaction: BankTransactionWithAllocations;
  bankAccount: BankAccount | undefined;
}

/**
 * New — BankTransactionTable never had a detail view before this pass,
 * only inline "Allocate"/"Delete" row actions. Shows the full split
 * allocation (GL account + net/VAT per line — the transaction's actual
 * accounting content), not just the header fields already visible in the
 * table row.
 */
export function BankTransactionDetail({ transaction, bankAccount }: BankTransactionDetailProps) {
  return (
    <>
      <SectionCard title="Transaction" description={bankAccount?.name ?? 'Unknown account'}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <FigureBlock label="Amount" value={`${transaction.direction === 'debit' ? '+' : '-'}${transaction.amount.toFixed(2)}`} tone={transaction.direction === 'debit' ? 'positive' : 'default'} />
          <FigureBlock label="Date" value={formatDate(transaction.date)} />
          <FigureBlock label="Reference" value={transaction.reference ?? '—'} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{transaction.description}</p>
      </SectionCard>

      {transaction.allocations.length > 0 && (
        <SectionCard title="GL allocation" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Description</th>
                  <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Net</th>
                  <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">VAT</th>
                </tr>
              </thead>
              <tbody>
                {transaction.allocations.map((allocation) => (
                  <tr key={allocation.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{allocation.description ?? '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <Amount value={allocation.netAmount} plain className="text-sm" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Amount value={allocation.taxAmount} plain className="text-sm text-muted-foreground" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={transaction.status} />
      </div>
    </>
  );
}
