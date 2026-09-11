import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, VatDirection, VatSourceEntry, VatTreatment } from '@/types';
import type { IVatSourceEntryRepository } from './IVatSourceEntryRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface VatSourceEntryRow {
  id: string;
  source_type: string;
  source_id: string;
  transaction_date: string;
  tax_rate_id: string;
  treatment: VatTreatment;
  direction: VatDirection;
  taxable_amount: number;
  vat_amount: number;
  gross_amount: number;
  classification: string | null;
  journal_entry_id: string | null;
  reverses_entry_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

function rowToVatSourceEntry(row: VatSourceEntryRow): VatSourceEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceType: row.source_type,
    sourceId: row.source_id,
    transactionDate: row.transaction_date,
    taxRateId: row.tax_rate_id,
    treatment: row.treatment,
    direction: row.direction,
    taxableAmount: Number(row.taxable_amount),
    vatAmount: Number(row.vat_amount),
    grossAmount: Number(row.gross_amount),
    classification: row.classification ?? undefined,
    journalEntryId: row.journal_entry_id ?? undefined,
    reversesEntryId: row.reverses_entry_id ?? undefined,
    reason: row.reason ?? undefined,
  };
}

/**
 * Supabase-backed IVatSourceEntryRepository (migration 0080). Append-only —
 * no update()/delete(). Resolves "the" company internally at create() time.
 */
export class SupabaseVatSourceEntryRepository implements IVatSourceEntryRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseVatSourceEntryRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<VatSourceEntry[]> {
    const { data, error } = await this.client
      .from('vat_source_entries')
      .select('*')
      .order('transaction_date', { ascending: true });
    if (error) throw new Error(`SupabaseVatSourceEntryRepository.getAll: ${error.message}`);
    return (data as VatSourceEntryRow[]).map(rowToVatSourceEntry);
  }

  async getBySource(sourceType: string, sourceId: ID): Promise<VatSourceEntry[]> {
    const { data, error } = await this.client
      .from('vat_source_entries')
      .select('*')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .order('transaction_date', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseVatSourceEntryRepository.getBySource: ${error.message}`);
    }
    return (data as VatSourceEntryRow[]).map(rowToVatSourceEntry);
  }

  async create(entity: VatSourceEntry): Promise<VatSourceEntry> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('vat_source_entries')
      .insert({
        company_id: companyId,
        source_type: entity.sourceType,
        source_id: entity.sourceId,
        transaction_date: entity.transactionDate,
        tax_rate_id: entity.taxRateId,
        treatment: entity.treatment,
        direction: entity.direction,
        taxable_amount: entity.taxableAmount,
        vat_amount: entity.vatAmount,
        gross_amount: entity.grossAmount,
        classification: entity.classification ?? null,
        journal_entry_id: entity.journalEntryId ?? null,
        reverses_entry_id: entity.reversesEntryId ?? null,
        reason: entity.reason ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseVatSourceEntryRepository.create: ${error.message}`);
    return rowToVatSourceEntry(data as VatSourceEntryRow);
  }
}
