import type { SupabaseClient } from '@supabase/supabase-js';
import type { DividendDeclaration, ID } from '@/types';
import type { IDividendDeclarationRepository } from './IDividendDeclarationRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface DividendDeclarationRow {
  id: string;
  declaration_date: string;
  total_amount: number;
  exempt_portion: number;
  exemption_reason: string | null;
  status: string;
  taxable_amount: number;
  rate_percent_applied: number;
  dividends_tax_withheld: number;
  net_payable_to_shareholders: number;
  declaration_journal_entry_id: string | null;
  payment_journal_entry_id: string | null;
  paid_date: string | null;
  remittance_journal_entry_id: string | null;
  remitted_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDividendDeclaration(row: DividendDeclarationRow): DividendDeclaration {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    declarationDate: row.declaration_date,
    totalAmount: Number(row.total_amount),
    exemptPortion: Number(row.exempt_portion),
    exemptionReason: row.exemption_reason ?? undefined,
    status: row.status as DividendDeclaration['status'],
    taxableAmount: Number(row.taxable_amount),
    ratePercentApplied: Number(row.rate_percent_applied),
    dividendsTaxWithheld: Number(row.dividends_tax_withheld),
    netPayableToShareholders: Number(row.net_payable_to_shareholders),
    declarationJournalEntryId: row.declaration_journal_entry_id ?? undefined,
    paymentJournalEntryId: row.payment_journal_entry_id ?? undefined,
    paidDate: row.paid_date ?? undefined,
    remittanceJournalEntryId: row.remittance_journal_entry_id ?? undefined,
    remittedDate: row.remitted_date ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function dividendDeclarationToRow(entity: Partial<DividendDeclaration>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.declarationDate !== undefined) row.declaration_date = entity.declarationDate;
  if (entity.totalAmount !== undefined) row.total_amount = entity.totalAmount;
  if (entity.exemptPortion !== undefined) row.exempt_portion = entity.exemptPortion;
  if (entity.exemptionReason !== undefined) row.exemption_reason = entity.exemptionReason;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.taxableAmount !== undefined) row.taxable_amount = entity.taxableAmount;
  if (entity.ratePercentApplied !== undefined) row.rate_percent_applied = entity.ratePercentApplied;
  if (entity.dividendsTaxWithheld !== undefined) row.dividends_tax_withheld = entity.dividendsTaxWithheld;
  if (entity.netPayableToShareholders !== undefined) row.net_payable_to_shareholders = entity.netPayableToShareholders;
  if (entity.declarationJournalEntryId !== undefined) row.declaration_journal_entry_id = entity.declarationJournalEntryId;
  if (entity.paymentJournalEntryId !== undefined) row.payment_journal_entry_id = entity.paymentJournalEntryId;
  if (entity.paidDate !== undefined) row.paid_date = entity.paidDate;
  if (entity.remittanceJournalEntryId !== undefined) row.remittance_journal_entry_id = entity.remittanceJournalEntryId;
  if (entity.remittedDate !== undefined) row.remitted_date = entity.remittedDate;
  if (entity.notes !== undefined) row.notes = entity.notes;
  return row;
}

/**
 * Supabase-backed IDividendDeclarationRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase F). Resolves "the" company internally at create() time — DividendDeclaration
 * has no companyId field.
 */
export class SupabaseDividendDeclarationRepository implements IDividendDeclarationRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseDividendDeclarationRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<DividendDeclaration[]> {
    const { data, error } = await this.client.from('dividend_declarations').select('*').order('declaration_date', { ascending: true });
    if (error) throw new Error(`SupabaseDividendDeclarationRepository.getAll: ${error.message}`);
    return (data as DividendDeclarationRow[]).map(rowToDividendDeclaration);
  }

  async getById(id: ID): Promise<DividendDeclaration | undefined> {
    const { data, error } = await this.client.from('dividend_declarations').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseDividendDeclarationRepository.getById: ${error.message}`);
    }
    return data ? rowToDividendDeclaration(data as DividendDeclarationRow) : undefined;
  }

  async create(entity: DividendDeclaration): Promise<DividendDeclaration> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('dividend_declarations')
      .insert({ ...dividendDeclarationToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseDividendDeclarationRepository.create: ${error.message}`);
    return rowToDividendDeclaration(data as DividendDeclarationRow);
  }

  async update(id: ID, patch: Partial<DividendDeclaration>): Promise<DividendDeclaration> {
    const { data, error } = await this.client
      .from('dividend_declarations')
      .update(dividendDeclarationToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseDividendDeclarationRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseDividendDeclarationRepository: dividend declaration "${id}" not found`);
    return rowToDividendDeclaration(data as DividendDeclarationRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('dividend_declarations').delete().eq('id', id);
    if (error) throw new Error(`SupabaseDividendDeclarationRepository.delete: ${error.message}`);
  }
}
