import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Customer } from '@/types';
import { customerImportAdapter } from './customerImportAdapter';
import { customerService } from '@/features/customers/services/customerService';
import type { ImportRowResult } from '../types';
import type { CustomerImportContext, CustomerImportRow } from './customerImportAdapter';

vi.mock('@/features/customers/services/customerService', () => ({
  customerService: { getCustomers: vi.fn(), createCustomer: vi.fn(), updateCustomer: vi.fn() },
}));

const mockedGetCustomers = customerService.getCustomers as unknown as ReturnType<typeof vi.fn>;
const mockedCreateCustomer = customerService.createCustomer as unknown as ReturnType<typeof vi.fn>;
const mockedUpdateCustomer = customerService.updateCustomer as unknown as ReturnType<typeof vi.fn>;

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return { id: 'cust_1', customerNumber: 'CUST-0001', name: 'Acme Co', currency: 'ZAR', balance: 0, status: 'active', createdAt: '', updatedAt: '', ...overrides };
}

describe('customerImportAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCustomers.mockResolvedValue([]);
  });

  describe('normalizeRow', () => {
    it('accepts a valid row', async () => {
      const ctx = await customerImportAdapter.loadContext();
      const { normalized, messages } = customerImportAdapter.normalizeRow({ name: 'Acme Co', email: 'ap@acme.co.za' }, 2, ctx);
      expect(normalized).toMatchObject({ name: 'Acme Co', email: 'ap@acme.co.za', active: true });
      expect(messages).toEqual([]);
    });

    it('errors when Name is missing', async () => {
      const ctx = await customerImportAdapter.loadContext();
      const { normalized, messages } = customerImportAdapter.normalizeRow({}, 2, ctx);
      expect(normalized).toBeUndefined();
      expect(messages.some((m) => m.field === 'name' && m.severity === 'error')).toBe(true);
    });

    it('warns and leaves paymentTerms unset for an unrecognized value', async () => {
      const ctx = await customerImportAdapter.loadContext();
      const { normalized, messages } = customerImportAdapter.normalizeRow({ name: 'Acme Co', paymentTerms: 'Whenever' }, 2, ctx);
      expect(normalized?.paymentTerms).toBeUndefined();
      expect(messages.some((m) => m.severity === 'warning')).toBe(true);
    });
  });

  describe('detectDuplicates', () => {
    it('flags an existing customer code as duplicate', async () => {
      mockedGetCustomers.mockResolvedValue([makeCustomer({ customerNumber: 'CUST-0001' })]);
      const ctx = await customerImportAdapter.loadContext();
      const rows: ImportRowResult<CustomerImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { customerNumber: 'CUST-0001', name: 'Acme Co', active: true }, severity: 'valid', messages: [] },
      ];
      expect(customerImportAdapter.detectDuplicates(rows, ctx)[0].severity).toBe('duplicate');
    });

    it('flags an existing email as duplicate', async () => {
      mockedGetCustomers.mockResolvedValue([makeCustomer({ email: 'ap@acme.co.za' })]);
      const ctx = await customerImportAdapter.loadContext();
      const rows: ImportRowResult<CustomerImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { name: 'Acme Co', email: 'ap@acme.co.za', active: true }, severity: 'valid', messages: [] },
      ];
      expect(customerImportAdapter.detectDuplicates(rows, ctx)[0].severity).toBe('duplicate');
    });
  });

  describe('execute', () => {
    it('creates a new customer with an auto-generated code when none is supplied', async () => {
      mockedCreateCustomer.mockResolvedValue(makeCustomer());
      const ctx: CustomerImportContext = { existingByNumber: new Map(), existingByEmail: new Map(), nextSequence: 1 };
      const rows: ImportRowResult<CustomerImportRow>[] = [{ rowNumber: 2, raw: {}, normalized: { name: 'Acme Co', active: true }, severity: 'valid', messages: [] }];
      const summary = await customerImportAdapter.execute(rows, ctx, { duplicateStrategy: 'skip', actorUserId: 'user_1', params: {} });
      expect(summary.imported).toBe(1);
      expect(mockedCreateCustomer).toHaveBeenCalledWith(expect.objectContaining({ customerNumber: 'CUST-0001', name: 'Acme Co', currency: 'ZAR', balance: 0 }));
    });

    it('does not post to the GL — it only calls customerService, never journalEntryService/accountingService', async () => {
      mockedCreateCustomer.mockResolvedValue(makeCustomer());
      const ctx: CustomerImportContext = { existingByNumber: new Map(), existingByEmail: new Map(), nextSequence: 1 };
      const rows: ImportRowResult<CustomerImportRow>[] = [{ rowNumber: 2, raw: {}, normalized: { name: 'Acme Co', active: true }, severity: 'valid', messages: [] }];
      await customerImportAdapter.execute(rows, ctx, { duplicateStrategy: 'skip', actorUserId: 'user_1', params: {} });
      const createArg = mockedCreateCustomer.mock.calls[0][0];
      expect(createArg).not.toHaveProperty('journalEntryId');
    });

    it('skips a duplicate row when the strategy is "skip"', async () => {
      const existing = makeCustomer();
      const ctx: CustomerImportContext = { existingByNumber: new Map([['cust-0001', existing]]), existingByEmail: new Map(), nextSequence: 2 };
      const rows: ImportRowResult<CustomerImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { customerNumber: 'CUST-0001', name: 'Acme Co', active: true }, severity: 'duplicate', messages: [] },
      ];
      const summary = await customerImportAdapter.execute(rows, ctx, { duplicateStrategy: 'skip', actorUserId: 'user_1', params: {} });
      expect(summary.skipped).toBe(1);
      expect(mockedCreateCustomer).not.toHaveBeenCalled();
    });

    it('updates an existing customer when the strategy is "update"', async () => {
      const existing = makeCustomer();
      mockedUpdateCustomer.mockResolvedValue(existing);
      const ctx: CustomerImportContext = { existingByNumber: new Map([['cust-0001', existing]]), existingByEmail: new Map(), nextSequence: 2 };
      const rows: ImportRowResult<CustomerImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { customerNumber: 'CUST-0001', name: 'Acme Co Ltd', active: true }, severity: 'duplicate', messages: [] },
      ];
      const summary = await customerImportAdapter.execute(rows, ctx, { duplicateStrategy: 'update', actorUserId: 'user_1', params: {} });
      expect(summary.updated).toBe(1);
      expect(mockedUpdateCustomer).toHaveBeenCalledWith('cust_1', expect.objectContaining({ name: 'Acme Co Ltd' }));
    });
  });
});
