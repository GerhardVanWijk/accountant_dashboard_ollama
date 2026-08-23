import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentLineItem, ID, PurchaseOrder } from '@/types';
import type { IPurchaseOrderRepository } from './IPurchaseOrderRepository';
import { resolveDefaultCompanyId } from './resolveDefaultCompanyId';
import { isInvalidUuidError } from './supabaseErrors';

interface PurchaseOrderRow {
  id: string;
  po_number: string;
  supplier_id: string;
  order_date: string;
  expected_date: string | null;
  line_items: DocumentLineItem[];
  subtotal: number;
  tax_total: number;
  total: number;
  currency: string;
  status: string;
  notes: string | null;
  bill_id: string | null;
  received_date: string | null;
  journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToPurchaseOrder(row: PurchaseOrderRow): PurchaseOrder {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    poNumber: row.po_number,
    supplierId: row.supplier_id,
    orderDate: row.order_date,
    expectedDate: row.expected_date ?? undefined,
    lineItems: row.line_items ?? [],
    subtotal: Number(row.subtotal),
    taxTotal: Number(row.tax_total),
    total: Number(row.total),
    currency: row.currency,
    status: row.status as PurchaseOrder['status'],
    notes: row.notes ?? undefined,
    billId: row.bill_id ?? undefined,
    receivedDate: row.received_date ?? undefined,
    journalEntryId: row.journal_entry_id ?? undefined,
  };
}

function purchaseOrderToRow(entity: Partial<PurchaseOrder>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.poNumber !== undefined) row.po_number = entity.poNumber;
  if (entity.supplierId !== undefined) row.supplier_id = entity.supplierId;
  if (entity.orderDate !== undefined) row.order_date = entity.orderDate;
  if (entity.expectedDate !== undefined) row.expected_date = entity.expectedDate;
  if (entity.lineItems !== undefined) row.line_items = entity.lineItems;
  if (entity.subtotal !== undefined) row.subtotal = entity.subtotal;
  if (entity.taxTotal !== undefined) row.tax_total = entity.taxTotal;
  if (entity.total !== undefined) row.total = entity.total;
  if (entity.currency !== undefined) row.currency = entity.currency;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.notes !== undefined) row.notes = entity.notes;
  if (entity.billId !== undefined) row.bill_id = entity.billId;
  if (entity.receivedDate !== undefined) row.received_date = entity.receivedDate;
  if (entity.journalEntryId !== undefined) row.journal_entry_id = entity.journalEntryId;
  return row;
}

/**
 * Supabase-backed IPurchaseOrderRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase E). Resolves "the" company internally at create() time.
 */
export class SupabasePurchaseOrderRepository implements IPurchaseOrderRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabasePurchaseOrderRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<PurchaseOrder[]> {
    const { data, error } = await this.client.from('purchase_orders').select('*').order('order_date', { ascending: true });
    if (error) throw new Error(`SupabasePurchaseOrderRepository.getAll: ${error.message}`);
    return (data as PurchaseOrderRow[]).map(rowToPurchaseOrder);
  }

  async getById(id: ID): Promise<PurchaseOrder | undefined> {
    const { data, error } = await this.client.from('purchase_orders').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabasePurchaseOrderRepository.getById: ${error.message}`);
    }
    return data ? rowToPurchaseOrder(data as PurchaseOrderRow) : undefined;
  }

  async create(entity: PurchaseOrder): Promise<PurchaseOrder> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('purchase_orders')
      .insert({ ...purchaseOrderToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabasePurchaseOrderRepository.create: ${error.message}`);
    return rowToPurchaseOrder(data as PurchaseOrderRow);
  }

  async update(id: ID, patch: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    const { data, error } = await this.client
      .from('purchase_orders')
      .update(purchaseOrderToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabasePurchaseOrderRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabasePurchaseOrderRepository: purchase order "${id}" not found`);
    return rowToPurchaseOrder(data as PurchaseOrderRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('purchase_orders').delete().eq('id', id);
    if (error) throw new Error(`SupabasePurchaseOrderRepository.delete: ${error.message}`);
  }
}
