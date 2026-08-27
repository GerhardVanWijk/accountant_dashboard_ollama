import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BankAccount } from '@/types';
import { RecordDetailSheet, RelatedRecordsSection, type RelatedRecordItem } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { RecordLink } from '@/components/app/record-link';
import { Button } from '@/components/ui/shadcn/button';
import { BankAccountDetail } from './BankAccountDetail';

export interface BankAccountDetailSheetProps {
  account: BankAccount | undefined;
  glAccountCode: string | undefined;
  lastReconciledDate: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
}

/**
 * Related records here are deliberately just navigational shortcuts into
 * the transactions/reconciliation views filtered by nothing in particular
 * (neither page currently accepts a bank-account query filter to deep-link
 * into) — still useful as "go look at this account's activity" links,
 * matching the existing RecordLink-to-list-page convention used everywhere
 * else this pass (see route-audit.md's navigation-architecture note).
 */
export function BankAccountDetailSheet({ account, glAccountCode, lastReconciledDate, open, onOpenChange, onEdit }: BankAccountDetailSheetProps) {
  const navigate = useNavigate();

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!account) return [];
    return [
      { label: 'Transactions', value: <RecordLink onClick={() => navigate('/banking/transactions')}>View transactions</RecordLink> },
      { label: 'Reconciliation', value: <RecordLink onClick={() => navigate('/banking/reconciliation')}>View reconciliation</RecordLink> },
    ];
  }, [account, navigate]);

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={account?.name ?? 'Bank account'}
      state={account ? 'ready' : 'not-found'}
      notFoundMessage="This bank account could not be found — it may have been deleted."
      className="sm:max-w-xl"
      actions={
        account && onEdit ? (
          <Button size="sm" onClick={onEdit}>
            Edit account
          </Button>
        ) : undefined
      }
    >
      {account && (
        <div className="flex flex-col gap-6">
          <BankAccountDetail account={account} glAccountCode={glAccountCode} lastReconciledDate={lastReconciledDate} />
          <RelatedRecordsSection items={relatedItems} />
          <RecordAuditHistorySection recordType="BankAccount" recordId={account.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
