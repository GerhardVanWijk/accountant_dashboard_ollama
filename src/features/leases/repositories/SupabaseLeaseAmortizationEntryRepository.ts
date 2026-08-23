import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, LeaseAmortizationEntry } from '@/types';
import type { ILeaseAmortizationEntryRepository } from './ILeaseAmortizationEntryRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface LeaseAmortizationEntryRow {
  id: string;
  lease_id: string;
  period_end: string;
  interest_amount: number;
  principal_amount: number;
  depreciation_amount: number;
  outstanding_lease_liability_after: number;
  accumulated_depreciation_after: number;
  journal_entry_id: string;
  created_at: string;
  updated_at: string;
}

function rowToLeaseAmortizationEntry(row: LeaseAmortizationEntryRow): LeaseAmortizationEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    leaseId: row.lease_id,
    periodEnd: row.period_end,
    interestAmount: Number(row.interest_amount),
    principalAmount: Number(row.principal_amount),
    depreciationAmount: Number(row.depreciation_amount),
    outstandingLeaseLiabilityAfter: Number(row.outstanding_lease_liability_after),
    accumulatedDepreciationAfter: Number(row.accumulated_depreciation_after),
    journalEntryId: row.journal_entry_id,
  };
}

/**
 * Supabase-backed ILeaseAmortizationEntryRepository
 * (docs/SUPABASE_MIGRATION_GUIDE.md Phase G). Append-only — no
 * update()/delete(), matching the interface. Resolves "the" company
 * internally at create() time, same pattern as
 * SupabaseDepreciationEntryRepository.
 */
export class SupabaseLeaseAmortizationEntryRepository implements ILeaseAmortizationEntryRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseLeaseAmortizationEntryRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<LeaseAmortizationEntry[]> {
    const { data, error } = await this.client.from('lease_amortization_entries').select('*').order('period_end', { ascending: true });
    if (error) throw new Error(`SupabaseLeaseAmortizationEntryRepository.getAll: ${error.message}`);
    return (data as LeaseAmortizationEntryRow[]).map(rowToLeaseAmortizationEntry);
  }

  async getById(id: ID): Promise<LeaseAmortizationEntry | undefined> {
    const { data, error } = await this.client.from('lease_amortization_entries').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseLeaseAmortizationEntryRepository.getById: ${error.message}`);
    }
    return data ? rowToLeaseAmortizationEntry(data as LeaseAmortizationEntryRow) : undefined;
  }

  async getByLease(leaseId: ID): Promise<LeaseAmortizationEntry[]> {
    const { data, error } = await this.client
      .from('lease_amortization_entries')
      .select('*')
      .eq('lease_id', leaseId)
      .order('period_end', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseLeaseAmortizationEntryRepository.getByLease: ${error.message}`);
    }
    return (data as LeaseAmortizationEntryRow[]).map(rowToLeaseAmortizationEntry);
  }

  async create(entity: LeaseAmortizationEntry): Promise<LeaseAmortizationEntry> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('lease_amortization_entries')
      .insert({
        company_id: companyId,
        lease_id: entity.leaseId,
        period_end: entity.periodEnd,
        interest_amount: entity.interestAmount,
        principal_amount: entity.principalAmount,
        depreciation_amount: entity.depreciationAmount,
        outstanding_lease_liability_after: entity.outstandingLeaseLiabilityAfter,
        accumulated_depreciation_after: entity.accumulatedDepreciationAfter,
        journal_entry_id: entity.journalEntryId,
      })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseLeaseAmortizationEntryRepository.create: ${error.message}`);
    return rowToLeaseAmortizationEntry(data as LeaseAmortizationEntryRow);
  }
}
