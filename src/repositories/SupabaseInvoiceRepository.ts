import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentLineItem, ID, Invoice } from '@/types';
import type { IInvoiceRepository } from './IInvoiceRepository';
import { resolveDefaultCompanyId } from './resolveDefaultCompanyId';
import { isInvalidUuidError } from './supabaseErrors';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  customer_id: string;
  sales_order_id: string | null;
  issue_date: string;
  due_date: string;
  line_items: DocumentLineItem[];
  subtotal: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  currency: string;
  status: string;
  notes: string | null;
  journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    invoiceNumber: row.invoice_number,
    customerId: row.customer_id,
    salesOrderId: row.sales_order_id ?? undefined,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    lineItems: row.line_items ?? [],
    subtotal: Number(row.subtotal),
    taxTotal: Number(row.tax_total),
    total: Number(row.total),
    amountPaid: Number(row.amount_paid),
    currency: row.currency,
    status: row.status as Invoice['status'],
    notes: row.notes ?? undefined,
    journalEntryId: row.journal_entry_id ?? undefined,
  };
}

function invoiceToRow(entity: Partial<Invoice>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.invoiceNumber !== undefined) row.invoice_number = entity.invoiceNumber;
  if (entity.customerId !== undefined) row.customer_id = entity.customerId;
  if (entity.salesOrderId !== undefined) row.sales_order_id = entity.salesOrderId;
  if (entity.issueDate !== undefined) row.issue_date = entity.issueDate;
  if (entity.dueDate !== undefined) row.due_date = entity.dueDate;
  if (entity.lineItems !== undefined) row.line_items = entity.lineItems;
  if (entity.subtotal !== undefined) row.subtotal = entity.subtotal;
  if (entity.taxTotal !== undefined) row.tax_total = entity.taxTotal;
  if (entity.total !== undefined) row.total = entity.total;
  if (entity.amountPaid !== undefined) row.amount_paid = entity.amountPaid;
  if (entity.currency !== undefined) row.currency = entity.currency;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.notes !== undefined) row.notes = entity.notes;
  if (entity.journalEntryId !== undefined) row.journal_entry_id = entity.journalEntryId;
  return row;
}

/**
 * Supabase-backed IInvoiceRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase E). Resolves "the" company internally at create() time. This is
 * the repository behind the SHARED `invoiceService` singleton
 * (src/services/index.ts) that `sales/services/index.ts`'s
 * `SharedInvoiceRepositoryAdapter` delegates to — swapping it here is what
 * makes every caller (SalesOrderService.convertToInvoice(),
 * CreditNoteService, CustomerReceiptService) see real Supabase data too,
 * with zero changes to any of them.
 */
export class SupabaseInvoiceRepository implements IInvoiceRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseInvoiceRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<Invoice[]> {
    const { data, error } = await this.client.from('invoices').select('*').order('issue_date', { ascending: true });
    if (error) throw new Error(`SupabaseInvoiceRepository.getAll: ${error.message}`);
    return (data as InvoiceRow[]).map(rowToInvoice);
  }

  async getById(id: ID): Promise<Invoice | undefined> {
    const { data, error } = await this.client.from('invoices').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseInvoiceRepository.getById: ${error.message}`);
    }
    return data ? rowToInvoice(data as InvoiceRow) : undefined;
  }

  async create(entity: Invoice): Promise<Invoice> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('invoices')
      .insert({ ...invoiceToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseInvoiceRepository.create: ${error.message}`);
    return rowToInvoice(data as InvoiceRow);
  }

  async update(id: ID, patch: Partial<Invoice>): Promise<Invoice> {
    const { data, error } = await this.client.from('invoices').update(invoiceToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseInvoiceRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseInvoiceRepository: invoice "${id}" not found`);
    return rowToInvoice(data as InvoiceRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('invoices').delete().eq('id', id);
    if (error) throw new Error(`SupabaseInvoiceRepository.delete: ${error.message}`);
  }
}
