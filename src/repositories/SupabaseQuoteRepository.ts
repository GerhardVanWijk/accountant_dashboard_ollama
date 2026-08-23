import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentLineItem, ID, Quote } from '@/types';
import type { IQuoteRepository } from './IQuoteRepository';
import { resolveDefaultCompanyId } from './resolveDefaultCompanyId';
import { isInvalidUuidError } from './supabaseErrors';

interface QuoteRow {
  id: string;
  quote_number: string;
  customer_id: string;
  issue_date: string;
  expiry_date: string;
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

function rowToQuote(row: QuoteRow): Quote {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    quoteNumber: row.quote_number,
    customerId: row.customer_id,
    issueDate: row.issue_date,
    expiryDate: row.expiry_date,
    lineItems: row.line_items ?? [],
    subtotal: Number(row.subtotal),
    taxTotal: Number(row.tax_total),
    total: Number(row.total),
    currency: row.currency,
    status: row.status as Quote['status'],
    notes: row.notes ?? undefined,
  };
}

function quoteToRow(entity: Partial<Quote>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.quoteNumber !== undefined) row.quote_number = entity.quoteNumber;
  if (entity.customerId !== undefined) row.customer_id = entity.customerId;
  if (entity.issueDate !== undefined) row.issue_date = entity.issueDate;
  if (entity.expiryDate !== undefined) row.expiry_date = entity.expiryDate;
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
 * Supabase-backed IQuoteRepository (docs/SUPABASE_MIGRATION_GUIDE.md Phase
 * E). Resolves "the" company internally at create() time — same
 * single-tenant pattern as SupabaseAccountRepository. `lineItems` round-trips
 * as a single jsonb column — see the Phase E migration's header comment for
 * why (no separate quote_lines table).
 */
export class SupabaseQuoteRepository implements IQuoteRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseQuoteRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<Quote[]> {
    const { data, error } = await this.client.from('quotes').select('*').order('issue_date', { ascending: true });
    if (error) throw new Error(`SupabaseQuoteRepository.getAll: ${error.message}`);
    return (data as QuoteRow[]).map(rowToQuote);
  }

  async getById(id: ID): Promise<Quote | undefined> {
    const { data, error } = await this.client.from('quotes').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseQuoteRepository.getById: ${error.message}`);
    }
    return data ? rowToQuote(data as QuoteRow) : undefined;
  }

  async create(entity: Quote): Promise<Quote> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('quotes')
      .insert({ ...quoteToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseQuoteRepository.create: ${error.message}`);
    return rowToQuote(data as QuoteRow);
  }

  async update(id: ID, patch: Partial<Quote>): Promise<Quote> {
    const { data, error } = await this.client.from('quotes').update(quoteToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseQuoteRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseQuoteRepository: quote "${id}" not found`);
    return rowToQuote(data as QuoteRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('quotes').delete().eq('id', id);
    if (error) throw new Error(`SupabaseQuoteRepository.delete: ${error.message}`);
  }
}
