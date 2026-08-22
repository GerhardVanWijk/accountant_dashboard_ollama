import { useState } from 'react';
import type { DividendDeclaration } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useDividendDeclarations } from '../hooks/useDividendDeclarations';
import { DividendDeclarationForm } from '../components/DividendDeclarationForm';
import { DividendDeclarationsTable } from '../components/DividendDeclarationsTable';
import { Modal } from '../components/Modal';
import type { CreateDividendDeclarationInput } from '../services';

/**
 * Dividends Tax — route `/tax/dividends` (SA_ACCOUNTING_MASTER_SPEC.md
 * §56). Gross, company-wide declarations only: this app has no
 * shareholder register anywhere, so there is no per-shareholder
 * allocation here — see DividendDeclaration's doc comment
 * (src/types/dividendsTax.ts) for that documented, out-of-scope gap.
 */
export function DividendsTaxPage() {
  const { declarations, loading, error, refetch, createDeclaration, declare, pay, remitToSars, deleteDraft } =
    useDividendDeclarations();
  const [showCreate, setShowCreate] = useState(false);
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
    if (
      !window.confirm(
        `Record payment of ${declaration.netPayableToShareholders.toFixed(2)} net to shareholders (withholding ${declaration.dividendsTaxWithheld.toFixed(2)})?`,
      )
    )
      return;
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
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-sm text-2xl font-semibold text-text-primary">
            <Icon name="dividends" size={22} />
            Dividends Tax
          </h1>
          <p className="mt-xs text-sm text-text-secondary">
            Dividend declarations, payments, and Dividends Withholding Tax. /tax/dividends
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>New Declaration</Button>
      </div>

      <p className="rounded-md border border-border bg-panel px-md py-sm text-xs text-text-secondary">
        This system has no shareholder register, so amounts here are gross/company-wide only — dividends are not
        allocated to individual shareholders. Withholding is calculated at the statutory Dividends Withholding Tax
        rate on the taxable (non-exempt) portion; any exemption is a manual override you enter with a reason, not a
        computed eligibility check. Not a substitute for professional review (SA_ACCOUNTING_MASTER_SPEC.md §110/§111).
      </p>

      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-md py-sm text-sm text-danger">
          {actionError}
        </p>
      )}

      {loading && <Spinner label="Loading dividend declarations…" />}
      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && (
        <Card>
          {declarations.length === 0 ? (
            <EmptyState
              title="No dividend declarations yet"
              message="Create a declaration to start the Dividends Tax lifecycle."
              action={<Button onClick={() => setShowCreate(true)}>New Declaration</Button>}
            />
          ) : (
            <DividendDeclarationsTable
              declarations={declarations}
              onDeclare={handleDeclare}
              onPay={handlePay}
              onRemit={handleRemit}
              onDelete={handleDelete}
            />
          )}
        </Card>
      )}

      {showCreate && (
        <Modal title="New Dividend Declaration" onClose={() => setShowCreate(false)}>
          <DividendDeclarationForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
        </Modal>
      )}
    </div>
  );
}
