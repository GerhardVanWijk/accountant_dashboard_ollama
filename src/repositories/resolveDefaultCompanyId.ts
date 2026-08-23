import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/types';

/**
 * Resolves "the" company id for this single-tenant app. Every domain type
 * with no companyId field (Account, JournalEntry, AuditLogEntry, and every
 * Phase D master-data type) needs this at write time to satisfy the
 * NOT NULL company_id column each of their tables carries for multi-tenant
 * readiness — first flagged in SupabaseAccountRepository
 * (docs/SUPABASE_MIGRATION_GUIDE.md Phase B). Extracted here in Phase D
 * once enough repositories needed the identical query/error-message pair
 * that duplicating it further stopped being worth it; Phase B/C's
 * repositories still inline their own copy rather than being retrofitted,
 * since they already shipped and were verified against it.
 *
 * Not cached here — each repository instance caches its own result for its
 * lifetime (a page's worth of reads/writes doesn't need to re-resolve it
 * every call), same as SupabaseAccountRepository already did before this
 * was extracted.
 */
export async function resolveDefaultCompanyId(client: SupabaseClient, callerName: string): Promise<ID> {
  const { data, error } = await client.from('companies').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error(`${callerName}: failed to resolve the company: ${error.message}`);
  if (!data) throw new Error(`${callerName}: no Company exists yet — create one first.`);
  return data.id as ID;
}
