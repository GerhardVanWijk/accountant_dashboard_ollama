import { Landmark } from 'lucide-react';
import type { BankAccount } from '@/types';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Amount } from '@/components/app/figure';
import { formatDate } from '@/lib/app/format';
import { BANK_ACCOUNT_TYPE_LABELS } from '../constants';

export interface BankAccountTableProps {
  accounts: BankAccount[];
  /** glAccountId -> Chart of Accounts code, for the "Ledger" line. */
  glAccountCodes: Map<string, string>;
  /** bankAccountId -> the date of its most recent finalized reconciliation, if any (via bankReconciliationService.getHistory()). */
  lastReconciledDates: Map<string, string>;
  onEdit: (account: BankAccount) => void;
  onToggleActive: (account: BankAccount) => void;
}

/**
 * Cash & Bank Accounts, re-skinned onto v0's account-card visual language
 * (its Banking page shows accounts this way) with the real create/edit/
 * deactivate actions v0's read-only cards don't have. Shows only
 * `currentBalance` — the real `BankAccount` has no separate "available
 * balance" concept v0's mock invents. "Reconciled" is the real most-recent
 * finalized `BankReconciliation.finalizedAt` for that account (via
 * `bankReconciliationService.getHistory()`), not a stored field.
 */
export function BankAccountTable({ accounts, glAccountCodes, lastReconciledDates, onEdit, onToggleActive }: BankAccountTableProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {accounts.map((account) => {
        const lastReconciled = lastReconciledDates.get(account.id);
        const maskedNumber = account.accountNumber.length > 4 ? `••••${account.accountNumber.slice(-4)}` : account.accountNumber;

        return (
          <article key={account.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col">
                <h2 className="text-sm font-medium">{account.name}</h2>
                <span className="text-xs text-muted-foreground">
                  {account.bankName} · {BANK_ACCOUNT_TYPE_LABELS[account.accountType] ?? account.accountType}
                </span>
              </div>
              <Landmark className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>

            <div className="flex flex-col gap-0.5">
              <Amount value={account.currentBalance} className="text-lg font-semibold" />
              <Badge variant={account.status === 'active' ? 'outline' : 'secondary'} className={account.status === 'active' ? 'w-fit text-status-positive' : 'w-fit text-muted-foreground'}>
                {account.status === 'active' ? 'Active' : 'Inactive'}
              </Badge>
            </div>

            <dl className="flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted-foreground">
              <div className="flex justify-between gap-2">
                <dt>Account</dt>
                <dd className="figure tabular-nums">{maskedNumber}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Ledger</dt>
                <dd className="figure tabular-nums">{glAccountCodes.get(account.glAccountId) ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Reconciled</dt>
                <dd>{lastReconciled ? formatDate(lastReconciled) : 'Never'}</dd>
              </div>
            </dl>

            <div className="flex items-center gap-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" onClick={() => onEdit(account)}>
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => onToggleActive(account)}>
                {account.status === 'active' ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
