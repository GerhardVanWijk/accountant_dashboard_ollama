import type { Account, Product, Supplier, SupplierReturn, Warehouse } from '@/types';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { formatCurrency, formatDate } from '@/lib/app/format';
import type { AccountingEffectPreview } from '../types/accountingPreview';
import { AccountingPreview } from './AccountingPreview';

export interface SupplierReturnDetailProps {
  supplierReturn: SupplierReturn;
  products: Product[];
  warehouses: Warehouse[];
  suppliers: Supplier[];
  accounts: Account[];
  preview: AccountingEffectPreview | null;
  previewLoading: boolean;
  previewError?: string;
  onOpenJournal: (journalEntryId: string) => void;
}

export function SupplierReturnDetail({
  supplierReturn,
  products,
  warehouses,
  suppliers,
  accounts,
  preview,
  previewLoading,
  previewError,
  onOpenJournal,
}: SupplierReturnDetailProps) {
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const warehouseName = (id?: string) => (id ? (warehouses.find((w) => w.id === id)?.name ?? id) : '—');
  const supplierName = suppliers.find((s) => s.id === supplierReturn.supplierId)?.name ?? supplierReturn.supplierId;
  const resolveAccountLabel = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    return account ? `${account.code} — ${account.name}` : accountId;
  };

  return (
    <>
      <SectionCard title={supplierName} description={supplierReturn.reason}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <FigureBlock label="Return date" value={formatDate(supplierReturn.returnDate)} />
          <FigureBlock label="Subtotal" value={formatCurrency(supplierReturn.subtotal)} />
          <FigureBlock label="Tax" value={formatCurrency(supplierReturn.taxTotal)} />
          <FigureBlock label="Total credit" value={formatCurrency(supplierReturn.total)} />
        </div>
        {supplierReturn.notes && <p className="mt-4 text-sm text-muted-foreground">{supplierReturn.notes}</p>}
        {supplierReturn.journalEntryId && (
          <p className="mt-4 text-xs">
            <RecordLink onClick={() => onOpenJournal(supplierReturn.journalEntryId!)}>View journal entry</RecordLink>
          </p>
        )}
      </SectionCard>

      <SectionCard title="Lines" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Product</th>
                <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Warehouse</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Qty</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Unit price</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Line total</th>
              </tr>
            </thead>
            <tbody>
              {supplierReturn.lineItems.map((line) => (
                <tr key={line.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{productName(line.productId)}</td>
                  <td className="px-4 py-2">{warehouseName(line.warehouseId)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{line.quantity}</td>
                  <td className="px-4 py-2 text-right">
                    <Amount value={line.unitPrice} plain />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Amount value={line.lineTotal} plain />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Accounting effect" description="Stock leaves at carrying value (WAC); the supplier settles at the actual credit note value — the gap posts to Purchase Price Variance, shown even at R0.00.">
        <AccountingPreview preview={preview} loading={previewLoading} error={previewError} resolveAccountLabel={resolveAccountLabel} />
      </SectionCard>
    </>
  );
}
