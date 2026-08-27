import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { PayrollRun } from '@/types';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { usePayrollRuns } from '../hooks/usePayrollRuns';
import { PayrollRunForm } from '../components/PayrollRunForm';
import { PayrollRunsTable } from '../components/PayrollRunsTable';
import { PayslipLinesTable } from '../components/PayslipLinesTable';
import { PostPayrollRunForm } from '../components/PostPayrollRunForm';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';

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

/**
 * Payroll Runs — route `/payroll/runs`. Real usePayrollRuns()/
 * payrollRunService data throughout — creation, review, per-employee
 * overtime/bonus overrides, and posting all go through the same real,
 * GL-posting service unchanged. Re-skinned onto v0's
 * PageHeader/SectionCard/DataTable/Dialog (M13).
 */
export function PayrollRunsPage() {
  const { runs, loading, error, refetch, createPayrollRun, updatePayslipOverride, deletePayrollRun, postPayrollRun } = usePayrollRuns();
  const { accounts, loading: accountsLoading } = useAccounts();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canCreate = useCanAccess('payroll', 'create');
  const canDelete = useCanAccess('payroll', 'delete');

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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payroll runs"
        description="Create, review, and post payroll — each run computes every active employee's payslip, then posts one combined GL entry."
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
              <Plus data-icon="inline-start" />
              New payroll run
            </Button>
          ) : undefined
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
          <p className="text-sm">Loading payroll runs…</p>
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
        <PayrollRunsTable runs={runs} onView={(run) => setDialog({ mode: 'view', run })} onDelete={canDelete ? (run) => void handleDelete(run) : undefined} />
      )}

      <Dialog open={dialog?.mode === 'create'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Payroll Run</DialogTitle>
          </DialogHeader>
          {dialog?.mode === 'create' && (
            <PayrollRunForm defaultPeriodStart={firstOfMonthISO()} defaultPeriodEnd={endOfMonthISO()} defaultPayDate={todayISO()} onSubmit={handleCreate} onCancel={() => setDialog(null)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.mode === 'view'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'view' ? `Payroll Run ${dialog.run.runNumber}` : ''}</DialogTitle>
          </DialogHeader>
          {dialog?.mode === 'view' && (
            <div className="flex flex-col gap-4">
              <PayslipLinesTable
                run={dialog.run}
                onOverrideChange={dialog.run.status === 'draft' ? (employeeId, overtime, bonus) => handleOverrideChange(dialog.run.id, employeeId, overtime, bonus) : undefined}
              />
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                  Close
                </Button>
                {dialog.run.status === 'draft' && (
                  <Button type="button" onClick={() => setDialog({ mode: 'post', run: dialog.run })}>
                    Post Run
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.mode === 'post'} onOpenChange={(open) => !open && dialog?.mode === 'post' && setDialog({ mode: 'view', run: dialog.run })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'post' ? `Post Payroll Run ${dialog.run.runNumber}` : ''}</DialogTitle>
          </DialogHeader>
          {dialog?.mode === 'post' && (
            <PostPayrollRunForm accounts={accounts} onSubmit={(contraAccountId) => handlePost(dialog.run.id, contraAccountId)} onCancel={() => setDialog({ mode: 'view', run: dialog.run })} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
