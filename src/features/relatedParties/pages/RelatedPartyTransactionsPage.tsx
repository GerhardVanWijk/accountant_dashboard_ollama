import { useMemo, useState } from 'react';
import type { RelatedPartyTransaction } from '@/types/relatedParty';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useRelatedParties } from '../hooks/useRelatedParties';
import { useRelatedPartyTransactions } from '../hooks/useRelatedPartyTransactions';
import { RelatedPartyTransactionForm } from '../components/RelatedPartyTransactionForm';
import { RelatedPartyTransactionsTable } from '../components/RelatedPartyTransactionsTable';
import { DisclosureSummaryTable } from '../components/DisclosureSummaryTable';
import { Modal } from '../components/Modal';
import { buildRelatedPartyDisclosureSummary, type CreateRelatedPartyTransactionDTO, type UpdateRelatedPartyTransactionDTO } from '../services';

type DialogState = { mode: 'create' } | { mode: 'edit'; transaction: RelatedPartyTransaction } | null;

/**
 * Related Party Transactions — route `/related-parties/transactions`
 * (SA_ACCOUNTING_MASTER_SPEC.md §88). Purely a disclosure-support record
 * of transactions between the company and its related parties: never
 * posted to the GL, and `sourceReference` is a free-text cross-check
 * pointer only, not an enforced link to any Invoice/Bill. Also renders
 * the per-related-party disclosure summary computed by
 * buildRelatedPartyDisclosureSummary().
 */
export function RelatedPartyTransactionsPage() {
  const { relatedParties, loading: relatedPartiesLoading } = useRelatedParties();
  const { transactions, loading, error, refetch, createTransaction, updateTransaction, deleteTransaction } = useRelatedPartyTransactions();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const relatedPartiesById = useMemo(() => new Map(relatedParties.map((p) => [p.id, p])), [relatedParties]);

  const disclosureSummary = useMemo(
    () => buildRelatedPartyDisclosureSummary(relatedParties, transactions),
    [relatedParties, transactions],
  );

  const handleFormSubmit = async (data: CreateRelatedPartyTransactionDTO | UpdateRelatedPartyTransactionDTO) => {
    setActionError(null);
    try {
      if (dialog?.mode === 'edit') {
        await updateTransaction(dialog.transaction.id, data as UpdateRelatedPartyTransactionDTO);
      } else {
        await createTransaction(data as CreateRelatedPartyTransactionDTO);
      }
      setDialog(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save the transaction.');
    }
  };

  const handleDelete = async (transaction: RelatedPartyTransaction) => {
    if (!window.confirm('Delete this related-party transaction? This cannot be undone.')) return;
    setActionError(null);
    try {
      await deleteTransaction(transaction.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete the transaction.');
    }
  };

  const busy = loading || relatedPartiesLoading;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Related Party Transactions</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Transactions with directors, shareholders, subsidiaries, associates, and other related entities, kept
            for disclosure only — nothing here posts to the GL. /related-parties/transactions
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: 'create' })} disabled={relatedParties.length === 0}>
          New Transaction
        </Button>
      </div>

      {relatedParties.length === 0 && !relatedPartiesLoading && (
        <p role="alert" className="rounded-md border border-warning bg-warning/10 px-md py-sm text-sm text-warning-financial">
          No related parties exist yet — add one on the Related Party Register before recording a transaction.
        </p>
      )}

      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-md py-sm text-sm text-danger">
          {actionError}
        </p>
      )}

      {busy && <Spinner label="Loading related party transactions…" />}
      {!busy && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!busy && !error && (
        <>
          <Card>
            {transactions.length === 0 ? (
              <EmptyState
                title="No related party transactions yet"
                message="Record a transaction to start building the disclosure history."
                action={
                  <Button onClick={() => setDialog({ mode: 'create' })} disabled={relatedParties.length === 0}>
                    New Transaction
                  </Button>
                }
              />
            ) : (
              <RelatedPartyTransactionsTable
                transactions={transactions}
                relatedPartiesById={relatedPartiesById}
                onEdit={(transaction) => setDialog({ mode: 'edit', transaction })}
                onDelete={handleDelete}
              />
            )}
          </Card>

          <div>
            <h2 className="mb-sm text-lg font-semibold text-text-primary">Disclosure Summary</h2>
            <Card>
              {disclosureSummary.length === 0 ? (
                <EmptyState title="Nothing to disclose yet" message="Record at least one transaction to see it summarized here." />
              ) : (
                <DisclosureSummaryTable rows={disclosureSummary} />
              )}
            </Card>
          </div>
        </>
      )}

      {(dialog?.mode === 'create' || dialog?.mode === 'edit') && (
        <Modal title={dialog.mode === 'edit' ? 'Edit Transaction' : 'New Transaction'} onClose={() => setDialog(null)}>
          <RelatedPartyTransactionForm
            transaction={dialog.mode === 'edit' ? dialog.transaction : undefined}
            relatedParties={relatedParties}
            onSubmit={handleFormSubmit}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}
    </div>
  );
}
