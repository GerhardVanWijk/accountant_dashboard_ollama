import type { Supplier } from '@/types';
import type { IRepository } from '@/repositories/IRepository';

/**
 * Supplier-specific repository contract. Extends the generic IRepository
 * so it stays interchangeable with any future backend-backed
 * implementation (e.g. a Supabase/REST-backed SupplierRepository).
 *
 * Per docs/ARCHITECTURE.md, Customer's repository lives at top-level
 * src/repositories/ only as Phase 0's reference-pattern proof — every
 * other feature (this one included) keeps its repository feature-local
 * under src/features/[feature]/repositories/.
 */
export type ISupplierRepository = IRepository<Supplier>;
