import type { Bill } from '@/types';
import type { IBillRepository } from '@/repositories/IBillRepository';

export type CreateBillDTO = Omit<Bill, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Business-logic layer for supplier bills.
 * Handles bill creation, updates, status changes, and GL posting.
 */
export class BillService {
  constructor(private readonly repository: IBillRepository) {}

  async getBills(): Promise<Bill[]> {
    return this.repository.getAll();
  }

  async getBill(id: string): Promise<Bill | undefined> {
    return this.repository.getById(id);
  }

  async createBill(data: CreateBillDTO): Promise<Bill> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateBill(id: string, patch: Partial<Bill>): Promise<Bill> {
    return this.repository.update(id, patch);
  }

  async deleteBill(id: string): Promise<void> {
    return this.repository.delete(id);
  }

  /**
   * Posts a bill to accounts payable.
   * Transitions status from 'draft' to 'awaiting_payment'.
   * In a real system, this would trigger GL posting (debit Expense, credit AP).
   */
  async postBill(id: string): Promise<Bill> {
    const bill = await this.repository.getById(id);
    if (!bill) {
      throw new Error(`Bill "${id}" not found`);
    }

    // TODO: Call GL posting service when available
    // await accountingService.postJournalEntry({
    //   date: bill.issueDate,
    //   description: `Bill ${bill.billNumber} - Supplier`,
    //   entries: [
    //     { account: 'Expense', debit: bill.subtotal, credit: 0 },
    //     { account: 'Input VAT', debit: bill.taxTotal, credit: 0 },
    //     { account: 'AP', debit: 0, credit: bill.total },
    //   ]
    // });

    return this.repository.update(id, { status: 'awaiting_payment' });
  }

  /**
   * Records a payment against a bill.
   */
  async recordPayment(id: string, amount: number): Promise<Bill> {
    const bill = await this.repository.getById(id);
    if (!bill) {
      throw new Error(`Bill "${id}" not found`);
    }

    const newAmountPaid = bill.amountPaid + amount;
    let newStatus: Bill['status'] = bill.status;

    if (newAmountPaid >= bill.total) {
      newStatus = 'paid';
    } else if (newAmountPaid > 0) {
      newStatus = 'partially_paid';
    }

    return this.repository.update(id, {
      amountPaid: newAmountPaid,
      status: newStatus,
    });
  }

  /**
   * Marks a bill as overdue (typically called by a batch job or manually).
   */
  async markAsOverdue(id: string): Promise<Bill> {
    return this.repository.update(id, { status: 'overdue' });
  }

  /**
   * Voids a bill (soft delete - marks as void instead of removing).
   */
  async voidBill(id: string): Promise<Bill> {
    return this.repository.update(id, { status: 'void' });
  }

  /**
   * Get bills by status.
   */
  async getBillsByStatus(status: Bill['status']): Promise<Bill[]> {
    const all = await this.repository.getAll();
    return all.filter((b) => b.status === status);
  }

  /**
   * Get bills for a specific supplier.
   */
  async getBillsBySupplier(supplierId: string): Promise<Bill[]> {
    const all = await this.repository.getAll();
    return all.filter((b) => b.supplierId === supplierId);
  }

  /**
   * Get outstanding bills (not fully paid).
   */
  async getOutstandingBills(): Promise<Bill[]> {
    const all = await this.repository.getAll();
    return all.filter((b) => b.amountPaid < b.total && b.status !== 'void');
  }

  /**
   * Calculate total outstanding amount across all bills.
   */
  async calculateTotalOutstanding(): Promise<number> {
    const bills = await this.getOutstandingBills();
    return bills.reduce((sum, b) => sum + (b.total - b.amountPaid), 0);
  }
}
