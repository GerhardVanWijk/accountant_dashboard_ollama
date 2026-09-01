import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Supplier } from '@/types';
import { supplierImportAdapter } from './supplierImportAdapter';
import { supplierService } from '@/features/suppliers/services/supplierService';
import type { ImportRowResult } from '../types';
import type { SupplierImportContext, SupplierImportRow } from './supplierImportAdapter';

vi.mock('@/features/suppliers/services/supplierService', () => ({
  supplierService: { getSuppliers: vi.fn(), createSupplier: vi.fn(), updateSupplier: vi.fn() },
}));

const mockedGetSuppliers = supplierService.getSuppliers as unknown as ReturnType<typeof vi.fn>;
const mockedCreateSupplier = supplierService.createSupplier as unknown as ReturnType<typeof vi.fn>;
const mockedUpdateSupplier = supplierService.updateSupplier as unknown as ReturnType<typeof vi.fn>;

function makeSupplier(overrides: Partial<Supplier> = {}): Supplier {
  return { id: 'sup_1', supplierNumber: 'SUPP-0001', name: 'Acme Supplies', currency: 'ZAR', balance: 0, status: 'active', createdAt: '', updatedAt: '', ...overrides };
}

describe('supplierImportAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSuppliers.mockResolvedValue([]);
  });

  describe('normalizeRow', () => {
    it('accepts a valid row', async () => {
      const ctx = await supplierImportAdapter.loadContext();
      const { normalized, messages } = supplierImportAdapter.normalizeRow({ name: 'Acme Supplies' }, 2, ctx);
      expect(normalized).toMatchObject({ name: 'Acme Supplies', active: true });
      expect(messages).toEqual([]);
    });

    it('errors when Name is missing', async () => {
      const ctx = await supplierImportAdapter.loadContext();
      const { normalized, messages } = supplierImportAdapter.normalizeRow({}, 2, ctx);
      expect(normalized).toBeUndefined();
      expect(messages.some((m) => m.field === 'name' && m.severity === 'error')).toBe(true);
    });
  });

  describe('detectDuplicates', () => {
    it('flags an existing supplier code as duplicate', async () => {
      mockedGetSuppliers.mockResolvedValue([makeSupplier()]);
      const ctx = await supplierImportAdapter.loadContext();
      const rows: ImportRowResult<SupplierImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { supplierNumber: 'SUPP-0001', name: 'Acme Supplies', active: true }, severity: 'valid', messages: [] },
      ];
      expect(supplierImportAdapter.detectDuplicates(rows, ctx)[0].severity).toBe('duplicate');
    });

    it('flags an existing supplier name as duplicate', async () => {
      mockedGetSuppliers.mockResolvedValue([makeSupplier()]);
      const ctx = await supplierImportAdapter.loadContext();
      const rows: ImportRowResult<SupplierImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { name: 'Acme Supplies', active: true }, severity: 'valid', messages: [] },
      ];
      expect(supplierImportAdapter.detectDuplicates(rows, ctx)[0].severity).toBe('duplicate');
    });
  });

  describe('execute', () => {
    it('creates a new supplier with an auto-generated code when none is supplied', async () => {
      mockedCreateSupplier.mockResolvedValue(makeSupplier());
      const ctx: SupplierImportContext = { existingByNumber: new Map(), existingByName: new Map(), nextSequence: 1 };
      const rows: ImportRowResult<SupplierImportRow>[] = [{ rowNumber: 2, raw: {}, normalized: { name: 'Acme Supplies', active: true }, severity: 'valid', messages: [] }];
      const summary = await supplierImportAdapter.execute(rows, ctx, { duplicateStrategy: 'skip', actorUserId: 'user_1', params: {} });
      expect(summary.imported).toBe(1);
      expect(mockedCreateSupplier).toHaveBeenCalledWith(expect.objectContaining({ supplierNumber: 'SUPP-0001', name: 'Acme Supplies' }));
    });

    it('never includes bank details in the create/update payload — imports cannot set them', async () => {
      mockedCreateSupplier.mockResolvedValue(makeSupplier());
      const ctx: SupplierImportContext = { existingByNumber: new Map(), existingByName: new Map(), nextSequence: 1 };
      const rows: ImportRowResult<SupplierImportRow>[] = [{ rowNumber: 2, raw: {}, normalized: { name: 'Acme Supplies', active: true }, severity: 'valid', messages: [] }];
      await supplierImportAdapter.execute(rows, ctx, { duplicateStrategy: 'skip', actorUserId: 'user_1', params: {} });
      expect(mockedCreateSupplier.mock.calls[0][0]).not.toHaveProperty('bankDetails');
    });

    it('updates an existing supplier when the strategy is "update", preserving its bank details', async () => {
      const existing = makeSupplier({ bankDetails: { bankName: 'ABC Bank', branchCode: '000000', accountNumber: '12345' } });
      mockedUpdateSupplier.mockResolvedValue(existing);
      const ctx: SupplierImportContext = { existingByNumber: new Map([['supp-0001', existing]]), existingByName: new Map(), nextSequence: 2 };
      const rows: ImportRowResult<SupplierImportRow>[] = [
        { rowNumber: 2, raw: {}, normalized: { supplierNumber: 'SUPP-0001', name: 'Acme Supplies Ltd', active: true }, severity: 'duplicate', messages: [] },
      ];
      const summary = await supplierImportAdapter.execute(rows, ctx, { duplicateStrategy: 'update', actorUserId: 'user_1', params: {} });
      expect(summary.updated).toBe(1);
      const patch = mockedUpdateSupplier.mock.calls[0][1];
      expect(patch).not.toHaveProperty('bankDetails');
      expect(patch.name).toBe('Acme Supplies Ltd');
    });
  });
});
