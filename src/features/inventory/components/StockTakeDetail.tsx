import type { Account, Product, StockTake, Warehouse } from '@/types';
import { SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { RecordLink } from '@/components/app/record-link';
import { formatCurrency, formatDate } from '@/lib/app/format';
import type { AccountingEffectPreview } from '../types/accountingPreview';
import type { StockTakeCountInput } from '../services/stockTakeService';
import { AccountingPreview } from './AccountingPreview';
import { StockTakeLinesView } from './StockTakeLinesView';

const SCOPE_LABEL = { all: 'All products', category: 'One category', items: 'Hand-picked products' } as const;

export interface StockTakeDetailProps {
  stockTake: StockTake;
  products: Product[];
  warehouses: Warehouse[];
  accounts: Account[];
  preview: AccountingEffectPreview | null;
  previewLoading: boolean;
  previewError?: string;
  onSaveCounts?: (counts: StockTakeCountInput[]) => Promise<void>;
  onOpenJournal: (journalEntryId: string) => void;
}

export function StockTakeDetail({
  stockTake,
  products,
  warehouses,
  accounts,
  preview,
  previewLoading,
  previewError,
  onSaveCounts,
  onOpenJournal,
}: StockTakeDetailProps) {
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;
  const resolveAccountLabel = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    return account ? `${account.code} — ${account.name}` : accountId;
  };

  return (
    <>
      <SectionCard title={warehouseName(stockTake.warehouseId)} description={SCOPE_LABEL[stockTake.scope]}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <FigureBlock label="Count date" value={formatDate(stockTake.countDate)} />
          {stockTake.frozenAt && <FigureBlock label="Frozen" value={formatDate(stockTake.frozenAt)} />}
          <FigureBlock
            label="Net variance value"
            value={formatCurrency(stockTake.totalVarianceValue)}
            tone={stockTake.totalVarianceValue < 0 ? 'negative' : stockTake.totalVarianceValue > 0 ? 'positive' : 'default'}
          />
        </div>
        {stockTake.notes && <p className="mt-4 text-sm text-muted-foreground">{stockTake.notes}</p>}
        {stockTake.journalEntryId && (
          <p className="mt-4 text-xs">
            <RecordLink onClick={() => onOpenJournal(stockTake.journalEntryId!)}>View journal entry</RecordLink>
          </p>
        )}
      </SectionCard>

      <SectionCard title="Count sheet">
        <StockTakeLinesView lines={stockTake.lineItems} products={products} warehouses={warehouses} onSaveCounts={onSaveCounts} />
      </SectionCard>

      {(stockTake.status === 'ready_for_review' || stockTake.status === 'posted') && (
        <SectionCard title="Accounting effect" description="The net-variance journal entry posting will create — recomputed live, never re-typed.">
          <AccountingPreview preview={preview} loading={previewLoading} error={previewError} resolveAccountLabel={resolveAccountLabel} />
        </SectionCard>
      )}
    </>
  );
}
