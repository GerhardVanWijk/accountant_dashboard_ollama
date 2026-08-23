import { useState } from 'react';
import type { LeaseContract } from '@/types/lease';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useLeases } from '../hooks/useLeases';
import { useLeaseAmortization } from '../hooks/useLeaseAmortization';
import { LeaseForm } from '../components/LeaseForm';
import { TerminateLeaseForm } from '../components/TerminateLeaseForm';
import { LeasesTable } from '../components/LeasesTable';
import { Modal } from '../components/Modal';
import type { CreateLeaseDTO, UpdateLeaseDTO } from '../services';

type DialogState =
  | { mode: 'create' }
  | { mode: 'edit'; lease: LeaseContract }
  | { mode: 'terminate'; lease: LeaseContract }
  | null;

/** Lease Register — route `/leases/register`. */
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
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Lease Register</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Register, commence, and terminate leases (lessee accounting only). /leases/register
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: 'create' })}>New Lease</Button>
      </div>

      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-md py-sm text-sm text-danger">
          {actionError}
        </p>
      )}

      {busy && <Spinner label="Loading leases…" />}
      {!busy && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!busy && !error && (
        <Card>
          {leases.length === 0 ? (
            <EmptyState
              title="No leases yet"
              message="Add a lease to start the register."
              action={<Button onClick={() => setDialog({ mode: 'create' })}>New Lease</Button>}
            />
          ) : (
            <LeasesTable
              leases={leases}
              completedAmortizationRunsByLease={completedAmortizationRunsByLease}
              onEdit={(lease) => setDialog({ mode: 'edit', lease })}
              onPostCommencement={handlePostCommencement}
              onTerminate={(lease) => setDialog({ mode: 'terminate', lease })}
              onDelete={handleDelete}
            />
          )}
        </Card>
      )}

      {(dialog?.mode === 'create' || dialog?.mode === 'edit') && (
        <Modal title={dialog.mode === 'edit' ? 'Edit Lease' : 'New Lease'} onClose={() => setDialog(null)}>
          <LeaseForm lease={dialog.mode === 'edit' ? dialog.lease : undefined} onSubmit={handleFormSubmit} onCancel={() => setDialog(null)} />
        </Modal>
      )}

      {dialog?.mode === 'terminate' && (
        <Modal title="Terminate Lease" onClose={() => setDialog(null)}>
          <TerminateLeaseForm lease={dialog.lease} onSubmit={handleTerminate} onCancel={() => setDialog(null)} />
        </Modal>
      )}
    </div>
  );
}
