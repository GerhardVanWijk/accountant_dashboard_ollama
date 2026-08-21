import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import type { TaxRate } from '@/types';
import { useTaxRateManagement } from '../hooks/useTaxRateManagement';
import { TaxRateTable } from '../components/TaxRateTable';
import { TaxRateForm } from '../components/TaxRateForm';
import { SupersedeTaxRateForm } from '../components/SupersedeTaxRateForm';
import { Modal } from '../components/Modal';

type DialogState = { mode: 'create' } | { mode: 'supersede'; rate: TaxRate } | null;

/**
 * Tax Rates settings — create/version/deactivate VAT tax codes
 * (SA_ACCOUNTING_MASTER_SPEC.md §9/§12/§82/§113). Route `/tax/rates`
 * (docs/ROUTES.md). Every rate is effective-dated; changing one creates a
 * new version instead of editing the existing rate — see
 * TaxRateService.supersede()'s doc comment.
 */
export function TaxRatesPage() {
  const { taxRates, loading, error, createTaxRate, supersede, deactivate } = useTaxRateManagement();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleCreate(data: Parameters<typeof createTaxRate>[0]) {
    setActionError(null);
    setIsSaving(true);
    try {
      await createTaxRate(data);
      setDialog(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not create tax code.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSupersede(input: Parameters<typeof supersede>[1], reason: string) {
    if (dialog?.mode !== 'supersede') return;
    setActionError(null);
    setIsSaving(true);
    try {
      await supersede(dialog.rate.code, input, reason);
      setDialog(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not supersede tax rate.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeactivate(rate: TaxRate) {
    setActionError(null);
    try {
      await deactivate(rate.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not deactivate tax rate.');
    }
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Tax Rates</h1>
          <p className="mt-xs text-sm text-text-secondary">
            VAT tax codes used across Sales, Purchases, and Banking. Every rate is effective-dated — changing one
            creates a new version rather than editing history.
          </p>
        </div>
        <Button variant="primary" onClick={() => setDialog({ mode: 'create' })}>
          <Icon name="add" size={16} />
          New Tax Code
        </Button>
      </div>

      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-md py-sm text-sm text-danger">
          {actionError}
        </p>
      )}

      {loading && <Spinner label="Loading tax rates…" />}
      {!loading && error && <ErrorState message={error.message} />}
      {!loading && !error && (
        <TaxRateTable
          taxRates={taxRates}
          onSupersede={(rate) => setDialog({ mode: 'supersede', rate })}
          onDeactivate={(rate) => void handleDeactivate(rate)}
        />
      )}

      {dialog?.mode === 'create' && (
        <Modal title="New Tax Code" onClose={() => setDialog(null)} wide>
          <TaxRateForm onSubmit={handleCreate} onCancel={() => setDialog(null)} isLoading={isSaving} />
        </Modal>
      )}

      {dialog?.mode === 'supersede' && (
        <Modal title={`Supersede ${dialog.rate.code}`} onClose={() => setDialog(null)} wide>
          <SupersedeTaxRateForm
            currentVersion={dialog.rate}
            onSubmit={handleSupersede}
            onCancel={() => setDialog(null)}
            isLoading={isSaving}
          />
        </Modal>
      )}
    </div>
  );
}
