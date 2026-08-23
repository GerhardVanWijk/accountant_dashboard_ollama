import { useMemo, useState } from 'react';
import type { RelatedParty } from '@/types/relatedParty';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useRelatedParties } from '../hooks/useRelatedParties';
import { useRelatedPartyTransactions } from '../hooks/useRelatedPartyTransactions';
import { RelatedPartyForm } from '../components/RelatedPartyForm';
import { RelatedPartiesTable } from '../components/RelatedPartiesTable';
import { Modal } from '../components/Modal';
import type { CreateRelatedPartyDTO, UpdateRelatedPartyDTO } from '../services';

type DialogState = { mode: 'create' } | { mode: 'edit'; relatedParty: RelatedParty } | null;

/**
 * Related Party Register — route `/related-parties/register`
 * (SA_ACCOUNTING_MASTER_SPEC.md §88). A disclosure-support register only:
 * no journal entries, no draft/posted lifecycle. Directors, shareholders,
 * subsidiaries, associates, key management, and other related entities
 * are entered manually — this app has no shareholder register or
 * org-chart data to derive them from automatically.
 */
export function RelatedPartyRegisterPage() {
  const { relatedParties, loading, error, refetch, createRelatedParty, updateRelatedParty, deleteRelatedParty } = useRelatedParties();
  const { transactions, loading: transactionsLoading } = useRelatedPartyTransactions();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const transactionCountByPartyId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const transaction of transactions) {
      counts.set(transaction.relatedPartyId, (counts.get(transaction.relatedPartyId) ?? 0) + 1);
    }
    return counts;
  }, [transactions]);

  const handleFormSubmit = async (data: CreateRelatedPartyDTO | UpdateRelatedPartyDTO) => {
    setActionError(null);
    try {
      if (dialog?.mode === 'edit') {
        await updateRelatedParty(dialog.relatedParty.id, data as UpdateRelatedPartyDTO);
      } else {
        await createRelatedParty(data as CreateRelatedPartyDTO);
      }
      setDialog(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save the related party.');
    }
  };

  const handleDelete = async (relatedParty: RelatedParty) => {
    if (!window.confirm(`Delete related party "${relatedParty.name}"? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await deleteRelatedParty(relatedParty.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete the related party.');
    }
  };

  const busy = loading || transactionsLoading;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Related Party Register</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Directors, shareholders, subsidiaries, associates, key management, and other related entities, kept for
            financial statement disclosure. /related-parties/register
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: 'create' })}>New Related Party</Button>
      </div>

      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-md py-sm text-sm text-danger">
          {actionError}
        </p>
      )}

      {busy && <Spinner label="Loading related parties…" />}
      {!busy && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!busy && !error && (
        <Card>
          {relatedParties.length === 0 ? (
            <EmptyState
              title="No related parties yet"
              message="Add a director, shareholder, subsidiary, associate, or other related entity to start the register."
              action={<Button onClick={() => setDialog({ mode: 'create' })}>New Related Party</Button>}
            />
          ) : (
            <RelatedPartiesTable
              relatedParties={relatedParties}
              transactionCountByPartyId={transactionCountByPartyId}
              onEdit={(relatedParty) => setDialog({ mode: 'edit', relatedParty })}
              onDelete={handleDelete}
            />
          )}
        </Card>
      )}

      {(dialog?.mode === 'create' || dialog?.mode === 'edit') && (
        <Modal title={dialog.mode === 'edit' ? 'Edit Related Party' : 'New Related Party'} onClose={() => setDialog(null)}>
          <RelatedPartyForm
            relatedParty={dialog.mode === 'edit' ? dialog.relatedParty : undefined}
            onSubmit={handleFormSubmit}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}
    </div>
  );
}
