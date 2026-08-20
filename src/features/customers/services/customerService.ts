import { CustomerService } from '@/services/customerService';
import { MockCustomerRepository } from '@/repositories/mock/MockCustomerRepository';

export type { CreateCustomerDTO } from '@/services/customerService';

/**
 * Wires the shared CustomerService to its Phase 0 mock repository.
 * Hooks (see ../hooks/useCustomers.ts, ../hooks/useCustomer.ts,
 * ../hooks/useCustomerMutations.ts) depend on this singleton instead of
 * importing a repository directly — components never touch repositories
 * per docs/DO_NOT_BREAK.md.
 */
export const customerService = new CustomerService(new MockCustomerRepository());
