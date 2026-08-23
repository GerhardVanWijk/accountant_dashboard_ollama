import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import type { ExchangeRate } from '@/types/foreignExchange';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { ExchangeRateTable } from '../components/ExchangeRateTable';
import { ExchangeRateForm } from '../components/ExchangeRateForm';
import { Modal } from '../components/Modal';

type DialogState = { mode: 'create' } | { mode: 'edit'; rate: ExchangeRate } | null;

/**
 * Exchange Rates settings — record/edit/delete point-in-time market rates
 * per currency pair (SA_ACCOUNTING_MASTER_SPEC.md §33). Route
 * `/foreign-exchange/rates` (to be wired into router.tsx/navigation.ts by
 * a later Queen integration pass — see this module's scope-boundary note
 * in exchangeRateService.ts). Every rate here is ALWAYS manually entered;
 * there is no live FX feed. Mirrors TaxRatesPage.tsx's shape, but rates
 * are simpler point-in-time records rather than effective-dated versions.
 */
export function ExchangeRatesPage() {
  const { rates, loading, error, createRate, updateRate, deleteRate } = useExchangeRates();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleCreate(data: Parameters<typeof createRate>[0]) {
    setActionError(null);
    setIsSaving(true);
    try {
      await createRate(data);
      setDialog(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not create exchange rate.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleEdit(data: Parameters<typeof updateRate>[1]) {
    if (dialog?.mode !== 'edit') return;
    setActionError(null);
    setIsSaving(true);
    try {
      await updateRate(dialog.rate.id, data);
      setDialog(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update exchange rate.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(rate: ExchangeRate) {
    setActionError(null);
    try {
      await deleteRate(rate.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete exchange rate.');
    }
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Exchange Rates</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Point-in-time FX rates by currency pair (SA_ACCOUNTING_MASTER_SPEC.md §33). Every rate is ALWAYS manually
            entered — no live FX feed is wired into this codebase. As a matter of process, prefer recording a new
            rate over editing an existing one for a date that already has a rate.
          </p>
        </div>
        <Button variant="primary" onClick={() => setDialog({ mode: 'create' })}>
          <Icon name="add" size={16} />
          New Rate
        </Button>
      </div>

      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-md py-sm text-sm text-danger">
          {actionError}
        </p>
      )}

      {loading && <Spinner label="Loading exchange rates…" />}
      {!loading && error && <ErrorState message={error.message} />}
      {!loading && !error && (
        <ExchangeRateTable
          rates={rates}
          onEdit={(rate) => setDialog({ mode: 'edit', rate })}
          onDelete={(rate) => void handleDelete(rate)}
        />
      )}

      {dialog?.mode === 'create' && (
        <Modal title="New Exchange Rate" onClose={() => setDialog(null)} wide>
          <ExchangeRateForm onSubmit={handleCreate} onCancel={() => setDialog(null)} isLoading={isSaving} />
        </Modal>
      )}

      {dialog?.mode === 'edit' && (
        <Modal title={`Edit ${dialog.rate.fromCurrency}/${dialog.rate.toCurrency} Rate`} onClose={() => setDialog(null)} wide>
          <ExchangeRateForm
            initialValue={dialog.rate}
            onSubmit={handleEdit}
            onCancel={() => setDialog(null)}
            isLoading={isSaving}
          />
        </Modal>
      )}
    </div>
  );
}
