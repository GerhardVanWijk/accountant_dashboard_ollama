import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, TaxRate } from '@/types';
import type { ITaxRateRepository } from './ITaxRateRepository';
import { resolveDefaultCompanyId } from './resolveDefaultCompanyId';
import { isInvalidUuidError } from './supabaseErrors';

interface TaxRateRow {
  id: string;
  code: string;
  name: string;
  treatment: string;
  rate: number;
  applies_to: string;
  effective_from: string;
  effective_to: string | null;
  jurisdiction: string;
  source_reference: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function rowToTaxRate(row: TaxRateRow): TaxRate {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    code: row.code,
    name: row.name,
    treatment: row.treatment as TaxRate['treatment'],
    rate: Number(row.rate),
    appliesTo: row.applies_to as TaxRate['appliesTo'],
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined,
    jurisdiction: row.jurisdiction,
    sourceReference: row.source_reference,
    isActive: row.is_active,
  };
}

function taxRateToRow(entity: Partial<TaxRate>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.code !== undefined) row.code = entity.code;
  if (entity.name !== undefined) row.name = entity.name;
  if (entity.treatment !== undefined) row.treatment = entity.treatment;
  if (entity.rate !== undefined) row.rate = entity.rate;
  if (entity.appliesTo !== undefined) row.applies_to = entity.appliesTo;
  if (entity.effectiveFrom !== undefined) row.effective_from = entity.effectiveFrom;
  if (entity.effectiveTo !== undefined) row.effective_to = entity.effectiveTo;
  if (entity.jurisdiction !== undefined) row.jurisdiction = entity.jurisdiction;
  if (entity.sourceReference !== undefined) row.source_reference = entity.sourceReference;
  if (entity.isActive !== undefined) row.is_active = entity.isActive;
  return row;
}

/**
 * Supabase-backed ITaxRateRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase D). Resolves "the" company internally at create() time — same
 * single-tenant pattern as SupabaseAccountRepository.
 *
 * TaxRate stays a plain fully-editable table (full CRUD, no append-only
 * DB-layer restriction), matching `ITaxRateRepository`'s generic
 * `IRepository<TaxRate>` shape — `TaxRateService.supersede()`
 * (src/features/tax/services/taxRateService.ts) enforces the
 * "immutable once posted against" rule at the application layer by calling
 * `update()` only to close `effectiveTo`/`isActive`, never editing `rate`
 * on an existing row itself; there is no DB-level constraint enforcing
 * that convention, the same trust boundary as the ledger's
 * sum(debit)=sum(credit) invariant (docs/LEDGER_ARCHITECTURE.md's "Known
 * gaps").
 */
export class SupabaseTaxRateRepository implements ITaxRateRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseTaxRateRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<TaxRate[]> {
    const { data, error } = await this.client.from('tax_rates').select('*').order('effective_from', { ascending: true });
    if (error) throw new Error(`SupabaseTaxRateRepository.getAll: ${error.message}`);
    return (data as TaxRateRow[]).map(rowToTaxRate);
  }

  async getById(id: ID): Promise<TaxRate | undefined> {
    const { data, error } = await this.client.from('tax_rates').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseTaxRateRepository.getById: ${error.message}`);
    }
    return data ? rowToTaxRate(data as TaxRateRow) : undefined;
  }

  async create(entity: TaxRate): Promise<TaxRate> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('tax_rates')
      .insert({ ...taxRateToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseTaxRateRepository.create: ${error.message}`);
    return rowToTaxRate(data as TaxRateRow);
  }

  async update(id: ID, patch: Partial<TaxRate>): Promise<TaxRate> {
    const { data, error } = await this.client.from('tax_rates').update(taxRateToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseTaxRateRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseTaxRateRepository: tax rate "${id}" not found`);
    return rowToTaxRate(data as TaxRateRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('tax_rates').delete().eq('id', id);
    if (error) throw new Error(`SupabaseTaxRateRepository.delete: ${error.message}`);
  }
}
