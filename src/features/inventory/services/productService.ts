import type { Product } from '@/types';
import type { IProductRepository } from '../repositories/IProductRepository';
import type { IStockMovementRepository } from '../repositories/IStockMovementRepository';
import type { ISupplierReturnRepository } from '../repositories/ISupplierReturnRepository';
import type { IOpeningStockBatchRepository } from '../repositories/IOpeningStockBatchRepository';
import type { IInvoiceRepository } from '@/repositories/IInvoiceRepository';
import type { IBillRepository } from '@/repositories/IBillRepository';
import type { IPurchaseOrderRepository } from '@/repositories/IPurchaseOrderRepository';
import type { ICreditNoteRepository } from '@/repositories/ICreditNoteRepository';
import {
  productRepository,
  stockMovementRepository,
  supplierReturnRepository,
  openingStockBatchRepository,
} from '../repositories/instances';
import { SupabaseInvoiceRepository } from '@/repositories/SupabaseInvoiceRepository';
import { SupabaseBillRepository } from '@/repositories/SupabaseBillRepository';
import { SupabasePurchaseOrderRepository } from '@/repositories/SupabasePurchaseOrderRepository';
import { SupabaseCreditNoteRepository } from '@/repositories/SupabaseCreditNoteRepository';
import { supabase } from '@/config/supabase';

/**
 * quantityOnHand is intentionally excluded — it must never be set directly
 * on create/update (docs/DO_NOT_BREAK.md § Inventory & Stock). New
 * products always start at 0; record an 'opening' stock movement via
 * stockService.recordStockMovement to set real opening stock through the
 * ledger.
 */
export type CreateProductDTO = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'quantityOnHand'>;
export type UpdateProductDTO = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'quantityOnHand'>>;

/**
 * Everywhere a product's identity can be found in accounting/inventory
 * evidence — the sources `deleteProduct()` checks before allowing a hard
 * delete. Every source here already has `productId` on each of its lines
 * (`DocumentLineItem.productId` for the jsonb-backed sales/purchase
 * documents, or a real FK column for the normalized inventory-document
 * lines) — see docs/ACCOUNTING_RELATIONSHIPS.md §12.
 */
export interface ProductUsageSources {
  stockMovements: Pick<IStockMovementRepository, 'getAll'>;
  invoices: Pick<IInvoiceRepository, 'getAll'>;
  bills: Pick<IBillRepository, 'getAll'>;
  purchaseOrders: Pick<IPurchaseOrderRepository, 'getAll'>;
  creditNotes: Pick<ICreditNoteRepository, 'getAll'>;
  supplierReturns: Pick<ISupplierReturnRepository, 'getAll'>;
  openingStockBatches: Pick<IOpeningStockBatchRepository, 'getAll'>;
}

/**
 * Business-logic layer for the product catalog, mirroring
 * src/services/customerService.ts's shape (docs/ARCHITECTURE.md).
 *
 * Deletion is guarded the same way AccountService/SupplierService already
 * guard theirs (docs/ACCOUNTING_RELATIONSHIPS.md §12 — "a product used in
 * posted accounting documents must not be physically deleted"): a product
 * referenced anywhere in `usageSources` is deactivated instead of deleted.
 * Before this fix, `deleteProduct()` called a plain hard `DELETE` with no
 * check at all — it only ever survived by accident, via
 * `stock_movements.product_id`'s incidental (non-composite) DB foreign key;
 * a product referenced only from jsonb document lines (no stock movement —
 * e.g. a non-tracked/service product) could be deleted with zero warning,
 * silently orphaning every historical document line that named it.
 */
export class ProductService {
  constructor(
    private readonly repository: IProductRepository,
    private readonly usageSources: ProductUsageSources,
  ) {}

  async getProducts(): Promise<Product[]> {
    return this.repository.getAll();
  }

  async getProduct(id: string): Promise<Product | undefined> {
    return this.repository.getById(id);
  }

  async createProduct(data: CreateProductDTO): Promise<Product> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      quantityOnHand: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateProduct(id: string, patch: UpdateProductDTO): Promise<Product> {
    return this.repository.update(id, patch);
  }

  /**
   * True if `id` is referenced anywhere accounting/inventory evidence
   * exists — an append-only stock movement, or a line (jsonb or normalized)
   * on any sales/purchase/inventory document. One full pass over each
   * source, same cost/shape as `AccountService.hasPostings()`.
   */
  async hasAccountingHistory(id: string): Promise<boolean> {
    const [movements, invoices, bills, purchaseOrders, creditNotes, supplierReturns, openingStockBatches] =
      await Promise.all([
        this.usageSources.stockMovements.getAll(),
        this.usageSources.invoices.getAll(),
        this.usageSources.bills.getAll(),
        this.usageSources.purchaseOrders.getAll(),
        this.usageSources.creditNotes.getAll(),
        this.usageSources.supplierReturns.getAll(),
        this.usageSources.openingStockBatches.getAll(),
      ]);

    if (movements.some((movement) => movement.productId === id)) return true;

    const documentSetsWithLines: { lineItems: { productId?: string }[] }[] = [
      ...invoices,
      ...bills,
      ...purchaseOrders,
      ...creditNotes,
      ...supplierReturns,
      ...openingStockBatches,
    ];
    return documentSetsWithLines.some((doc) => doc.lineItems.some((line) => line.productId === id));
  }

  /**
   * Deactivates rather than hard-deletes a product with any accounting
   * history (mirrors AccountService.deleteAccount() / SupplierService.
   * deleteSupplier()'s inactivate-not-delete guard). Only a product with
   * zero history — an unused draft/master-data row — can be hard-deleted.
   */
  async deleteProduct(id: string): Promise<void> {
    if (await this.hasAccountingHistory(id)) {
      await this.repository.update(id, { status: 'inactive' });
      return;
    }
    await this.repository.delete(id);
  }
}

/** Singleton wired to the shared mock repository (see ../repositories/instances.ts). */
export const productService = new ProductService(productRepository, {
  stockMovements: stockMovementRepository,
  invoices: new SupabaseInvoiceRepository(supabase),
  bills: new SupabaseBillRepository(supabase),
  purchaseOrders: new SupabasePurchaseOrderRepository(supabase),
  creditNotes: new SupabaseCreditNoteRepository(supabase),
  supplierReturns: supplierReturnRepository,
  openingStockBatches: openingStockBatchRepository,
});
