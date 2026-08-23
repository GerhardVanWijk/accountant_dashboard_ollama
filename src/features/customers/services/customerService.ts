import { CustomerService } from '@/services/customerService';
import { SupabaseCustomerRepository } from '@/repositories/SupabaseCustomerRepository';
import { supabase } from '@/config/supabase';

export type { CreateCustomerDTO } from '@/services/customerService';

/**
 * Wires the shared CustomerService to its Supabase repository
 * (docs/SUPABASE_MIGRATION_GUIDE.md Phase D). Hooks (see
 * ../hooks/useCustomers.ts, ../hooks/useCustomer.ts,
 * ../hooks/useCustomerMutations.ts) depend on this singleton instead of
 * importing a repository directly — components never touch repositories
 * per docs/DO_NOT_BREAK.md.
 */
export const customerService = new CustomerService(new SupabaseCustomerRepository(supabase));
