import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, LeaseContract } from '@/types';
import type { ILeaseRepository } from './ILeaseRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface LeaseContractRow {
  id: string;
  lease_number: string;
  lessor_name: string;
  asset_description: string;
  commencement_date: string;
  lease_term_months: number;
  monthly_payment: number;
  discount_rate_percent: number;
  status: string;
  initial_lease_liability: number;
  initial_right_of_use_asset: number;
  accumulated_depreciation: number;
  outstanding_lease_liability: number;
  journal_entry_id: string | null;
  termination_date: string | null;
  termination_journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToLeaseContract(row: LeaseContractRow): LeaseContract {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    leaseNumber: row.lease_number,
    lessorName: row.lessor_name,
    assetDescription: row.asset_description,
    commencementDate: row.commencement_date,
    leaseTermMonths: Number(row.lease_term_months),
    monthlyPayment: Number(row.monthly_payment),
    discountRatePercent: Number(row.discount_rate_percent),
    status: row.status as LeaseContract['status'],
    initialLeaseLiability: Number(row.initial_lease_liability),
    initialRightOfUseAsset: Number(row.initial_right_of_use_asset),
    accumulatedDepreciation: Number(row.accumulated_depreciation),
    outstandingLeaseLiability: Number(row.outstanding_lease_liability),
    journalEntryId: row.journal_entry_id ?? undefined,
    terminationDate: row.termination_date ?? undefined,
    terminationJournalEntryId: row.termination_journal_entry_id ?? undefined,
  };
}

function leaseContractToRow(entity: Partial<LeaseContract>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.leaseNumber !== undefined) row.lease_number = entity.leaseNumber;
  if (entity.lessorName !== undefined) row.lessor_name = entity.lessorName;
  if (entity.assetDescription !== undefined) row.asset_description = entity.assetDescription;
  if (entity.commencementDate !== undefined) row.commencement_date = entity.commencementDate;
  if (entity.leaseTermMonths !== undefined) row.lease_term_months = entity.leaseTermMonths;
  if (entity.monthlyPayment !== undefined) row.monthly_payment = entity.monthlyPayment;
  if (entity.discountRatePercent !== undefined) row.discount_rate_percent = entity.discountRatePercent;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.initialLeaseLiability !== undefined) row.initial_lease_liability = entity.initialLeaseLiability;
  if (entity.initialRightOfUseAsset !== undefined) row.initial_right_of_use_asset = entity.initialRightOfUseAsset;
  if (entity.accumulatedDepreciation !== undefined) row.accumulated_depreciation = entity.accumulatedDepreciation;
  if (entity.outstandingLeaseLiability !== undefined) row.outstanding_lease_liability = entity.outstandingLeaseLiability;
  if (entity.journalEntryId !== undefined) row.journal_entry_id = entity.journalEntryId;
  if (entity.terminationDate !== undefined) row.termination_date = entity.terminationDate;
  if (entity.terminationJournalEntryId !== undefined) row.termination_journal_entry_id = entity.terminationJournalEntryId;
  return row;
}

/**
 * Supabase-backed ILeaseRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase G). `LeaseContract.companyId` is optional on the TS type ("mirrors
 * FixedAsset's lack of a companyId") — resolved internally, NOT read from
 * the entity, same as SupabaseFixedAssetRepository.
 */
export class SupabaseLeaseRepository implements ILeaseRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseLeaseRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<LeaseContract[]> {
    const { data, error } = await this.client.from('lease_contracts').select('*').order('lease_number', { ascending: true });
    if (error) throw new Error(`SupabaseLeaseRepository.getAll: ${error.message}`);
    return (data as LeaseContractRow[]).map(rowToLeaseContract);
  }

  async getById(id: ID): Promise<LeaseContract | undefined> {
    const { data, error } = await this.client.from('lease_contracts').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseLeaseRepository.getById: ${error.message}`);
    }
    return data ? rowToLeaseContract(data as LeaseContractRow) : undefined;
  }

  async create(entity: LeaseContract): Promise<LeaseContract> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('lease_contracts')
      .insert({ ...leaseContractToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseLeaseRepository.create: ${error.message}`);
    return rowToLeaseContract(data as LeaseContractRow);
  }

  async update(id: ID, patch: Partial<LeaseContract>): Promise<LeaseContract> {
    const { data, error } = await this.client.from('lease_contracts').update(leaseContractToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseLeaseRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseLeaseRepository: lease "${id}" not found`);
    return rowToLeaseContract(data as LeaseContractRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('lease_contracts').delete().eq('id', id);
    if (error) throw new Error(`SupabaseLeaseRepository.delete: ${error.message}`);
  }
}
