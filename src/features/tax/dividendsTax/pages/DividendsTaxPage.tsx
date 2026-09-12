import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { DividendDeclaration } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { FormShell, FormHeader } from '@/components/app/form';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { cn } from '@/lib/utils';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { useDividendDeclarations } from '../hooks/useDividendDeclarations';
import { useDividendsTaxReconciliation } from '../hooks/useDividendsTaxReconciliation';
import { DividendDeclarationForm } from '../components/DividendDeclarationForm';
import { DividendDeclarationsTable } from '../components/DividendDeclarationsTable';
import type { CreateDividendDeclarationInput } from '../services';

function ReconciliationRow({ label, expected, gl, variance, isReconciled }: { label: string; expected: number; gl: number; variance: number; isReconciled: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', isReconciled ? 'bg-status-positive-muted text-status-positive' : 'bg-status-warning-muted text-status-warning')}>
          {isReconciled ? 'Reconciled' : 'Variance'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">Register</div>
          <div className="figure tabular-nums">{formatCurrency(expected)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">GL</div>
          <div className="figure tabular-nums">{formatCurrency(gl)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">Variance</div>
          <div className={cn('figure tabular-nums', !isReconciled && 'text-status-warning')}>{formatCurrency(variance)}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Dividends Tax — route `/tax/dividends`. Gross, company-wide
 * declarations only: this app has no shareholder register anywhere, so
 * there is no per-shareholder allocation here. Re-skinned onto v0's
 * PageHeader/SectionCard/Dialog (M7); declare/pay/remit lifecycle wiring
 * unchanged.
 */
export function DividendsTaxPage() {
  const { declarations, loading, error, refetch, createDeclaration, declare, pay, remitToSars, deleteDraft } = useDividendDeclarations();
  const { reconciliation, loading: reconciliationLoading, periodStart, periodEnd } = useDividendsTaxReconciliation();
  const canCreate = useCanAccess('tax', 'create');
  const canUpdate = useCanAccess('tax', 'update');
  const canPost = useCanAccess('tax', 'post');
  const [showCreate, setShowCreate] = useState(false);
  const [dirty, setDirty] = useState(false);
  const closeDialog = () => { setShowCreate(false); setDirty(false); };
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCreate = async (data: CreateDividendDeclarationInput) => {
    setActionError(null);
    try {
      await createDeclaration(data);
      setShowCreate(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create the dividend declaration.');
    }
  };

  const handleDeclare = async (declaration: DividendDeclaration) => {
    if (!window.confirm(`Declare a dividend of ${declaration.totalAmount.toFixed(2)}? This posts to the general ledger.`)) return;
    setActionError(null);
    try {
      await declare(declaration.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to declare the dividend.');
    }
  };

  const handlePay = async (declaration: DividendDeclaration) => {
    if (!window.confirm(`Record payment of ${declaration.netPayableToShareholders.toFixed(2)} net to shareholders (withholding ${declaration.dividendsTaxWithheld.toFixed(2)})?`)) return;
    setActionError(null);
    try {
      await pay(declaration.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to record the dividend payment.');
    }
  };

  const handleRemit = async (declaration: DividendDeclaration) => {
    if (!window.confirm(`Remit ${declaration.dividendsTaxWithheld.toFixed(2)} of withheld Dividends Tax to SARS?`)) return;
    setActionError(null);
    try {
      await remitToSars(declaration.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remit Dividends Tax.');
    }
  };

  const handleDelete = async (declaration: DividendDeclaration) => {
    if (!window.confirm(`Delete this draft dividend declaration dated ${declaration.declarationDate}? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await deleteDraft(declaration.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete the draft declaration.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dividends Tax"
        description="Dividend declarations, payments, and Dividends Withholding Tax."
        actions={canCreate ? <Button onClick={() => setShowCreate(true)}>New Declaration</Button> : undefined}
      />

      <p className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
        This system has no shareholder register, so amounts here are gross/company-wide only — dividends are not allocated to individual shareholders. Withholding is calculated at the
        statutory Dividends Withholding Tax rate on the taxable (non-exempt) portion; any exemption is a manual override you enter with a reason, not a computed eligibility check. Not a
        substitute for professional review.
      </p>

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <SectionCard
        title="Register ↔ GL Reconciliation"
        description={`${formatDate(periodStart.toISOString())} – ${formatDate(periodEnd.toISOString())} — independently compares the declaration register against real ledger movement. Never derived from the same source on both sides.`}
      >
        {reconciliationLoading && <p className="text-sm text-muted-foreground">Reconciling…</p>}
        {!reconciliationLoading && reconciliation && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReconciliationRow
              label="Dividends Payable"
              expected={reconciliation.dividendsPayable.expectedMovement}
              gl={reconciliation.dividendsPayable.glMovement}
              variance={reconciliation.dividendsPayable.variance}
              isReconciled={reconciliation.dividendsPayable.isReconciled}
            />
            <ReconciliationRow
              label="Dividends Tax Payable"
              expected={reconciliation.dividendsTaxPayable.expectedMovement}
              gl={reconciliation.dividendsTaxPayable.glMovement}
              variance={reconciliation.dividendsTaxPayable.variance}
              isReconciled={reconciliation.dividendsTaxPayable.isReconciled}
            />
          </div>
        )}
      </SectionCard>

      {loading && (
        <div role="status" className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <span className="text-sm">Loading dividend declarations…</span>
        </div>
      )}
      {!loading && error && (
        <SectionCard>
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
          <Button variant="outline" className="mt-3" onClick={refetch}>
            Retry
          </Button>
        </SectionCard>
      )}
      {!loading && !error && (
        <DividendDeclarationsTable declarations={declarations} onDeclare={handleDeclare} onPay={handlePay} onRemit={handleRemit} onDelete={handleDelete} canUpdate={canUpdate} canPost={canPost} />
      )}

      {showCreate && (
        <FormShell open onClose={closeDialog} size="md" mode="create" isDirty={dirty}>
          <FormHeader title="New dividend declaration" />
          <DividendDeclarationForm onSubmit={handleCreate} onCancel={closeDialog} onDirtyChange={setDirty} />
        </FormShell>
      )}
    </div>
  );
}
