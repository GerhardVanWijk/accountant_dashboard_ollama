import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { LeaseContract } from '@/types/lease';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { useLeases } from '../hooks/useLeases';
import { useLeaseAmortization } from '../hooks/useLeaseAmortization';
import { LeaseForm } from '../components/LeaseForm';
import { TerminateLeaseForm } from '../components/TerminateLeaseForm';
import { LeasesTable } from '../components/LeasesTable';
import type { CreateLeaseDTO, UpdateLeaseDTO } from '../services';

type DialogState = { mode: 'create' } | { mode: 'edit'; lease: LeaseContract } | { mode: 'terminate'; lease: LeaseContract } | null;

/**
 * Lease Register — route `/leases/register`. Real useLeases()/leaseService
 * data throughout (lessee accounting only). No `leases` entry exists in
 * the real permission catalog (M11), so this route/its actions stay
 * ungated, same as before. Re-skinned onto v0's
 * PageHeader/SectionCard/DataTable/Dialog (M13).
 */
export function LeaseRegisterPage() {
  const { leases, loading, error, refetch, createLease, updateLease, deleteLease, postCommencement, terminateLease } = useLeases();
  const { history: amortizationHistory, loading: amortizationLoading } = useLeaseAmortization();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const completedAmortizationRunsByLease: Record<string, number> = {};
  for (const entry of amortizationHistory) {
    completedAmortizationRunsByLease[entry.leaseId] = (completedAmortizationRunsByLease[entry.leaseId] ?? 0) + 1;
  }

  const handleFormSubmit = async (data: CreateLeaseDTO | UpdateLeaseDTO) => {
    setActionError(null);
    try {
      if (dialog?.mode === 'edit') {
        await updateLease(dialog.lease.id, data as UpdateLeaseDTO);
      } else {
        await createLease(data as CreateLeaseDTO);
      }
      setDialog(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save the lease.');
    }
  };

  const handlePostCommencement = async (lease: LeaseContract) => {
    setActionError(null);
    try {
      await postCommencement(lease.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to post commencement.');
    }
  };

  const handleTerminate = async (terminationDate: string) => {
    if (dialog?.mode !== 'terminate') return;
    setActionError(null);
    try {
      await terminateLease(dialog.lease.id, terminationDate);
      setDialog(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to terminate the lease.');
    }
  };

  const handleDelete = async (lease: LeaseContract) => {
    if (!window.confirm(`Delete draft lease "${lease.leaseNumber} - ${lease.assetDescription}"? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await deleteLease(lease.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete the lease.');
    }
  };

  const busy = loading || amortizationLoading;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lease register"
        description="Register, commence, and terminate leases (lessee accounting only)."
        actions={
          <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
            <Plus data-icon="inline-start" />
            New lease
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
          <p className="text-sm">Loading leases…</p>
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
        <LeasesTable
          leases={leases}
          completedAmortizationRunsByLease={completedAmortizationRunsByLease}
          onEdit={(lease) => setDialog({ mode: 'edit', lease })}
          onPostCommencement={(lease) => void handlePostCommencement(lease)}
          onTerminate={(lease) => setDialog({ mode: 'terminate', lease })}
          onDelete={(lease) => void handleDelete(lease)}
        />
      )}

      <Dialog open={dialog?.mode === 'create' || dialog?.mode === 'edit'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'edit' ? 'Edit Lease' : 'New Lease'}</DialogTitle>
          </DialogHeader>
          {(dialog?.mode === 'create' || dialog?.mode === 'edit') && <LeaseForm lease={dialog.mode === 'edit' ? dialog.lease : undefined} onSubmit={handleFormSubmit} onCancel={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.mode === 'terminate'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Terminate Lease</DialogTitle>
          </DialogHeader>
          {dialog?.mode === 'terminate' && <TerminateLeaseForm lease={dialog.lease} onSubmit={handleTerminate} onCancel={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
