import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import type { Account, TaxRate } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { EnumSelect, SearchableSelect } from '@/components/app/combobox';
import { Amount } from '@/components/app/figure';
import { formatAmount } from '@/lib/app/format';
import { cn } from '@/lib/utils';
import type { AllocationInput } from '../services';
import { computeAllocationTax, round2 } from '../utils/taxCalculations';

export interface AllocationRowsProps {
  allocations: AllocationInput[];
  onChange: (allocations: AllocationInput[]) => void;
  glAccounts: Account[];
  taxRates: TaxRate[];
  /** The transaction's gross amount — drives the reconciliation summary. */
  grossAmount: number;
}

function emptyRow(): AllocationInput {
  return { glAccountId: '', description: '', netAmount: 0, taxRateId: undefined };
}

/** GL account · Description · Net · VAT rate · VAT · remove — proportioned by importance, not equal width. */
const GRID = 'sm:grid sm:grid-cols-[minmax(170px,1.7fr)_minmax(130px,1.2fr)_110px_120px_76px_32px] sm:items-start sm:gap-2';

/**
 * Split-allocation editor — same `computeAllocationTax()` / validation as
 * before, JSX re-skinned onto the Vertex Form System. One line per GL
 * account this transaction posts against, each with its own VAT rate.
 *
 * Desktop is a proportioned table; below `sm` each line collapses to a
 * stacked card so six columns never get crushed. The reconciliation summary
 * reads straight off the same running total the real
 * `BankTransactionService` re-checks on submit (UI validation is not enough).
 */
export function AllocationRows({ allocations, onChange, glAccounts, taxRates, grossAmount }: AllocationRowsProps) {
  function updateRow(index: number, patch: Partial<AllocationInput>) {
    onChange(allocations.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    onChange(allocations.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...allocations, emptyRow()]);
  }

  const total = round2(
    allocations.reduce((sum, row) => {
      const taxRate = taxRates.find((r) => r.id === row.taxRateId);
      return sum + (row.netAmount || 0) + computeAllocationTax(row.netAmount || 0, taxRate);
    }, 0),
  );
  const remaining = round2(grossAmount - total);
  const isBalanced = Math.abs(remaining) < 0.01;

  const accountOptions = glAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}`, keywords: a.code }));
  const vatOptions = [{ value: '', label: 'No VAT' }, ...taxRates.map((rate) => ({ value: rate.id, label: rate.name }))];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold text-foreground">Allocation</h3>
          <p className="text-xs text-muted-foreground">
            Allocate the transaction amount to one or more ledger accounts.
          </p>
        </div>
        <Button variant="outline" size="sm" type="button" onClick={addRow}>
          <Plus data-icon="inline-start" />
          Add allocation
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {/* Desktop column headings only — the mobile cards carry their own inline labels. */}
        <div className={cn('hidden px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase', GRID)}>
          <span>GL account</span>
          <span>Description</span>
          <span className="text-right">Net amount</span>
          <span>VAT rate</span>
          <span className="text-right">VAT</span>
          <span />
        </div>

        {allocations.map((row, index) => {
          const taxRate = taxRates.find((r) => r.id === row.taxRateId);
          const taxAmount = computeAllocationTax(row.netAmount || 0, taxRate);
          return (
            <div
              key={index}
              className={cn(
                'grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-border p-3 tabular-nums sm:rounded-none sm:border-0 sm:p-0',
                GRID,
              )}
            >
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <span className="text-xs text-muted-foreground sm:hidden">GL account</span>
                <SearchableSelect
                  aria-label={`Allocation ${index + 1} GL account`}
                  value={row.glAccountId || null}
                  onChange={(value) => updateRow(index, { glAccountId: value ?? '' })}
                  placeholder="Select account…"
                  options={accountOptions}
                />
              </div>

              <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <span className="text-xs text-muted-foreground sm:hidden">Description</span>
                <Input
                  aria-label={`Allocation ${index + 1} description`}
                  placeholder="Line description"
                  value={row.description ?? ''}
                  onChange={(e) => updateRow(index, { description: e.target.value })}
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground sm:hidden">Net amount</span>
                <Input
                  aria-label={`Allocation ${index + 1} net amount`}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  className="figure text-right tabular-nums"
                  placeholder="0,00"
                  value={row.netAmount || ''}
                  onChange={(e) => updateRow(index, { netAmount: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground sm:hidden">VAT rate</span>
                <EnumSelect
                  aria-label={`Allocation ${index + 1} VAT rate`}
                  value={row.taxRateId ?? ''}
                  onValueChange={(value) => updateRow(index, { taxRateId: value || undefined })}
                  placeholder="No VAT"
                  options={vatOptions}
                />
              </div>

              <div className="col-span-2 flex items-center justify-between sm:col-span-1 sm:block sm:pt-2 sm:text-right">
                <span className="text-xs text-muted-foreground sm:hidden">VAT</span>
                <span className="figure text-sm tabular-nums text-muted-foreground">
                  <Amount value={taxAmount} plain />
                </span>
              </div>

              <div className="col-span-2 flex justify-end sm:col-span-1 sm:pt-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => removeRow(index)}
                  aria-label={`Remove allocation line ${index + 1}`}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          );
        })}

        {allocations.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No allocation lines yet — add at least one GL account to post this transaction.
          </div>
        )}
      </div>

      {/* Reconciliation summary — reads off the running total above. */}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Transaction amount</span>
          <span className="figure tabular-nums">
            <Amount value={grossAmount} plain />
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Allocated</span>
          <span className="figure tabular-nums">
            <Amount value={total} plain />
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-medium">
          <span>Remaining</span>
          <span
            className={cn(
              'figure tabular-nums',
              isBalanced ? 'text-status-positive' : remaining > 0 ? 'text-status-warning' : 'text-status-negative',
            )}
          >
            <Amount value={remaining} plain />
          </span>
        </div>
        <div>
          {isBalanced ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-status-positive-muted px-2 py-1 text-xs font-medium text-status-positive">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Balanced
            </span>
          ) : remaining > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-status-warning-muted px-2 py-1 text-xs font-medium text-status-warning">
              {`R ${formatAmount(Math.abs(remaining))} still needs allocation`}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-status-negative-muted px-2 py-1 text-xs font-medium text-status-negative">
              {`R ${formatAmount(Math.abs(remaining))} over-allocated`}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
