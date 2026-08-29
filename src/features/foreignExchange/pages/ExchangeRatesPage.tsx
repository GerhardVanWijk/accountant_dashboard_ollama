import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { FormShell, FormHeader } from '@/components/app/form';
import type { ExchangeRate } from '@/types/foreignExchange';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { ExchangeRateTable } from '../components/ExchangeRateTable';
import { ExchangeRateForm } from '../components/ExchangeRateForm';

type DialogState = { mode: 'create' } | { mode: 'edit'; rate: ExchangeRate } | null;

/**
 * Exchange Rates register — route `/foreign-exchange/rates`. Real
 * useExchangeRates()/exchangeRateService data throughout — every rate is
 * ALWAYS manually entered, there is no live FX feed wired into this
 * codebase. No `fx` entry exists in the real permission catalog (M11), so
 * this route/its actions stay ungated, same as before. Re-skinned onto
 * v0's PageHeader/SectionCard/Dialog (M13).
 */
export function ExchangeRatesPage() {
  const { rates, loading, error, createRate, updateRate, deleteRate } = useExchangeRates();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dirty, setDirty] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const closeDialog = () => {
    setDialog(null);
    setDirty(false);
  };

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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Exchange rates"
        description="Point-in-time FX rates by currency pair. Every rate is ALWAYS manually entered — no live FX feed is wired into this codebase. Prefer recording a new rate over editing an existing one for a date that already has a rate."
        actions={
          <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
            <Plus data-icon="inline-start" />
            New rate
          </Button>
        }
      />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {loading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading exchange rates…</p>
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error.message}
        </div>
      )}
      {!loading && !error && (
        <SectionCard>
          <ExchangeRateTable rates={rates} onEdit={(rate) => setDialog({ mode: 'edit', rate })} onDelete={(rate) => void handleDelete(rate)} />
        </SectionCard>
      )}

      {dialog !== null && (
        <FormShell
          open
          onClose={closeDialog}
          size="md"
          mode={dialog.mode === 'edit' ? 'edit' : 'create'}
          isDirty={dirty}
          pending={isSaving}
        >
          <FormHeader
            title={dialog.mode === 'edit' ? `Edit ${dialog.rate.fromCurrency}/${dialog.rate.toCurrency} rate` : 'New exchange rate'}
          />
          {dialog.mode === 'create' && (
            <ExchangeRateForm onSubmit={handleCreate} onCancel={closeDialog} isLoading={isSaving} onDirtyChange={setDirty} />
          )}
          {dialog.mode === 'edit' && (
            <ExchangeRateForm initialValue={dialog.rate} onSubmit={handleEdit} onCancel={closeDialog} isLoading={isSaving} onDirtyChange={setDirty} />
          )}
        </FormShell>
      )}
    </div>
  );
}
