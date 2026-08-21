import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import type { BankAccount } from '@/types';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { Icon } from '@/components/ui/Icon';
import type { BankTransactionWithAllocations } from '../types';
import { formatZAR } from '../utils/formatZAR';

type SortKey = 'date' | 'amount';

export interface BankTransactionTableProps {
  transactions: BankTransactionWithAllocations[];
  bankAccountsById: Map<string, BankAccount>;
  showAccountColumn?: boolean;
  onAllocate: (transaction: BankTransactionWithAllocations) => void;
  onDelete: (transaction: BankTransactionWithAllocations) => void;
}

const STATUS_CLASSES: Record<string, string> = {
  unreconciled: 'bg-warning-financial/20 text-warning-financial',
  matched: 'bg-info-financial/20 text-info-financial',
  reconciled: 'bg-positive/20 text-positive',
};

const STATUS_LABELS: Record<string, string> = {
  unreconciled: 'Unreconciled',
  matched: 'Matched',
  reconciled: 'Reconciled',
};

/** Bank transactions list — sortable, signed amounts, allocation/delete row actions. */
export function BankTransactionTable({
  transactions,
  bankAccountsById,
  showAccountColumn = false,
  onAllocate,
  onDelete,
}: BankTransactionTableProps) {
  const [sortBy, setSortBy] = useState<SortKey>('date');
  const [sortDesc, setSortDesc] = useState(true);

  const sorted = useMemo(() => {
    const copy = [...transactions];
    copy.sort((a, b) => {
      const comparison = sortBy === 'amount' ? a.amount - b.amount : a.date.localeCompare(b.date);
      return sortDesc ? -comparison : comparison;
    });
    return copy;
  }, [transactions, sortBy, sortDesc]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDesc((d) => !d);
    else {
      setSortBy(key);
      setSortDesc(true);
    }
  }

  const cols = showAccountColumn
    ? '110px 1fr 140px 140px 130px 120px 110px 90px'
    : '110px 1.6fr 140px 130px 120px 110px 90px';

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <div style={{ minWidth: showAccountColumn ? 1080 : 940 }}>
        <div
          className="grid gap-3 border-b border-border bg-background px-4 py-3 text-sm font-semibold tabular-nums"
          style={{ gridTemplateColumns: cols }}
        >
          <FinancialTableCell type="label">
            <button type="button" onClick={() => toggleSort('date')} className="hover:text-primary">
              Date {sortBy === 'date' && (sortDesc ? '↓' : '↑')}
            </button>
          </FinancialTableCell>
          <FinancialTableCell type="label">Description</FinancialTableCell>
          {showAccountColumn && <FinancialTableCell type="label">Account</FinancialTableCell>}
          <FinancialTableCell type="label">Reference</FinancialTableCell>
          <FinancialTableCell type="number">
            <button type="button" onClick={() => toggleSort('amount')} className="hover:text-primary">
              Amount {sortBy === 'amount' && (sortDesc ? '↓' : '↑')}
            </button>
          </FinancialTableCell>
          <FinancialTableCell type="status">Status</FinancialTableCell>
          <FinancialTableCell type="status">Actions</FinancialTableCell>
        </div>

        {sorted.map((txn) => {
          const signed = txn.direction === 'credit' ? -txn.amount : txn.amount;
          const needsAllocation = txn.allocations.length === 0 && !txn.transferPairId;
          return (
            <div
              key={txn.id}
              className="grid gap-3 border-b border-border/50 px-4 py-3 tabular-nums hover:bg-primary/5"
              style={{ gridTemplateColumns: cols }}
            >
              <FinancialTableCell type="label" className="text-text-secondary">
                {format(new Date(txn.date), 'dd MMM yy')}
              </FinancialTableCell>
              <FinancialTableCell type="label" className="text-text-primary">
                {txn.description}
                {needsAllocation && (
                  <span className="ml-2 rounded-full bg-warning-financial/20 px-2 py-0.5 text-xs font-semibold text-warning-financial">
                    Needs allocation
                  </span>
                )}
              </FinancialTableCell>
              {showAccountColumn && (
                <FinancialTableCell type="label" className="text-text-secondary">
                  {bankAccountsById.get(txn.bankAccountId)?.name ?? txn.bankAccountId}
                </FinancialTableCell>
              )}
              <FinancialTableCell type="label" className="font-mono text-xs text-text-secondary">
                {txn.reference ?? '—'}
              </FinancialTableCell>
              <FinancialTableCell type="number">
                <FinancialNumber value={signed} format={formatZAR} showFlash={false} />
              </FinancialTableCell>
              <FinancialTableCell type="status">
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_CLASSES[txn.status]}`}>
                  {STATUS_LABELS[txn.status]}
                </span>
              </FinancialTableCell>
              <FinancialTableCell type="status" className="flex items-center justify-center gap-xs">
                <button
                  type="button"
                  aria-label={`Allocate ${txn.description}`}
                  onClick={() => onAllocate(txn)}
                  disabled={Boolean(txn.transferPairId)}
                  className="rounded-md p-1 text-text-secondary hover:bg-background hover:text-primary disabled:opacity-30"
                >
                  <Icon name="edit" size={16} />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${txn.description}`}
                  onClick={() => onDelete(txn)}
                  disabled={txn.status === 'reconciled'}
                  className="rounded-md p-1 text-text-secondary hover:bg-background hover:text-danger disabled:opacity-30"
                >
                  <Icon name="delete" size={16} />
                </button>
              </FinancialTableCell>
            </div>
          );
        })}
      </div>
    </div>
  );
}
