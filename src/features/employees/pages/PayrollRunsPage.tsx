import { useState } from 'react';
import type { PayrollRun } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { usePayrollRuns } from '../hooks/usePayrollRuns';
import { PayrollRunForm } from '../components/PayrollRunForm';
import { PayrollRunsTable } from '../components/PayrollRunsTable';
import { PayslipLinesTable } from '../components/PayslipLinesTable';
import { PostPayrollRunForm } from '../components/PostPayrollRunForm';
import { Modal } from '../components/Modal';

type DialogState = { mode: 'create' } | { mode: 'view'; run: PayrollRun } | { mode: 'post'; run: PayrollRun } | null;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function endOfMonthISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

/** Payroll Runs — route `/payroll/runs` (docs/ROUTES.md). */
export function PayrollRunsPage() {
  const { runs, loading, error, refetch, createPayrollRun, updatePayslipOverride, deletePayrollRun, postPayrollRun } = usePayrollRuns();
  const { accounts, loading: accountsLoading } = useAccounts();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCreate = async (payPeriodStart: string, payPeriodEnd: string, payDate: string) => {
    setActionError(null);
    try {
      const created = await createPayrollRun(payPeriodStart, payPeriodEnd, payDate);
      setDialog({ mode: 'view', run: created });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create the payroll run.');
    }
  };

  const handleDelete = async (run: PayrollRun) => {
    if (!window.confirm(`Delete draft payroll run "${run.runNumber}"? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await deletePayrollRun(run.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete the payroll run.');
    }
  };

  const handleOverrideChange = async (runId: string, employeeId: string, overtime: number, bonus: number) => {
    setActionError(null);
    try {
      const updated = await updatePayslipOverride(runId, employeeId, { overtime, bonus });
      setDialog({ mode: 'view', run: updated });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update the payslip line.');
    }
  };

  const handlePost = async (runId: string, contraAccountId: string) => {
    setActionError(null);
    try {
      await postPayrollRun(runId, contraAccountId);
      setDialog(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to post the payroll run.');
    }
  };

  const busy = loading || accountsLoading;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Payroll Runs</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Create, review, and post payroll — each run computes every active employee's payslip, then posts one
            combined GL entry. /payroll/runs
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: 'create' })}>New Payroll Run</Button>
      </div>

      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-md py-sm text-sm text-danger">
          {actionError}
        </p>
      )}

      {busy && <Spinner label="Loading payroll runs…" />}
      {!busy && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!busy && !error && (
        <Card>
          {runs.length === 0 ? (
            <EmptyState
              title="No payroll runs yet"
              message="Create a payroll run to pay your employees."
              action={<Button onClick={() => setDialog({ mode: 'create' })}>New Payroll Run</Button>}
            />
          ) : (
            <PayrollRunsTable runs={runs} onView={(run) => setDialog({ mode: 'view', run })} onDelete={handleDelete} />
          )}
        </Card>
      )}

      {dialog?.mode === 'create' && (
        <Modal title="New Payroll Run" onClose={() => setDialog(null)}>
          <PayrollRunForm
            defaultPeriodStart={firstOfMonthISO()}
            defaultPeriodEnd={endOfMonthISO()}
            defaultPayDate={todayISO()}
            onSubmit={handleCreate}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}

      {dialog?.mode === 'view' && (
        <Modal title={`Payroll Run ${dialog.run.runNumber}`} onClose={() => setDialog(null)} wide>
          <div className="flex flex-col gap-md">
            <PayslipLinesTable
              run={dialog.run}
              onOverrideChange={
                dialog.run.status === 'draft'
                  ? (employeeId, overtime, bonus) => handleOverrideChange(dialog.run.id, employeeId, overtime, bonus)
                  : undefined
              }
            />
            <div className="flex justify-end gap-sm">
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
                Close
              </Button>
              {dialog.run.status === 'draft' && <Button type="button" onClick={() => setDialog({ mode: 'post', run: dialog.run })}>Post Run</Button>}
            </div>
          </div>
        </Modal>
      )}

      {dialog?.mode === 'post' && (
        <Modal title={`Post Payroll Run ${dialog.run.runNumber}`} onClose={() => setDialog(null)}>
          <PostPayrollRunForm
            accounts={accounts}
            onSubmit={(contraAccountId) => handlePost(dialog.run.id, contraAccountId)}
            onCancel={() => setDialog({ mode: 'view', run: dialog.run })}
          />
        </Modal>
      )}
    </div>
  );
}
