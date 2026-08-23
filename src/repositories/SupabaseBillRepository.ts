import type { SupabaseClient } from '@supabase/supabase-js';
import type { Bill, DocumentLineItem, ID } from '@/types';
import type { IBillRepository } from './IBillRepository';
import { resolveDefaultCompanyId } from './resolveDefaultCompanyId';
import { isInvalidUuidError } from './supabaseErrors';

interface BillRow {
  id: string;
  bill_number: string;
  supplier_id: string;
  purchase_order_id: string | null;
  issue_date: string;
  due_date: string;
  line_items: DocumentLineItem[];
  subtotal: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  currency: string;
  status: string;
  journal_entry_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToBill(row: BillRow): Bill {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    billNumber: row.bill_number,
    supplierId: row.supplier_id,
    purchaseOrderId: row.purchase_order_id ?? undefined,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    lineItems: row.line_items ?? [],
    subtotal: Number(row.subtotal),
    taxTotal: Number(row.tax_total),
    total: Number(row.total),
    amountPaid: Number(row.amount_paid),
    currency: row.currency,
    status: row.status as Bill['status'],
    journalEntryId: row.journal_entry_id ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function billToRow(entity: Partial<Bill>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.billNumber !== undefined) row.bill_number = entity.billNumber;
  if (entity.supplierId !== undefined) row.supplier_id = entity.supplierId;
  if (entity.purchaseOrderId !== undefined) row.purchase_order_id = entity.purchaseOrderId;
  if (entity.issueDate !== undefined) row.issue_date = entity.issueDate;
  if (entity.dueDate !== undefined) row.due_date = entity.dueDate;
  if (entity.lineItems !== undefined) row.line_items = entity.lineItems;
  if (entity.subtotal !== undefined) row.subtotal = entity.subtotal;
  if (entity.taxTotal !== undefined) row.tax_total = entity.taxTotal;
  if (entity.total !== undefined) row.total = entity.total;
  if (entity.amountPaid !== undefined) row.amount_paid = entity.amountPaid;
  if (entity.currency !== undefined) row.currency = entity.currency;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.journalEntryId !== undefined) row.journal_entry_id = entity.journalEntryId;
  if (entity.notes !== undefined) row.notes = entity.notes;
  return row;
}

/**
 * Supabase-backed IBillRepository (docs/SUPABASE_MIGRATION_GUIDE.md Phase
 * E). Resolves "the" company internally at create() time.
 */
export class SupabaseBillRepository implements IBillRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseBillRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<Bill[]> {
    const { data, error } = await this.client.from('bills').select('*').order('issue_date', { ascending: true });
    if (error) throw new Error(`SupabaseBillRepository.getAll: ${error.message}`);
    return (data as BillRow[]).map(rowToBill);
  }

  async getById(id: ID): Promise<Bill | undefined> {
    const { data, error } = await this.client.from('bills').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseBillRepository.getById: ${error.message}`);
    }
    return data ? rowToBill(data as BillRow) : undefined;
  }

  async create(entity: Bill): Promise<Bill> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('bills')
      .insert({ ...billToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseBillRepository.create: ${error.message}`);
    return rowToBill(data as BillRow);
  }

  async update(id: ID, patch: Partial<Bill>): Promise<Bill> {
    const { data, error } = await this.client.from('bills').update(billToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseBillRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseBillRepository: bill "${id}" not found`);
    return rowToBill(data as BillRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('bills').delete().eq('id', id);
    if (error) throw new Error(`SupabaseBillRepository.delete: ${error.message}`);
  }
}
