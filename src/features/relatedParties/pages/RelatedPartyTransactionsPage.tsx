import { useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { RelatedPartyTransaction } from '@/types/relatedParty';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { useRelatedParties } from '../hooks/useRelatedParties';
import { useRelatedPartyTransactions } from '../hooks/useRelatedPartyTransactions';
import { RelatedPartyTransactionForm } from '../components/RelatedPartyTransactionForm';
import { RelatedPartyTransactionsTable } from '../components/RelatedPartyTransactionsTable';
import { DisclosureSummaryTable } from '../components/DisclosureSummaryTable';
import { buildRelatedPartyDisclosureSummary, type CreateRelatedPartyTransactionDTO, type UpdateRelatedPartyTransactionDTO } from '../services';

type DialogState = { mode: 'create' } | { mode: 'edit'; transaction: RelatedPartyTransaction } | null;

/**
 * Related Party Transactions — route `/related-parties/transactions`.
 * Purely a disclosure-support record of transactions between the company
 * and its related parties: never posted to the GL, and `sourceReference`
 * is a free-text cross-check pointer only, not an enforced link to any
 * Invoice/Bill. Also renders the per-related-party disclosure summary
 * computed by buildRelatedPartyDisclosureSummary(). Re-skinned onto v0's
 * PageHeader/SectionCard/DataTable/Dialog (M13).
 */
export function RelatedPartyTransactionsPage() {
  const { relatedParties, loading: relatedPartiesLoading } = useRelatedParties();
  const { transactions, loading, error, refetch, createTransaction, updateTransaction, deleteTransaction } = useRelatedPartyTransactions();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const relatedPartiesById = useMemo(() => new Map(relatedParties.map((p) => [p.id, p])), [relatedParties]);
  const disclosureSummary = useMemo(() => buildRelatedPartyDisclosureSummary(relatedParties, transactions), [relatedParties, transactions]);

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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Related party transactions"
        description="Transactions with directors, shareholders, subsidiaries, associates, and other related entities, kept for disclosure only — nothing here posts to the GL."
        actions={
          <Button size="sm" disabled={relatedParties.length === 0} onClick={() => setDialog({ mode: 'create' })}>
            <Plus data-icon="inline-start" />
            New transaction
          </Button>
        }
      />

      {relatedParties.length === 0 && !relatedPartiesLoading && (
        <p role="alert" className="rounded-lg border border-status-warning-outline bg-status-warning-surface px-4 py-2.5 text-sm text-status-warning">
          No related parties exist yet — add one on the Related Party Register before recording a transaction.
        </p>
      )}

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {busy && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading related party transactions…</p>
        </div>
      )}
      {!busy && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!busy && !error && (
        <>
          <RelatedPartyTransactionsTable transactions={transactions} relatedPartiesById={relatedPartiesById} onEdit={(transaction) => setDialog({ mode: 'edit', transaction })} onDelete={(transaction) => void handleDelete(transaction)} />

          <SectionCard title="Disclosure summary">
            <DisclosureSummaryTable rows={disclosureSummary} />
          </SectionCard>
        </>
      )}

      <Dialog open={dialog?.mode === 'create' || dialog?.mode === 'edit'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'edit' ? 'Edit Transaction' : 'New Transaction'}</DialogTitle>
          </DialogHeader>
          {(dialog?.mode === 'create' || dialog?.mode === 'edit') && (
            <RelatedPartyTransactionForm transaction={dialog.mode === 'edit' ? dialog.transaction : undefined} relatedParties={relatedParties} onSubmit={handleFormSubmit} onCancel={() => setDialog(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
