import { describe, expect, it } from 'vitest';
import { buildKnownDocumentRefs } from './knownDocumentRefs';

describe('buildKnownDocumentRefs', () => {
  it('collects both the id and the human number of every document kind', () => {
    const refs = buildKnownDocumentRefs({
      invoices: [{ id: 'inv-1', invoiceNumber: 'INV-1001' } as never],
      bills: [{ id: 'bill-1', billNumber: 'BILL-2001' } as never],
      transfers: [{ id: 'trf-1', transferNumber: 'TRF-0004' } as never],
      openingStockBatches: [{ id: 'osb-1', batchNumber: 'OSB-0001' } as never],
    });
    expect(refs.has('inv-1')).toBe(true);
    expect(refs.has('INV-1001')).toBe(true);
    expect(refs.has('BILL-2001')).toBe(true);
    expect(refs.has('TRF-0004')).toBe(true);
    expect(refs.has('OSB-0001')).toBe(true);
  });

  it('ignores empty/missing lists and empty values', () => {
    const refs = buildKnownDocumentRefs({
      invoices: [{ id: '', invoiceNumber: undefined } as never],
    });
    expect(refs.size).toBe(0);
  });

  it('returns an empty set when given nothing', () => {
    expect(buildKnownDocumentRefs({}).size).toBe(0);
  });
});
