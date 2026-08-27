import type { BankAccount } from '@/types';
import { SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Badge } from '@/components/ui/shadcn/badge';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { BANK_ACCOUNT_TYPE_LABELS } from '../constants';

export interface BankAccountDetailProps {
  account: BankAccount;
  glAccountCode: string | undefined;
  lastReconciledDate: string | undefined;
}

/** New — BankAccountTable never had a detail view before this pass, only inline Edit/Deactivate actions. */
export function BankAccountDetail({ account, glAccountCode, lastReconciledDate }: BankAccountDetailProps) {
  const maskedNumber = account.accountNumber.length > 4 ? `••••${account.accountNumber.slice(-4)}` : account.accountNumber;

  return (
    <SectionCard title={account.bankName} description={BANK_ACCOUNT_TYPE_LABELS[account.accountType] ?? account.accountType}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <FigureBlock label="Current balance" value={formatCurrency(account.currentBalance)} tone={account.currentBalance < 0 ? 'negative' : 'default'} />
        <FigureBlock label="Account number" value={maskedNumber} />
        <FigureBlock label="Currency" value={account.currency} />
        <FigureBlock label="Ledger account" value={glAccountCode ?? '—'} />
        <FigureBlock label="Last reconciled" value={lastReconciledDate ? formatDate(lastReconciledDate) : 'Never'} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant={account.status === 'active' ? 'outline' : 'secondary'} className={account.status === 'active' ? 'text-status-positive' : 'text-muted-foreground'}>
          {account.status === 'active' ? 'Active' : 'Inactive'}
        </Badge>
      </div>
    </SectionCard>
  );
}
