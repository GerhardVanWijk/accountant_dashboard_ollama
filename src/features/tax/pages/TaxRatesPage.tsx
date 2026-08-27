import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import type { TaxRate } from '@/types';
import { useTaxRateManagement } from '../hooks/useTaxRateManagement';
import { TaxRateTable } from '../components/TaxRateTable';
import { TaxRateForm } from '../components/TaxRateForm';
import { SupersedeTaxRateForm } from '../components/SupersedeTaxRateForm';

type DialogState = { mode: 'create' } | { mode: 'supersede'; rate: TaxRate } | null;

/**
 * Tax Rates settings — create/version/deactivate VAT tax codes. Route
 * `/tax/rates` (docs/ROUTES.md). Every rate is effective-dated; changing
 * one creates a new version instead of editing the existing rate — see
 * TaxRateService.supersede()'s doc comment. Re-skinned onto v0's
 * PageHeader/SectionCard/Dialog (M7); data/mutation wiring unchanged.
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tax Rates"
        description="VAT tax codes used across Sales, Purchases, and Banking. Every rate is effective-dated — changing one creates a new version rather than editing history."
        actions={
          <Button onClick={() => setDialog({ mode: 'create' })}>
            <Plus />
            New Tax Code
          </Button>
        }
      />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {loading && (
        <div role="status" className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <span className="text-sm">Loading tax rates…</span>
        </div>
      )}
      {!loading && error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      {!loading && !error && (
        <TaxRateTable taxRates={taxRates} onSupersede={(rate) => setDialog({ mode: 'supersede', rate })} onDeactivate={(rate) => void handleDeactivate(rate)} />
      )}

      <Dialog open={dialog?.mode === 'create'} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Tax Code</DialogTitle>
          </DialogHeader>
          <TaxRateForm onSubmit={handleCreate} onCancel={() => setDialog(null)} isLoading={isSaving} />
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.mode === 'supersede'} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Supersede {dialog?.mode === 'supersede' ? dialog.rate.code : ''}</DialogTitle>
          </DialogHeader>
          {dialog?.mode === 'supersede' && (
            <SupersedeTaxRateForm currentVersion={dialog.rate} onSubmit={handleSupersede} onCancel={() => setDialog(null)} isLoading={isSaving} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
