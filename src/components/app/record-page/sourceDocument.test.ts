import { describe, it, expect } from 'vitest';
import { isOpaqueReference, resolveSourceDocument } from './sourceDocument';

describe('isOpaqueReference', () => {
  it('flags the September seed machine reference format "<type>:<uuid>"', () => {
    expect(isOpaqueReference('bill:5eed0000-0000-4000-8000-700000000001')).toBe(true);
    expect(isOpaqueReference('invoice:5eed0000-0000-4000-8000-100000000009')).toBe(true);
  });

  it('flags a bare UUID', () => {
    expect(isOpaqueReference('5eed0000-0000-4000-8000-700000000001')).toBe(true);
  });

  it('does not flag a real document number', () => {
    expect(isOpaqueReference('BILL-2031')).toBe(false);
    expect(isOpaqueReference('INV-1072')).toBe(false);
  });

  it('treats an empty / missing reference as opaque (nothing to show)', () => {
    expect(isOpaqueReference('')).toBe(true);
    expect(isOpaqueReference(undefined)).toBe(true);
  });
});

describe('resolveSourceDocument', () => {
  it('resolves the real document number from the caller lookup, never the UUID', () => {
    const resolved = resolveSourceDocument(
      { type: 'bill', id: 'bill-uuid', reference: 'bill:bill-uuid' },
      (type, id) => (type === 'bill' && id === 'bill-uuid' ? 'BILL-2031' : undefined),
    );
    expect(resolved).toMatchObject({
      label: 'Bill',
      number: 'BILL-2031',
      path: '/purchases/bills/bill-uuid',
      previewType: 'bill',
    });
  });

  it('falls back to a non-opaque free-text reference when the lookup misses', () => {
    const resolved = resolveSourceDocument({ type: 'invoice', id: 'x', reference: 'INV-1061' }, () => undefined);
    expect(resolved?.number).toBe('INV-1061');
  });

  it('never surfaces the opaque reference as the number', () => {
    const resolved = resolveSourceDocument(
      { type: 'invoice', id: '5eed0000-0000-4000-8000-100000000009', reference: 'invoice:5eed0000-0000-4000-8000-100000000009' },
      () => undefined,
    );
    expect(resolved?.number).toBeUndefined();
    expect(resolved?.label).toBe('Invoice');
  });

  it('returns no preview type when there is no id to preview', () => {
    const resolved = resolveSourceDocument({ type: 'invoice', reference: 'INV-9' }, () => undefined);
    expect(resolved?.previewType).toBeUndefined();
  });

  it('handles a legacy movement with only a free-text reference and no structured type', () => {
    expect(resolveSourceDocument({ reference: 'GRN-0007' })).toEqual({ label: 'Reference', number: 'GRN-0007' });
    expect(resolveSourceDocument({ reference: 'bill:5eed0000-0000-4000-8000-700000000001' })).toBeUndefined();
  });

  it('maps reversal to a label with no route', () => {
    const resolved = resolveSourceDocument({ type: 'reversal', id: 'r1' }, () => undefined);
    expect(resolved).toMatchObject({ label: 'Reversal' });
    expect(resolved?.path).toBeUndefined();
    expect(resolved?.previewType).toBeUndefined();
  });
});
