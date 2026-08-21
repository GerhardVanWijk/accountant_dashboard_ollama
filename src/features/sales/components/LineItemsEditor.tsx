import type { DocumentLineItem, TaxRate } from '@/types';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export interface LineItemsEditorProps {
  lineItems: DocumentLineItem[];
  onChange: (lineItems: DocumentLineItem[]) => void;
  /** Currently-effective tax rates (via useTaxRates()) — never hardcoded, per docs/DO_NOT_BREAK.md. */
  taxRates: TaxRate[];
  disabled?: boolean;
}

function computeLine(
  quantity: number,
  unitPrice: number,
  taxRateId: string | undefined,
  taxRates: TaxRate[],
): { lineTotal: number; taxAmount: number } {
  const lineTotal = quantity * unitPrice;
  const rate = taxRates.find((r) => r.id === taxRateId);
  const taxAmount = rate ? lineTotal * (rate.rate / 100) : 0;
  return { lineTotal, taxAmount };
}

/**
 * Reusable line-item editor shared by the Quote, Sales Order, and Credit
 * Note forms — quantity/unit price/tax rate drive an auto-calculated tax
 * amount and line total, both rendered via FinancialNumber per
 * docs/FINANCIAL_UI_GUIDE.md. Tax rates are the real, currently-effective
 * `TaxRate` records (src/features/tax/services/taxRateService.ts, via
 * useTaxRates()) — passed in as a prop, never imported locally, so this
 * component stays agnostic to where they came from.
 */
export function LineItemsEditor({ lineItems, onChange, taxRates, disabled = false }: LineItemsEditorProps) {
  function updateLine(index: number, patch: Partial<DocumentLineItem>) {
    const merged = { ...lineItems[index], ...patch };
    const { lineTotal, taxAmount } = computeLine(merged.quantity, merged.unitPrice, merged.taxRateId, taxRates);
    const next = [...lineItems];
    next[index] = { ...merged, lineTotal, taxAmount };
    onChange(next);
  }

  function addLine() {
    onChange([
      ...lineItems,
      {
        id: `li_${Date.now()}_${lineItems.length}`,
        description: '',
        quantity: 1,
        unitPrice: 0,
        taxRateId: taxRates[0]?.id,
        taxAmount: 0,
        lineTotal: 0,
      },
    ]);
  }

  function removeLine(index: number) {
    onChange(lineItems.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">Line Items</span>
        <Button variant="ghost" type="button" onClick={addLine} disabled={disabled}>
          <Icon name="add" size={14} />
          Add Line
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <div className="grid min-w-[640px] grid-cols-[2fr_80px_100px_140px_100px_100px_36px] gap-2 bg-primary/10 px-sm py-xs text-xs font-semibold tabular-nums">
          <div>Description</div>
          <div className="text-right">Qty</div>
          <div className="text-right">Unit Price</div>
          <div>Tax Rate</div>
          <div className="text-right">Tax</div>
          <div className="text-right">Line Total</div>
          <div />
        </div>
        {lineItems.map((item, index) => (
          <div
            key={item.id}
            className="grid min-w-[640px] grid-cols-[2fr_80px_100px_140px_100px_100px_36px] items-center gap-2 border-t border-border/50 px-sm py-xs tabular-nums"
          >
            <input
              className={inputClass}
              value={item.description}
              placeholder="Description"
              disabled={disabled}
              onChange={(e) => updateLine(index, { description: e.target.value })}
            />
            <input
              type="number"
              min="0"
              step="1"
              className={`${inputClass} text-right`}
              value={item.quantity || ''}
              disabled={disabled}
              onChange={(e) => updateLine(index, { quantity: parseFloat(e.target.value) || 0 })}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              className={`${inputClass} text-right`}
              value={item.unitPrice || ''}
              disabled={disabled}
              onChange={(e) => updateLine(index, { unitPrice: parseFloat(e.target.value) || 0 })}
            />
            <select
              className={inputClass}
              value={item.taxRateId ?? ''}
              disabled={disabled}
              onChange={(e) => updateLine(index, { taxRateId: e.target.value || undefined })}
            >
              <option value="">No Tax</option>
              {taxRates.map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.name}
                </option>
              ))}
            </select>
            <div className="text-right text-sm text-text-secondary">
              <FinancialNumber value={item.taxAmount} format={formatCurrency} showFlash={false} />
            </div>
            <div className="text-right text-sm font-semibold">
              <FinancialNumber value={item.lineTotal} format={formatCurrency} showFlash={false} />
            </div>
            <button
              type="button"
              onClick={() => removeLine(index)}
              disabled={disabled}
              aria-label="Remove line"
              className="text-text-muted hover:text-danger disabled:opacity-50"
            >
              <Icon name="delete" size={14} />
            </button>
          </div>
        ))}
        {lineItems.length === 0 && (
          <div className="px-sm py-md text-center text-sm text-text-muted">
            No line items — click &ldquo;Add Line&rdquo; to start.
          </div>
        )}
      </div>
    </div>
  );
}
