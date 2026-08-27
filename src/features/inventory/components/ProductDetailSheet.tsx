import { useMemo } from 'react';
import type { Product, StockMovement, TaxRate, Warehouse } from '@/types';
import { RecordDetailSheet } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { StatusBadge } from '@/components/app/status-badge';
import { ProductDetail } from './ProductDetail';

export interface ProductDetailSheetProps {
  product: Product | undefined;
  movements: StockMovement[];
  warehousesById: Map<string, Warehouse>;
  taxRates: TaxRate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * No "related records" section here: a Product has no FK to a journal
 * entry, invoice, or bill (its stock movement ledger is content, not a
 * relationship — see ProductDetail) — nothing to show would just be an
 * always-empty RelatedRecordsSection, which correctly renders null anyway.
 */
export function ProductDetailSheet({ product, movements, warehousesById, taxRates, open, onOpenChange }: ProductDetailSheetProps) {
  const productMovements = useMemo(
    () => (product ? movements.filter((m) => m.productId === product.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []),
    [product, movements],
  );

  const state = product ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={product?.sku ?? 'Product'}
      titleAdornment={product ? <StatusBadge status={product.status} /> : undefined}
      state={state}
      notFoundMessage="This product could not be found — it may have been deleted."
      className="sm:max-w-xl"
    >
      {product && (
        <div className="flex flex-col gap-6">
          <ProductDetail product={product} movements={productMovements} warehousesById={warehousesById} taxRates={taxRates} />
          <RecordAuditHistorySection recordType="Product" recordId={product.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
