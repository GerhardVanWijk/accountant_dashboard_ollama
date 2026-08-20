import type { Supplier } from '@/types';
import type { ISupplierRepository } from '../repositories/ISupplierRepository';
import { MockSupplierRepository } from '../repositories/MockSupplierRepository';
import { hasOpenBills } from '../utils/calculateAging';

export type CreateSupplierDTO = Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Business-logic layer between hooks/components and the repository.
 * Mirrors src/services/customerService.ts's shape (Component -> Hook ->
 * Service -> Repository), kept feature-local per the documented
 * suppliers convention.
 */
export class SupplierService {
  constructor(private readonly repository: ISupplierRepository) {}

  async getSuppliers(): Promise<Supplier[]> {
    return this.repository.getAll();
  }

  async getSupplier(id: string): Promise<Supplier | undefined> {
    return this.repository.getById(id);
  }

  async createSupplier(data: CreateSupplierDTO): Promise<Supplier> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateSupplier(id: string, patch: Partial<Supplier>): Promise<Supplier> {
    return this.repository.update(id, patch);
  }

  /**
   * Enforces the accounts-payable guardrail from suppliers-bee.md
   * ("Never allow hard deletion of a supplier with associated bills,
   * payments, or ledger transactions"). There is no real Bill/PO data
   * yet, so this checks the TEMPORARY mock open-bills dataset owned by
   * calculateAging.ts as a stand-in — once the Purchases module ships
   * real bill/payment/ledger records this guard should be re-pointed at
   * that data instead of being removed.
   */
  async deleteSupplier(id: string): Promise<void> {
    if (hasOpenBills(id)) {
      throw new Error(
        'Cannot permanently delete a supplier with linked financial history. Inactivate the supplier or place it on hold instead.',
      );
    }
    return this.repository.delete(id);
  }

  async setStatus(id: string, status: Supplier['status']): Promise<Supplier> {
    return this.repository.update(id, { status });
  }

  async setOnHold(id: string, onHold: boolean): Promise<Supplier> {
    return this.repository.update(id, { onHold });
  }
}

/**
 * Wires SupplierService to its Phase 1 mock repository. Hooks
 * (see ../hooks/useSuppliers.ts) depend on this singleton instead of
 * importing a repository directly — components never touch repositories
 * per docs/DO_NOT_BREAK.md.
 */
export const supplierService = new SupplierService(new MockSupplierRepository());
