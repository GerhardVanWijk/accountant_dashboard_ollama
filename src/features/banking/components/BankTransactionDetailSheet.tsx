import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BankAccount } from '@/types';
import { RecordDetailSheet, RelatedRecordsSection, type RelatedRecordItem } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { BankTransactionDetail } from './BankTransactionDetail';
import type { BankTransactionWithAllocations } from '../types';

export interface BankTransactionDetailSheetProps {
  transaction: BankTransactionWithAllocations | undefined;
  isLoading: boolean;
  bankAccount: BankAccount | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAllocate?: () => void;
}

/**
 * The traceability chain the audit called out by name: a bank transaction
 * should expose its GL journal, its finalized reconciliation (once cleared),
 * and — for a transfer leg — its paired transaction on the other account.
 * `matchedEntityId` is deliberately NOT surfaced as a related record: no
 * service ever populates a human-readable label for it (see
 * BankTransactionTable's doc comment), so a link here would either be fake
 * or silently wrong.
 */
export function BankTransactionDetailSheet({ transaction, isLoading, bankAccount, open, onOpenChange, onAllocate }: BankTransactionDetailSheetProps) {
  const navigate = useNavigate();

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!transaction) return [];
    const items: RelatedRecordItem[] = [];
    if (bankAccount) {
      items.push({ label: 'Bank account', value: <RecordLink onClick={() => navigate('/banking/accounts')}>{bankAccount.name}</RecordLink> });
    }
    if (transaction.journalEntryId) {
      items.push({ label: 'GL posting', value: <RecordLink onClick={() => navigate(`/accounting/journals?record=${transaction.journalEntryId}`)}>View journal entry</RecordLink> });
    }
    if (transaction.transferPairId) {
      items.push({ label: 'Transfer pair', value: <RecordLink onClick={() => navigate('/banking/transactions')}>View paired leg</RecordLink> });
    }
    if (transaction.reconciliationId) {
      items.push({ label: 'Reconciliation', value: <RecordLink onClick={() => navigate('/banking/reconciliation')}>View reconciliation</RecordLink> });
    }
    return items;
  }, [transaction, bankAccount, navigate]);

  const state = isLoading ? 'loading' : transaction ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={transaction?.description ?? 'Transaction'}
      titleAdornment={transaction ? <StatusBadge status={transaction.status} /> : undefined}
      state={state}
      notFoundMessage="This transaction could not be found — it may have been deleted."
      className="sm:max-w-xl"
      actions={
        transaction && onAllocate && !transaction.transferPairId ? (
          <Button size="sm" onClick={onAllocate}>
            {transaction.allocations.length > 0 ? 'Edit allocation' : 'Allocate'}
          </Button>
        ) : undefined
      }
    >
      {transaction && (
        <div className="flex flex-col gap-6">
          <BankTransactionDetail transaction={transaction} bankAccount={bankAccount} />
          <RelatedRecordsSection items={relatedItems} />
          <RecordAuditHistorySection recordType="BankTransaction" recordId={transaction.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
