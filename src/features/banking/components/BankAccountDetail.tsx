import type { BankAccount } from '@/types';
import {
  RecordDetailField,
  RecordDetailGrid,
  RecordDetailHero,
  RecordDetailSection,
} from '@/components/app/record-detail-sheet';
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
  const maskedNumber =
    account.accountNumber.length > 4 ? `••••${account.accountNumber.slice(-4)}` : account.accountNumber;
  const typeLabel = BANK_ACCOUNT_TYPE_LABELS[account.accountType] ?? account.accountType;

  return (
    <RecordDetailSection title="Account information">
      {/* Current balance is the headline figure — full-width hero above the
          grid so a large value ("R 1 250 000 000,00") never collides with the
          masked account number the way the old three-column strip did. */}
      <RecordDetailHero
        label="Current balance"
        value={formatCurrency(account.currentBalance)}
        hint={`${account.bankName} · ${typeLabel}`}
        tone={account.currentBalance < 0 ? 'negative' : 'default'}
      />

      <RecordDetailGrid>
        <RecordDetailField label="Account number" value={<span className="figure tabular-nums">{maskedNumber}</span>} />
        <RecordDetailField label="Currency" value={account.currency} />
        <RecordDetailField
          label="Ledger account"
          value={<span className="figure tabular-nums">{glAccountCode ?? '—'}</span>}
        />
        <RecordDetailField
          label="Last reconciled"
          value={lastReconciledDate ? formatDate(lastReconciledDate) : 'Never'}
        />
        <RecordDetailField
          label="Status"
          value={
            <Badge
              variant={account.status === 'active' ? 'outline' : 'secondary'}
              className={account.status === 'active' ? 'text-status-positive' : 'text-muted-foreground'}
            >
              {account.status === 'active' ? 'Active' : 'Inactive'}
            </Badge>
          }
        />
      </RecordDetailGrid>
    </RecordDetailSection>
  );
}
