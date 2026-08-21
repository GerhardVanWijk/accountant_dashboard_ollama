import type { Account, TaxRate } from '@/types';
import { Icon } from '@/components/ui/Icon';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import type { AllocationInput } from '../services';
import { computeAllocationTax } from '../utils/taxCalculations';
import { formatZAR } from '../utils/formatZAR';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

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
 * Split-allocation editor: one line per GL account this transaction posts
 * against, each with its own VAT rate (Standard 15%/Zero-Rated/Exempt/
 * Non-Deductible via the shared TaxRate model). Shows a running total vs.
 * the transaction's gross amount so the user can see, before saving,
 * whether the split will balance — the real check still happens in
 * BankTransactionService (docs/DO_NOT_BREAK.md: UI-only validation is not
 * enough).
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
    <div className="flex flex-col gap-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary">Split Allocation</span>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-xs rounded-md border border-border px-sm py-xs text-xs font-medium text-text-primary hover:border-primary hover:text-primary"
        >
          <Icon name="add" size={14} />
          Add line
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[1.4fr_1.2fr_110px_1fr_100px_32px] gap-2 border-b border-border bg-background px-3 py-2 text-xs font-semibold text-text-secondary">
            <span>GL Account</span>
            <span>Description</span>
            <span className="text-right">Net Amount</span>
            <span>VAT Rate</span>
            <span className="text-right">VAT</span>
            <span />
          </div>
          {allocations.map((row, index) => {
            const taxRate = taxRates.find((r) => r.id === row.taxRateId);
            const taxAmount = computeAllocationTax(row.netAmount || 0, taxRate);
            return (
              <div
                key={index}
                className="grid grid-cols-[1.4fr_1.2fr_110px_1fr_100px_32px] gap-2 border-b border-border/50 px-3 py-2 tabular-nums"
              >
                <select
                  aria-label={`Allocation ${index + 1} GL account`}
                  className={inputClass}
                  value={row.glAccountId}
                  onChange={(e) => updateRow(index, { glAccountId: e.target.value })}
                >
                  <option value="">Select account…</option>
                  {glAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Allocation ${index + 1} description`}
                  className={inputClass}
                  placeholder="Line description"
                  value={row.description ?? ''}
                  onChange={(e) => updateRow(index, { description: e.target.value })}
                />
                <input
                  aria-label={`Allocation ${index + 1} net amount`}
                  type="number"
                  step="0.01"
                  className={`${inputClass} text-right`}
                  value={row.netAmount || ''}
                  onChange={(e) => updateRow(index, { netAmount: parseFloat(e.target.value) || 0 })}
                />
                <select
                  aria-label={`Allocation ${index + 1} VAT rate`}
                  className={inputClass}
                  value={row.taxRateId ?? ''}
                  onChange={(e) => updateRow(index, { taxRateId: e.target.value || undefined })}
                >
                  <option value="">No VAT</option>
                  {taxRates.map((rate) => (
                    <option key={rate.id} value={rate.id}>
                      {rate.name}
                    </option>
                  ))}
                </select>
                <span className="text-right text-text-secondary">{formatZAR(taxAmount)}</span>
                <button
                  type="button"
                  aria-label={`Remove allocation line ${index + 1}`}
                  onClick={() => removeRow(index)}
                  className="flex items-center justify-center rounded-md text-text-muted hover:text-danger"
                >
                  <Icon name="delete" size={14} />
                </button>
              </div>
            );
          })}
          {allocations.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-text-muted">
              No allocation lines yet — add at least one GL account to post this transaction.
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border bg-background px-sm py-xs text-sm">
        <span className="text-text-secondary">Allocated total vs. transaction amount</span>
        <span className={`font-semibold ${isBalanced ? 'text-positive' : 'text-negative'}`}>
          <FinancialNumber value={total} format={formatZAR} showFlash={false} className="mr-2" />
          {isBalanced ? '— balanced' : `— ${remaining > 0 ? 'short by' : 'over by'} ${formatZAR(Math.abs(remaining))}`}
        </span>
      </div>
    </div>
  );
}
