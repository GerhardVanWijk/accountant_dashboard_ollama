import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/app/page-header';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Button } from '@/components/ui/shadcn/button';
import { useTaxRegister } from '../hooks/useTaxRegister';
import { TaxRegisterTable } from '../components/TaxRegisterTable';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Tax Register — route `/assets/tax-register`. Real
 * useTaxRegister()/taxRegisterService data — accounting carrying value vs.
 * SARS wear-and-tear tax written-down value, per asset, as of a chosen
 * date. No literal v0 template exists for this report — re-skinned onto
 * v0's general PageHeader/SectionCard language (M8); no tax math here.
 */
export function TaxRegisterPage() {
  const [asOfDate, setAsOfDate] = useState(today());
  const { rows, loading, error, refetch } = useTaxRegister(asOfDate);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tax register"
        description="Accounting carrying value vs. SARS wear-and-tear tax written-down value, per asset."
        actions={
          <Field className="w-40">
            <FieldLabel htmlFor="asOfDate" className="sr-only">
              As of date
            </FieldLabel>
            <Input id="asOfDate" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </Field>
        }
      />

      <p role="note" className="rounded-lg border border-status-warning-outline bg-status-warning-surface px-4 py-3 text-sm text-status-warning">
        Wear-and-tear rates are typical/indicative values, not independently verified against SARS Binding General
        Practice Note 7 for any specific asset — confirm with a tax practitioner before relying on the tax
        written-down values below. This register does not compute deferred tax (SA_ACCOUNTING_MASTER_SPEC.md §116
        Phase 12).
      </p>

      {loading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Computing the tax register…</p>
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && <TaxRegisterTable rows={rows} />}
    </div>
  );
}
