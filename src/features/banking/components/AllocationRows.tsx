import { Plus, Trash2 } from 'lucide-react';
import type { Account, TaxRate } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { EnumSelect, SearchableSelect } from '@/components/app/combobox';
import { Amount } from '@/components/app/figure';
import type { AllocationInput } from '../services';
import { computeAllocationTax } from '../utils/taxCalculations';

export interface AllocationRowsProps {
  allocations: AllocationInput[];
  onChange: (allocations: AllocationInput[]) => void;
  glAccounts: Account[];
  taxRates: TaxRate[];
  /** The transaction's gross amount — used to show the running-total match indicator. */
  grossAmount: number;
}

function emptyRow(): AllocationInput {
  return { glAccountId: '', description: '', netAmount: 0, taxRateId: undefined };
}

/**
 * Split-allocation editor — same computeAllocationTax()/validation as
 * before the port, JSX re-skinned. One line per GL account this
 * transaction posts against, each with its own VAT rate. Shows a running
 * total vs. the transaction's gross amount so the user can see, before
 * saving, whether the split will balance — the real check still happens
 * in BankTransactionService (UI-only validation is not enough).
 */
export function AllocationRows({ allocations, onChange, glAccounts, taxRates, grossAmount }: AllocationRowsProps) {
  function updateRow(index: number, patch: Partial<AllocationInput>) {
    const next = allocations.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  }

  function removeRow(index: number) {
    onChange(allocations.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...allocations, emptyRow()]);
  }

  const total = allocations.reduce((sum, row) => {
    const taxRate = taxRates.find((r) => r.id === row.taxRateId);
    return sum + (row.netAmount || 0) + computeAllocationTax(row.netAmount || 0, taxRate);
  }, 0);
  const remaining = Math.round((grossAmount - total) * 100) / 100;
  const isBalanced = Math.abs(remaining) < 0.01;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Split allocation</span>
        <Button variant="outline" size="sm" type="button" onClick={addRow}>
          <Plus data-icon="inline-start" />
          Add line
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[1.4fr_1.2fr_110px_1fr_100px_32px] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
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
              <div key={index} className="grid grid-cols-[1.4fr_1.2fr_110px_1fr_100px_32px] gap-2 border-b border-border/50 px-3 py-2 tabular-nums">
                <SearchableSelect
                  aria-label={`Allocation ${index + 1} GL account`}
                  value={row.glAccountId || null}
                  onChange={(value) => updateRow(index, { glAccountId: value ?? '' })}
                  placeholder="Select account…"
                  options={glAccounts.map((a) => ({
                    value: a.id,
                    label: `${a.code} — ${a.name}`,
                    keywords: a.code,
                  }))}
                />
                <Input
                  aria-label={`Allocation ${index + 1} description`}
                  placeholder="Line description"
                  value={row.description ?? ''}
                  onChange={(e) => updateRow(index, { description: e.target.value })}
                />
                <Input
                  aria-label={`Allocation ${index + 1} net amount`}
                  type="number"
                  step="0.01"
                  className="text-right"
                  value={row.netAmount || ''}
                  onChange={(e) => updateRow(index, { netAmount: parseFloat(e.target.value) || 0 })}
                />
                <EnumSelect
                  aria-label={`Allocation ${index + 1} VAT rate`}
                  value={row.taxRateId ?? ''}
                  onValueChange={(value) => updateRow(index, { taxRateId: value || undefined })}
                  placeholder="No VAT"
                  options={[
                    { value: '', label: 'No VAT' },
                    ...taxRates.map((rate) => ({ value: rate.id, label: rate.name })),
                  ]}
                />
                <span className="text-right text-sm text-muted-foreground">
                  <Amount value={taxAmount} plain />
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  className="justify-self-end text-muted-foreground hover:text-destructive"
                  onClick={() => removeRow(index)}
                  aria-label={`Remove allocation line ${index + 1}`}
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
          {allocations.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              No allocation lines yet — add at least one GL account to post this transaction.
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Allocated total vs. transaction amount</span>
        <span className={isBalanced ? 'font-semibold text-status-positive' : 'font-semibold text-status-negative'}>
          <Amount value={total} plain className="mr-2" />
          {isBalanced ? '— balanced' : `— ${remaining > 0 ? 'short by' : 'over by'} ${Math.abs(remaining).toFixed(2)}`}
        </span>
      </div>
    </div>
  );
}
