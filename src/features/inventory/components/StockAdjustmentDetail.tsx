import type { Account, Product, StockAdjustment, StockAdjustmentReason, Warehouse } from '@/types';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { formatCurrency, formatDate } from '@/lib/app/format';
import type { AccountingEffectPreview } from '../types/accountingPreview';
import { AccountingPreview } from './AccountingPreview';

const REASON_LABEL: Record<StockAdjustmentReason, string> = {
  write_off: 'Write-off',
  shrinkage: 'Shrinkage',
  damage: 'Damage',
  stock_gain: 'Stock gain',
  correction: 'Correction',
  other: 'Other adjustment',
};

export interface StockAdjustmentDetailProps {
  adjustment: StockAdjustment;
  products: Product[];
  warehouses: Warehouse[];
  accounts: Account[];
  preview: AccountingEffectPreview | null;
  previewLoading: boolean;
  previewError?: string;
  onOpenJournal: (journalEntryId: string) => void;
}

export function StockAdjustmentDetail({
  adjustment,
  products,
  warehouses,
  accounts,
  preview,
  previewLoading,
  previewError,
  onOpenJournal,
}: StockAdjustmentDetailProps) {
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;
  const resolveAccountLabel = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    return account ? `${account.code} — ${account.name}` : accountId;
  };

  return (
    <>
      <SectionCard title={REASON_LABEL[adjustment.reason]} description={warehouseName(adjustment.warehouseId)}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <FigureBlock label="Adjustment date" value={formatDate(adjustment.adjustmentDate)} />
          <FigureBlock
            label="Net cost effect"
            value={formatCurrency(adjustment.totalCostEffect)}
            tone={adjustment.totalCostEffect < 0 ? 'negative' : adjustment.totalCostEffect > 0 ? 'positive' : 'default'}
          />
          <FigureBlock label="Lines" value={String(adjustment.lineItems.length)} />
        </div>
        {adjustment.notes && <p className="mt-4 text-sm text-muted-foreground">{adjustment.notes}</p>}
        {adjustment.journalEntryId && (
          <p className="mt-4 text-xs">
            <RecordLink onClick={() => onOpenJournal(adjustment.journalEntryId!)}>View journal entry</RecordLink>
          </p>
        )}
      </SectionCard>

      <SectionCard title="Lines" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Product</th>
                <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Warehouse</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Qty</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Unit cost</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Cost effect</th>
              </tr>
            </thead>
            <tbody>
              {adjustment.lineItems.map((line) => (
                <tr key={line.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{productName(line.productId)}</td>
                  <td className="px-4 py-2">{warehouseName(line.warehouseId)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{line.quantityDelta}</td>
                  <td className="px-4 py-2 text-right">
                    <Amount value={line.unitCost} plain />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Amount value={line.costEffect} plain />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Accounting effect" description="The journal entry posting will create — recomputed live from the same lines, never re-typed.">
        <AccountingPreview preview={preview} loading={previewLoading} error={previewError} resolveAccountLabel={resolveAccountLabel} />
      </SectionCard>
    </>
  );
}
