import type { Account, Product, StockTransfer, Warehouse } from '@/types';
import { SectionCard } from '@/components/app/page-header';
import { Amount, FigureBlock } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { formatDate } from '@/lib/app/format';
import type { AccountingEffectPreview } from '../types/accountingPreview';
import { AccountingPreview } from './AccountingPreview';

export interface StockTransferDetailProps {
  transfer: StockTransfer;
  products: Product[];
  warehouses: Warehouse[];
  accounts: Account[];
  preview: AccountingEffectPreview | null;
  previewLoading: boolean;
  previewError?: string;
  previewLabel: string;
  onOpenJournal: (journalEntryId: string) => void;
}

export function StockTransferDetail({
  transfer,
  products,
  warehouses,
  accounts,
  preview,
  previewLoading,
  previewError,
  previewLabel,
  onOpenJournal,
}: StockTransferDetailProps) {
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;
  const resolveAccountLabel = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    return account ? `${account.code} — ${account.name}` : accountId;
  };

  return (
    <>
      <SectionCard title={`${warehouseName(transfer.fromWarehouseId)} → ${warehouseName(transfer.toWarehouseId)}`}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <FigureBlock label="Transfer date" value={formatDate(transfer.transferDate)} />
          {transfer.expectedReceiptDate && <FigureBlock label="Expected receipt" value={formatDate(transfer.expectedReceiptDate)} />}
          {transfer.receivedDate && <FigureBlock label="Received" value={formatDate(transfer.receivedDate)} />}
          <FigureBlock label="Lines" value={String(transfer.lineItems.length)} />
        </div>
        {transfer.notes && <p className="mt-4 text-sm text-muted-foreground">{transfer.notes}</p>}
        <div className="mt-4 flex flex-col gap-1 text-xs">
          {transfer.dispatchedJournalEntryId && (
            <RecordLink onClick={() => onOpenJournal(transfer.dispatchedJournalEntryId!)}>View dispatch journal entry</RecordLink>
          )}
          {transfer.receivedJournalEntryId && (
            <RecordLink onClick={() => onOpenJournal(transfer.receivedJournalEntryId!)}>View receipt journal entry</RecordLink>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Lines" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Product</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Qty</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Unit cost</th>
                <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Total cost</th>
              </tr>
            </thead>
            <tbody>
              {transfer.lineItems.map((line) => (
                <tr key={line.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{productName(line.productId)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{line.quantity}</td>
                  <td className="px-4 py-2 text-right">
                    <Amount value={line.unitCost} plain />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Amount value={line.totalCost} plain />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Accounting effect" description={previewLabel}>
        <AccountingPreview preview={preview} loading={previewLoading} error={previewError} resolveAccountLabel={resolveAccountLabel} />
      </SectionCard>
    </>
  );
}
