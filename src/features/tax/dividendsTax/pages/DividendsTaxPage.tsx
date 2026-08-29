import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { DividendDeclaration } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { FormShell, FormHeader } from '@/components/app/form';
import { useDividendDeclarations } from '../hooks/useDividendDeclarations';
import { DividendDeclarationForm } from '../components/DividendDeclarationForm';
import { DividendDeclarationsTable } from '../components/DividendDeclarationsTable';
import type { CreateDividendDeclarationInput } from '../services';

/**
 * Dividends Tax — route `/tax/dividends`. Gross, company-wide
 * declarations only: this app has no shareholder register anywhere, so
 * there is no per-shareholder allocation here. Re-skinned onto v0's
 * PageHeader/SectionCard/Dialog (M7); declare/pay/remit lifecycle wiring
 * unchanged.
 */
export function DividendsTaxPage() {
  const { declarations, loading, error, refetch, createDeclaration, declare, pay, remitToSars, deleteDraft } = useDividendDeclarations();
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
        actions={<Button onClick={() => setShowCreate(true)}>New Declaration</Button>}
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
        <DividendDeclarationsTable declarations={declarations} onDeclare={handleDeclare} onPay={handlePay} onRemit={handleRemit} onDelete={handleDelete} />
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
