import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExchangeRate, ID } from '@/types';
import type { IExchangeRateRepository } from './IExchangeRateRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface ExchangeRateRow {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  rate_date: string;
  source_reference: string;
  created_at: string;
  updated_at: string;
}

function rowToExchangeRate(row: ExchangeRateRow): ExchangeRate {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fromCurrency: row.from_currency as ExchangeRate['fromCurrency'],
    toCurrency: row.to_currency as ExchangeRate['toCurrency'],
    rate: Number(row.rate),
    rateDate: row.rate_date,
    sourceReference: row.source_reference,
  };
}

function exchangeRateToRow(entity: Partial<ExchangeRate>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.fromCurrency !== undefined) row.from_currency = entity.fromCurrency;
  if (entity.toCurrency !== undefined) row.to_currency = entity.toCurrency;
  if (entity.rate !== undefined) row.rate = entity.rate;
  if (entity.rateDate !== undefined) row.rate_date = entity.rateDate;
  if (entity.sourceReference !== undefined) row.source_reference = entity.sourceReference;
  return row;
}

/**
 * Supabase-backed IExchangeRateRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase G). Plain `IRepository<ExchangeRate>` — no custom
 * `getRateForDate()` method here: `ExchangeRateService.getRateForDate()`
 * already does the "most recent rate <= date" filtering in-memory over
 * `getAll()` (see exchangeRateService.ts), so the repository contract
 * doesn't need to change to support it. `ExchangeRate` has no `companyId`
 * field — resolved internally.
 */
export class SupabaseExchangeRateRepository implements IExchangeRateRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseExchangeRateRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<ExchangeRate[]> {
    const { data, error } = await this.client.from('exchange_rates').select('*').order('rate_date', { ascending: false });
    if (error) throw new Error(`SupabaseExchangeRateRepository.getAll: ${error.message}`);
    return (data as ExchangeRateRow[]).map(rowToExchangeRate);
  }

  async getById(id: ID): Promise<ExchangeRate | undefined> {
    const { data, error } = await this.client.from('exchange_rates').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseExchangeRateRepository.getById: ${error.message}`);
    }
    return data ? rowToExchangeRate(data as ExchangeRateRow) : undefined;
  }

  async create(entity: ExchangeRate): Promise<ExchangeRate> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('exchange_rates')
      .insert({ ...exchangeRateToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseExchangeRateRepository.create: ${error.message}`);
    return rowToExchangeRate(data as ExchangeRateRow);
  }

  async update(id: ID, patch: Partial<ExchangeRate>): Promise<ExchangeRate> {
    const { data, error } = await this.client.from('exchange_rates').update(exchangeRateToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseExchangeRateRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseExchangeRateRepository: exchange rate "${id}" not found`);
    return rowToExchangeRate(data as ExchangeRateRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('exchange_rates').delete().eq('id', id);
    if (error) throw new Error(`SupabaseExchangeRateRepository.delete: ${error.message}`);
  }
}
