import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLogSensitiveAccess } from '@/features/auth/hooks/useLogSensitiveAccess';
import { CircleCheckIcon, FileClockIcon, Loader2, Plus, WalletCardsIcon } from 'lucide-react';
import type { PayrollRun } from '@/types';
import { PageHeader } from '@/components/app/page-header';
import { StatTileGrid } from '@/components/app/stat-tile';
import { Button } from '@/components/ui/shadcn/button';
import { FormShell, FormHeader } from '@/components/app/form';
import { formatCurrency } from '@/lib/app/format';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { useBankAccounts } from '@/features/banking/hooks/useBankAccounts';
import { useBankTransactions } from '@/features/banking/hooks/useBankTransactions';
import { usePayrollRuns } from '../hooks/usePayrollRuns';
import { payrollRunService } from '../services';
import { PayrollRunForm } from '../components/PayrollRunForm';
import { PayrollRunsTable } from '../components/PayrollRunsTable';
import { PayrollRunDetail } from '../components/PayrollRunDetail';
import { PostPayrollRunForm } from '../components/PostPayrollRunForm';
import { ReversePayrollRunForm } from '../components/ReversePayrollRunForm';
import { SettleClearingBalanceForm } from '@/features/banking/components/SettleClearingBalanceForm';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';

type DialogState =
  | { mode: 'create' }
  | { mode: 'view'; run: PayrollRun }
  | { mode: 'post'; run: PayrollRun }
  | { mode: 'reverse'; run: PayrollRun }
  | { mode: 'settle'; run: PayrollRun }
  | null;

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
  useLogSensitiveAccess('Payroll — runs');
  const navigate = useNavigate();
  const { runs, loading, error, refetch, createPayrollRun, updatePayslipOverride, deletePayrollRun, postPayrollRun, reversePayrollRun } = usePayrollRuns();
  const { accounts, loading: accountsLoading } = useAccounts();
  const { bankAccounts, isLoading: bankAccountsLoading } = useBankAccounts();
  const { transactions: bankTransactions, isLoading: bankTransactionsLoading, refetch: refetchBankTransactions } = useBankTransactions();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dirty, setDirty] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const closeDialog = () => {
    setDialog(null);
    setDirty(false);
    if (searchParams.has('record')) {
      searchParams.delete('record');
      setSearchParams(searchParams, { replace: true });
    }
  };
  const [actionError, setActionError] = useState<string | null>(null);
  const canCreate = useCanAccess('payroll', 'create');
  const canDelete = useCanAccess('payroll', 'delete');

  // Deep-link support — Banking's "Settles" related-record link (see
  // BankTransactionDetailSheet.tsx) opens a specific run via ?record=.
  useEffect(() => {
    const recordId = searchParams.get('record');
    if (!recordId) return;
    setDialog((current) => {
      if (current) return current;
      const run = runs.find((r) => r.id === recordId);
      return run ? { mode: 'view', run } : current;
    });
  }, [runs, searchParams]);

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

  const handleReverse = async (runId: string, reason: string, reversalDate: string) => {
    setActionError(null);
    try {
      const reversed = await reversePayrollRun(runId, reason, reversalDate);
      setDialog({ mode: 'view', run: reversed });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reverse the payroll run.');
    }
  };

  const handleSettle = async (run: PayrollRun, input: { bankAccountId: string; date: string; amount: number; reference?: string }) => {
    setActionError(null);
    try {
      // FINAL PRE-MIGRATION HARDENING, PART A: posts through the atomic,
      // over-settlement-proof `settle_payroll_net_pay` RPC (0096) — the
      // database itself derives and validates the outstanding balance;
      // the max/placeholder computed for this form below is a UX
      // convenience only, never trusted.
      await payrollRunService.settleNetPay(run.id, {
        bankAccountId: input.bankAccountId,
        date: input.date,
        amount: input.amount,
        description: `Net pay — ${run.runNumber}`,
        reference: input.reference,
      });
      await refetchBankTransactions();
      setDialog({ mode: 'view', run });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to record the settlement.');
    }
  };

  const settlementsForRun = useMemo(() => {
    if (dialog?.mode !== 'view' && dialog?.mode !== 'settle') return [];
    const runId = dialog.run.id;
    return bankTransactions.filter((t) => t.matchedEntityType === 'payroll_run' && t.matchedEntityId === runId);
  }, [dialog, bankTransactions]);

  const busy = loading || accountsLoading;
  const postedRuns = runs.filter((r) => r.status === 'posted' && !r.reversedAt);
  const draftRuns = runs.filter((r) => r.status === 'draft');
  const totalNetPayPosted = postedRuns.reduce((sum, r) => sum + r.payslips.reduce((s, p) => s + p.netPay, 0), 0);

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
        <>
          <StatTileGrid
            columns={3}
            metrics={[
              { label: 'Posted runs', value: String(postedRuns.length), hint: `${runs.length} total`, icon: CircleCheckIcon },
              { label: 'Draft runs', value: String(draftRuns.length), hint: 'Awaiting review/posting', icon: FileClockIcon },
              { label: 'Net pay posted', value: formatCurrency(totalNetPayPosted), hint: 'Cleared through Net Pay Payable, not yet Cash', icon: WalletCardsIcon },
            ]}
          />
          <PayrollRunsTable runs={runs} onView={(run) => setDialog({ mode: 'view', run })} onDelete={canDelete ? (run) => void handleDelete(run) : undefined} />
        </>
      )}

      {dialog?.mode === 'create' && (
        <FormShell open onClose={closeDialog} size="md" mode="create" isDirty={dirty}>
          <FormHeader title="New payroll run" />
          <PayrollRunForm defaultPeriodStart={firstOfMonthISO()} defaultPeriodEnd={endOfMonthISO()} defaultPayDate={todayISO()} onSubmit={handleCreate} onCancel={closeDialog} onDirtyChange={setDirty} />
        </FormShell>
      )}

      {dialog?.mode === 'view' && (
        <FormShell open onClose={closeDialog} size="xl" mode="detail">
          <FormHeader
            title={`Payroll run ${dialog.run.runNumber}`}
            actions={
              dialog.run.status === 'draft' ? (
                <Button type="button" size="sm" onClick={() => setDialog({ mode: 'post', run: dialog.run })}>
                  Post Run
                </Button>
              ) : undefined
            }
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4">
            <PayrollRunDetail
              run={dialog.run}
              accounts={accounts}
              bankAccounts={bankAccounts}
              settlementTransactions={settlementsForRun}
              onOverrideChange={dialog.run.status === 'draft' ? (employeeId, overtime, bonus) => handleOverrideChange(dialog.run.id, employeeId, overtime, bonus) : undefined}
              onOpenJournal={(journalEntryId) => navigate(`/accounting/journals?record=${journalEntryId}`)}
              onSettle={canDelete ? () => setDialog({ mode: 'settle', run: dialog.run }) : undefined}
              onReverse={canDelete ? () => setDialog({ mode: 'reverse', run: dialog.run }) : undefined}
            />
          </div>
        </FormShell>
      )}

      {dialog?.mode === 'post' && (
        <FormShell open onClose={() => setDialog({ mode: 'view', run: dialog.run })} size="md" mode="create" isDirty={dirty}>
          <FormHeader title={`Post payroll run ${dialog.run.runNumber}`} />
          <PostPayrollRunForm accounts={accounts} onSubmit={(contraAccountId) => handlePost(dialog.run.id, contraAccountId)} onCancel={() => setDialog({ mode: 'view', run: dialog.run })} onDirtyChange={setDirty} />
        </FormShell>
      )}

      {dialog?.mode === 'reverse' && (
        <FormShell open onClose={() => setDialog({ mode: 'view', run: dialog.run })} size="md" mode="edit" isDirty={dirty}>
          <FormHeader title={`Reverse payroll run ${dialog.run.runNumber}`} />
          <ReversePayrollRunForm
            run={dialog.run}
            onSubmit={(reason, reversalDate) => handleReverse(dialog.run.id, reason, reversalDate)}
            onCancel={() => setDialog({ mode: 'view', run: dialog.run })}
            onDirtyChange={setDirty}
          />
        </FormShell>
      )}

      {dialog?.mode === 'settle' && (
        <FormShell open onClose={() => setDialog({ mode: 'view', run: dialog.run })} size="md" mode="create" isDirty={dirty}>
          <FormHeader title={`Settle net pay — ${dialog.run.runNumber}`} />
          {!bankAccountsLoading && !bankTransactionsLoading && (
            <SettleClearingBalanceForm
              bankAccounts={bankAccounts}
              maxAmount={Math.max(
                0,
                dialog.run.payslips.reduce((s, p) => s + p.netPay, 0) - settlementsForRun.reduce((s, t) => s + t.amount, 0),
              )}
              defaultDescription={`Net pay — ${dialog.run.runNumber}`}
              onSubmit={(input) => handleSettle(dialog.run, input)}
              onCancel={() => setDialog({ mode: 'view', run: dialog.run })}
              onDirtyChange={setDirty}
            />
          )}
        </FormShell>
      )}
    </div>
  );
}
