import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentLineItem, ID, SalesOrder } from '@/types';
import type { ISalesOrderRepository } from './ISalesOrderRepository';
import { resolveDefaultCompanyId } from './resolveDefaultCompanyId';
import { isInvalidUuidError } from './supabaseErrors';

interface SalesOrderRow {
  id: string;
  order_number: string;
  customer_id: string;
  quote_id: string | null;
  order_date: string;
  line_items: DocumentLineItem[];
  subtotal: number;
  tax_total: number;
  total: number;
  currency: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToSalesOrder(row: SalesOrderRow): SalesOrder {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    quoteId: row.quote_id ?? undefined,
    orderDate: row.order_date,
    lineItems: row.line_items ?? [],
    subtotal: Number(row.subtotal),
    taxTotal: Number(row.tax_total),
    total: Number(row.total),
    currency: row.currency,
    status: row.status as SalesOrder['status'],
    notes: row.notes ?? undefined,
  };
}

function salesOrderToRow(entity: Partial<SalesOrder>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.orderNumber !== undefined) row.order_number = entity.orderNumber;
  if (entity.customerId !== undefined) row.customer_id = entity.customerId;
  if (entity.quoteId !== undefined) row.quote_id = entity.quoteId;
  if (entity.orderDate !== undefined) row.order_date = entity.orderDate;
  if (entity.lineItems !== undefined) row.line_items = entity.lineItems;
  if (entity.subtotal !== undefined) row.subtotal = entity.subtotal;
  if (entity.taxTotal !== undefined) row.tax_total = entity.taxTotal;
  if (entity.total !== undefined) row.total = entity.total;
  if (entity.currency !== undefined) row.currency = entity.currency;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.notes !== undefined) row.notes = entity.notes;
  return row;
}

/**
 * Supabase-backed ISalesOrderRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase E). Resolves "the" company internally at create() time.
 */
export class SupabaseSalesOrderRepository implements ISalesOrderRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseSalesOrderRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<SalesOrder[]> {
    const { data, error } = await this.client.from('sales_orders').select('*').order('order_date', { ascending: true });
    if (error) throw new Error(`SupabaseSalesOrderRepository.getAll: ${error.message}`);
    return (data as SalesOrderRow[]).map(rowToSalesOrder);
  }

  async getById(id: ID): Promise<SalesOrder | undefined> {
    const { data, error } = await this.client.from('sales_orders').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseSalesOrderRepository.getById: ${error.message}`);
    }
    return data ? rowToSalesOrder(data as SalesOrderRow) : undefined;
  }

  async create(entity: SalesOrder): Promise<SalesOrder> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('sales_orders')
      .insert({ ...salesOrderToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseSalesOrderRepository.create: ${error.message}`);
    return rowToSalesOrder(data as SalesOrderRow);
  }

  async update(id: ID, patch: Partial<SalesOrder>): Promise<SalesOrder> {
    const { data, error } = await this.client.from('sales_orders').update(salesOrderToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseSalesOrderRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseSalesOrderRepository: sales order "${id}" not found`);
    return rowToSalesOrder(data as SalesOrderRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('sales_orders').delete().eq('id', id);
    if (error) throw new Error(`SupabaseSalesOrderRepository.delete: ${error.message}`);
  }
}
