import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CategoryAccountMappingRecord,
  ICategoryAccountMappingRepository,
} from './ICategoryAccountMappingRepository';

interface CategoryAccountMappingRow {
  id: string;
  company_id: string;
  category_name: string;
  revenue_account_id: string | null;
  cogs_account_id: string | null;
  inventory_account_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: CategoryAccountMappingRow): CategoryAccountMappingRecord {
  return {
    categoryName: row.category_name,
    revenueAccountId: row.revenue_account_id ?? undefined,
    cogsAccountId: row.cogs_account_id ?? undefined,
    inventoryAccountId: row.inventory_account_id ?? undefined,
  };
}

/**
 * Supabase-backed `ICategoryAccountMappingRepository` (migration
 * `0019_category_account_mappings`). Read-only — the app never writes
 * mapping rows through a running session yet (they are seeded per company,
 * same as the Chart of Accounts), so this exposes only `getAll()`. RLS
 * ("own company" ALL policy) scopes the rows to the signed-in user's
 * company, exactly like every other Phase B/D/F repository here, so no
 * explicit `company_id` filter is needed.
 */
export class SupabaseCategoryAccountMappingRepository implements ICategoryAccountMappingRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getAll(): Promise<CategoryAccountMappingRecord[]> {
    const { data, error } = await this.client
      .from('category_account_mappings')
      .select('*')
      .order('category_name', { ascending: true });
    if (error) throw new Error(`SupabaseCategoryAccountMappingRepository.getAll: ${error.message}`);
    return (data as CategoryAccountMappingRow[]).map(rowToRecord);
  }
}
