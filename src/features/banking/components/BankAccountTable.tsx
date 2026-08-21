import { useMemo, useState } from 'react';
import type { BankAccount } from '@/types';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { FinancialTableCell } from '@/components/tables/FinancialTableCell';
import { Icon } from '@/components/ui/Icon';
import { BANK_ACCOUNT_TYPE_LABELS } from '../constants';
import { formatZAR } from '../utils/formatZAR';

type SortKey = 'name' | 'bankName' | 'balance';

export interface BankAccountTableProps {
  accounts: BankAccount[];
  onEdit: (account: BankAccount) => void;
  onToggleActive: (account: BankAccount) => void;
}

/** Cash & Bank Accounts list — sortable, right-aligned balances with tick-flash on update. */
export function BankAccountTable({ accounts, onEdit, onToggleActive }: BankAccountTableProps) {
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortDesc, setSortDesc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...accounts];
    copy.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'balance') comparison = a.currentBalance - b.currentBalance;
      else if (sortBy === 'bankName') comparison = a.bankName.localeCompare(b.bankName);
      else comparison = a.name.localeCompare(b.name);
      return sortDesc ? -comparison : comparison;
    });
    return copy;
  }, [accounts, sortBy, sortDesc]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDesc((d) => !d);
    else {
      setSortBy(key);
      setSortDesc(false);
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <div className="min-w-[820px]">
        <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_140px_90px_110px] gap-3 border-b border-border bg-background px-4 py-3 text-sm font-semibold tabular-nums">
          <FinancialTableCell type="label">
            <button type="button" onClick={() => toggleSort('name')} className="hover:text-primary">
              Account {sortBy === 'name' && (sortDesc ? '↓' : '↑')}
            </button>
          </FinancialTableCell>
          <FinancialTableCell type="label">
            <button type="button" onClick={() => toggleSort('bankName')} className="hover:text-primary">
              Bank {sortBy === 'bankName' && (sortDesc ? '↓' : '↑')}
            </button>
          </FinancialTableCell>
          <FinancialTableCell type="label">Account Number</FinancialTableCell>
          <FinancialTableCell type="label">Type</FinancialTableCell>
          <FinancialTableCell type="number">
            <button type="button" onClick={() => toggleSort('balance')} className="hover:text-primary">
              Balance {sortBy === 'balance' && (sortDesc ? '↓' : '↑')}
            </button>
          </FinancialTableCell>
          <FinancialTableCell type="status">Status</FinancialTableCell>
          <FinancialTableCell type="status">Actions</FinancialTableCell>
        </div>

        {sorted.map((account) => (
          <div
            key={account.id}
            className="grid grid-cols-[1.6fr_1fr_1fr_1fr_140px_90px_110px] gap-3 border-b border-border/50 px-4 py-3 tabular-nums hover:bg-primary/5"
          >
            <FinancialTableCell type="label" className="font-medium text-text-primary">
              {account.name}
            </FinancialTableCell>
            <FinancialTableCell type="label" className="text-text-secondary">
              {account.bankName}
            </FinancialTableCell>
            <FinancialTableCell type="label" className="font-mono text-text-secondary">
              {account.accountNumber}
            </FinancialTableCell>
            <FinancialTableCell type="label" className="text-text-secondary">
              {BANK_ACCOUNT_TYPE_LABELS[account.accountType] ?? account.accountType}
            </FinancialTableCell>
            <FinancialTableCell type="number">
              <FinancialNumber value={account.currentBalance} format={formatZAR} showFlash={false} />
            </FinancialTableCell>
            <FinancialTableCell type="status">
              <span
                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                  account.status === 'active'
                    ? 'bg-positive/20 text-positive'
                    : 'bg-text-muted/20 text-text-muted'
                }`}
              >
                {account.status === 'active' ? 'Active' : 'Inactive'}
              </span>
            </FinancialTableCell>
            <FinancialTableCell type="status" className="flex items-center justify-center gap-xs">
              <button
                type="button"
                aria-label={`Edit ${account.name}`}
                onClick={() => onEdit(account)}
                className="rounded-md p-1 text-text-secondary hover:bg-background hover:text-primary"
              >
                <Icon name="edit" size={16} />
              </button>
              <button
                type="button"
                aria-label={account.status === 'active' ? `Deactivate ${account.name}` : `Activate ${account.name}`}
                onClick={() => onToggleActive(account)}
                className="rounded-md p-1 text-text-secondary hover:bg-background hover:text-danger"
              >
                <Icon name={account.status === 'active' ? 'delete' : 'add'} size={16} />
              </button>
            </FinancialTableCell>
          </div>
        ))}
      </div>
    </div>
  );
}
