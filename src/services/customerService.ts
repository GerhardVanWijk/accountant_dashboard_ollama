import type { Customer } from '@/types';
import type { ICustomerRepository } from '@/repositories/ICustomerRepository';

export type CreateCustomerDTO = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Business-logic layer between hooks/components and the repository.
 * Reference example for the Component -> Hook -> Service -> Repository
 * chain described in docs/ARCHITECTURE.md. Feature bees add their own
 * [feature]Service.ts under src/features/[feature]/services/ following
 * this shape.
 */
export class CustomerService {
  constructor(private readonly repository: ICustomerRepository) {}

  async getCustomers(): Promise<Customer[]> {
    return this.repository.getAll();
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    return this.repository.getById(id);
  }

  async createCustomer(data: CreateCustomerDTO): Promise<Customer> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateCustomer(id: string, patch: Partial<Customer>): Promise<Customer> {
    return this.repository.update(id, patch);
  }

  async deleteCustomer(id: string): Promise<void> {
    return this.repository.delete(id);
  }

  /**
   * Soft-deactivates a customer. Per docs/DO_NOT_BREAK.md and the
   * customers-bee persona, customers are NEVER hard-deleted — status is
   * flipped to 'inactive' instead so historical records stay intact.
   */
  async inactivateCustomer(id: string): Promise<Customer> {
    return this.repository.update(id, { status: 'inactive' });
  }

  /** Restores a previously inactivated customer to 'active'. */
  async activateCustomer(id: string): Promise<Customer> {
    return this.repository.update(id, { status: 'active' });
  }

  /** Toggles credit hold — used by credit control actions on the Customer Hub. */
  async setCreditHold(id: string, creditHold: boolean): Promise<Customer> {
    return this.repository.update(id, { creditHold });
  }
}
