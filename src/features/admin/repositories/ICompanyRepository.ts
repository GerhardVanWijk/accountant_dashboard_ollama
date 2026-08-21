import type { Company, ID } from '@/types';

/**
 * Companies are created and updated (settings change routinely) but never
 * deleted — no delete() method. §75 (multi-company) is not implemented
 * (see Company's doc comment in src/types/company.ts), so today this
 * repository realistically holds one row; the contract still models
 * multiple to avoid a rewrite later.
 */
export interface ICompanyRepository {
  getAll(): Promise<Company[]>;
  getById(id: ID): Promise<Company | undefined>;
  create(entity: Company): Promise<Company>;
  update(id: ID, patch: Partial<Company>): Promise<Company>;
}
