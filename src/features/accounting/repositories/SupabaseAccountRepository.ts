import type { SupabaseClient } from '@supabase/supabase-js';
import type { Account, ID } from '@/types';
import type { IAccountRepository } from './IAccountRepository';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface AccountRow {
  id: string;
  company_id: string;
  code: string;
  name: string;
  type: string;
  sub_type: string | null;
  parent_account_id: string | null;
  normal_balance: string;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    code: row.code,
    name: row.name,
    type: row.type as Account['type'],
    subType: row.sub_type ?? undefined,
    parentAccountId: row.parent_account_id ?? undefined,
    normalBalance: row.normal_balance as Account['normalBalance'],
    isActive: row.is_active,
    description: row.description ?? undefined,
  };
}

function accountToRow(entity: Partial<Account>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.code !== undefined) row.code = entity.code;
  if (entity.name !== undefined) row.name = entity.name;
  if (entity.type !== undefined) row.type = entity.type;
  if (entity.subType !== undefined) row.sub_type = entity.subType;
  if (entity.parentAccountId !== undefined) row.parent_account_id = entity.parentAccountId;
  if (entity.normalBalance !== undefined) row.normal_balance = entity.normalBalance;
  if (entity.isActive !== undefined) row.is_active = entity.isActive;
  if (entity.description !== undefined) row.description = entity.description;
  return row;
}

/**
 * Supabase-backed IAccountRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase B).
 *
 * FLAGGED DEVIATION (documented in the migration guide, not silently
 * decided): `accounts.company_id` is `NOT NULL` in the Phase A schema, but
 * the real `src/types/account.ts` `Account` domain type has no `companyId`
 * field at all — the app is single-tenant today, so `IAccountRepository`'s
 * `create()` signature was never given one to pass through. This repository
 * resolves "the" company internally (there is only ever one row in
 * `companies` in this app's current single-tenant scope) and injects it at
 * write time, rather than changing `IAccountRepository`'s contract — the
 * one deliberately isolated exception to "zero interface changes" in this
 * phase. The resolved id is cached for this repository instance's lifetime
 * (a Chart of Accounts session doesn't need to re-resolve it every call).
 */
export class SupabaseAccountRepository implements IAccountRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (this.cachedCompanyId) return this.cachedCompanyId;
    const { data, error } = await this.client.from('companies').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (error) throw new Error(`SupabaseAccountRepository: failed to resolve the company for a new account: ${error.message}`);
    if (!data) throw new Error('SupabaseAccountRepository: no Company exists yet — create one before creating Accounts.');
    this.cachedCompanyId = data.id as ID;
    return this.cachedCompanyId;
  }

  async getAll(): Promise<Account[]> {
    const { data, error } = await this.client.from('accounts').select('*').order('code', { ascending: true });
    if (error) throw new Error(`SupabaseAccountRepository.getAll: ${error.message}`);
    return (data as AccountRow[]).map(rowToAccount);
  }

  async getById(id: ID): Promise<Account | undefined> {
    const { data, error } = await this.client.from('accounts').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseAccountRepository.getById: ${error.message}`);
    }
    return data ? rowToAccount(data as AccountRow) : undefined;
  }

  async create(entity: Account): Promise<Account> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('accounts')
      .insert({ ...accountToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseAccountRepository.create: ${error.message}`);
    return rowToAccount(data as AccountRow);
  }

  async update(id: ID, patch: Partial<Account>): Promise<Account> {
    const { data, error } = await this.client.from('accounts').update(accountToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseAccountRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseAccountRepository: account "${id}" not found`);
    return rowToAccount(data as AccountRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('accounts').delete().eq('id', id);
    if (error) throw new Error(`SupabaseAccountRepository.delete: ${error.message}`);
  }
}
