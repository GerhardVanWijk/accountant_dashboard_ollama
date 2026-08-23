import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreditNote, CreditNoteAllocation, DocumentLineItem, ID } from '@/types';
import type { ICreditNoteRepository } from './ICreditNoteRepository';
import { resolveDefaultCompanyId } from './resolveDefaultCompanyId';
import { isInvalidUuidError } from './supabaseErrors';

interface CreditNoteRow {
  id: string;
  credit_note_number: string;
  customer_id: string;
  invoice_id: string | null;
  issue_date: string;
  reason: string;
  line_items: DocumentLineItem[];
  subtotal: number;
  tax_total: number;
  total: number;
  amount_allocated: number;
  currency: string;
  status: string;
  allocations: CreditNoteAllocation[];
  journal_entry_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToCreditNote(row: CreditNoteRow): CreditNote {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    creditNoteNumber: row.credit_note_number,
    customerId: row.customer_id,
    invoiceId: row.invoice_id ?? undefined,
    issueDate: row.issue_date,
    reason: row.reason as CreditNote['reason'],
    lineItems: row.line_items ?? [],
    subtotal: Number(row.subtotal),
    taxTotal: Number(row.tax_total),
    total: Number(row.total),
    amountAllocated: Number(row.amount_allocated),
    currency: row.currency,
    status: row.status as CreditNote['status'],
    allocations: row.allocations ?? [],
    journalEntryId: row.journal_entry_id ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function creditNoteToRow(entity: Partial<CreditNote>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.creditNoteNumber !== undefined) row.credit_note_number = entity.creditNoteNumber;
  if (entity.customerId !== undefined) row.customer_id = entity.customerId;
  if (entity.invoiceId !== undefined) row.invoice_id = entity.invoiceId;
  if (entity.issueDate !== undefined) row.issue_date = entity.issueDate;
  if (entity.reason !== undefined) row.reason = entity.reason;
  if (entity.lineItems !== undefined) row.line_items = entity.lineItems;
  if (entity.subtotal !== undefined) row.subtotal = entity.subtotal;
  if (entity.taxTotal !== undefined) row.tax_total = entity.taxTotal;
  if (entity.total !== undefined) row.total = entity.total;
  if (entity.amountAllocated !== undefined) row.amount_allocated = entity.amountAllocated;
  if (entity.currency !== undefined) row.currency = entity.currency;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.allocations !== undefined) row.allocations = entity.allocations;
  if (entity.journalEntryId !== undefined) row.journal_entry_id = entity.journalEntryId;
  if (entity.notes !== undefined) row.notes = entity.notes;
  return row;
}

/**
 * Supabase-backed ICreditNoteRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase E). Resolves "the" company internally at create() time.
 */
export class SupabaseCreditNoteRepository implements ICreditNoteRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseCreditNoteRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<CreditNote[]> {
    const { data, error } = await this.client.from('credit_notes').select('*').order('issue_date', { ascending: true });
    if (error) throw new Error(`SupabaseCreditNoteRepository.getAll: ${error.message}`);
    return (data as CreditNoteRow[]).map(rowToCreditNote);
  }

  async getById(id: ID): Promise<CreditNote | undefined> {
    const { data, error } = await this.client.from('credit_notes').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseCreditNoteRepository.getById: ${error.message}`);
    }
    return data ? rowToCreditNote(data as CreditNoteRow) : undefined;
  }

  async create(entity: CreditNote): Promise<CreditNote> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('credit_notes')
      .insert({ ...creditNoteToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseCreditNoteRepository.create: ${error.message}`);
    return rowToCreditNote(data as CreditNoteRow);
  }

  async update(id: ID, patch: Partial<CreditNote>): Promise<CreditNote> {
    const { data, error } = await this.client.from('credit_notes').update(creditNoteToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseCreditNoteRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseCreditNoteRepository: credit note "${id}" not found`);
    return rowToCreditNote(data as CreditNoteRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('credit_notes').delete().eq('id', id);
    if (error) throw new Error(`SupabaseCreditNoteRepository.delete: ${error.message}`);
  }
}
