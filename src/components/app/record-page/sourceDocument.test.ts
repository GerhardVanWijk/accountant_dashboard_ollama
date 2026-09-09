import { describe, it, expect } from 'vitest';
import { isOpaqueReference, parseLegacyReference, resolveSourceDocument } from './sourceDocument';

describe('isOpaqueReference', () => {
  it('flags the September seed machine reference format "<type>:<uuid>"', () => {
    expect(isOpaqueReference('bill:5eed0000-0000-4000-8000-700000000001')).toBe(true);
    expect(isOpaqueReference('invoice:5eed0000-0000-4000-8000-100000000009')).toBe(true);
    expect(isOpaqueReference('purchase_order:3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f')).toBe(true);
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

describe('parseLegacyReference', () => {
  it('recovers { type, id } from a "<prefix>:<uuid>" reference', () => {
    expect(parseLegacyReference('purchase_order:3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f')).toEqual({
      type: 'purchase_order',
      id: '3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f',
    });
    expect(parseLegacyReference('bill:5eed0000-0000-4000-8000-700000000001')).toEqual({
      type: 'bill',
      id: '5eed0000-0000-4000-8000-700000000001',
    });
  });

  it('maps alternate prefixes to the canonical source type', () => {
    expect(parseLegacyReference('supplier_invoice:3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f')?.type).toBe('bill');
    expect(parseLegacyReference('purchase_order_receipt:3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f')?.type).toBe('purchase_order');
  });

  it('returns undefined for a real document number or unknown prefix', () => {
    expect(parseLegacyReference('GRN-0007')).toBeUndefined();
    expect(parseLegacyReference('mystery:3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f')).toBeUndefined();
    expect(parseLegacyReference(undefined)).toBeUndefined();
  });
});

describe('resolveSourceDocument', () => {
  it('resolves the real document number from the caller lookup, never the UUID', () => {
    const resolved = resolveSourceDocument(
      { type: 'bill', id: 'bill-uuid', reference: 'bill:bill-uuid' },
      (type, id) => (type === 'bill' && id === 'bill-uuid' ? 'SI-2031' : undefined),
    );
    expect(resolved).toMatchObject({
      label: 'Supplier invoice',
      number: 'SI-2031',
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

  it('recovers a linkable source from a legacy "purchase_order:<uuid>" reference with no structured type', () => {
    const resolved = resolveSourceDocument(
      { reference: 'purchase_order:3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f' },
      (type, id) => (type === 'purchase_order' && id === '3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f' ? 'PO-2026-0005' : undefined),
    );
    expect(resolved).toMatchObject({
      type: 'purchase_order',
      id: '3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f',
      label: 'Purchase order',
      number: 'PO-2026-0005',
      path: '/purchases/orders/3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f',
      fromLegacyReference: true,
    });
  });

  it('keeps a plain free-text reference visible when no structured type can be recovered', () => {
    expect(resolveSourceDocument({ reference: 'GRN-0007' })).toMatchObject({ label: 'Reference', number: 'GRN-0007' });
  });

  it('exposes the raw reference only as technicalReference, never as the primary number', () => {
    const resolved = resolveSourceDocument(
      { type: 'purchase_order', id: '3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f', reference: 'purchase_order:3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f' },
      () => undefined,
    );
    expect(resolved?.number).toBeUndefined();
    expect(resolved?.technicalReference).toBe('purchase_order:3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f');
  });

  it('maps reversal to a label with no route', () => {
    const resolved = resolveSourceDocument({ type: 'reversal', id: 'r1' }, () => undefined);
    expect(resolved).toMatchObject({ label: 'Reversal' });
    expect(resolved?.path).toBeUndefined();
    expect(resolved?.previewType).toBeUndefined();
  });
});
