import { useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { RelatedParty } from '@/types/relatedParty';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { FormShell, FormHeader } from '@/components/app/form';
import { useRelatedParties } from '../hooks/useRelatedParties';
import { useRelatedPartyTransactions } from '../hooks/useRelatedPartyTransactions';
import { RelatedPartyForm } from '../components/RelatedPartyForm';
import { RelatedPartiesTable } from '../components/RelatedPartiesTable';
import type { CreateRelatedPartyDTO, UpdateRelatedPartyDTO } from '../services';

type DialogState = { mode: 'create' } | { mode: 'edit'; relatedParty: RelatedParty } | null;

/**
 * Related Party Register — route `/related-parties/register`. A
 * disclosure-support register only: no journal entries, no draft/posted
 * lifecycle. Directors, shareholders, subsidiaries, associates, key
 * management, and other related entities are entered manually — this app
 * has no shareholder register or org-chart data to derive them from
 * automatically. No `related-parties` entry exists in the real permission
 * catalog (M11), so this route/its actions stay ungated, same as before.
 * Re-skinned onto v0's PageHeader/SectionCard/DataTable/Dialog (M13).
 */
export function RelatedPartyRegisterPage() {
  const { relatedParties, loading, error, refetch, createRelatedParty, updateRelatedParty, deleteRelatedParty } = useRelatedParties();
  const { transactions, loading: transactionsLoading } = useRelatedPartyTransactions();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dirty, setDirty] = useState(false);
  const closeDialog = () => { setDialog(null); setDirty(false); };
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Related party register"
        description="Directors, shareholders, subsidiaries, associates, key management, and other related entities, kept for financial statement disclosure."
        actions={
          <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
            <Plus data-icon="inline-start" />
            New related party
          </Button>
        }
      />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {busy && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading related parties…</p>
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
        <RelatedPartiesTable
          relatedParties={relatedParties}
          transactionCountByPartyId={transactionCountByPartyId}
          onEdit={(relatedParty) => setDialog({ mode: 'edit', relatedParty })}
          onDelete={(relatedParty) => void handleDelete(relatedParty)}
        />
      )}

      {(dialog?.mode === 'create' || dialog?.mode === 'edit') && (
        <FormShell open onClose={closeDialog} size="md" mode={dialog.mode} isDirty={dirty}>
          <FormHeader title={dialog.mode === 'edit' ? 'Edit related party' : 'New related party'} />
          <RelatedPartyForm relatedParty={dialog.mode === 'edit' ? dialog.relatedParty : undefined} onSubmit={handleFormSubmit} onCancel={closeDialog} onDirtyChange={setDirty} />
        </FormShell>
      )}
    </div>
  );
}
