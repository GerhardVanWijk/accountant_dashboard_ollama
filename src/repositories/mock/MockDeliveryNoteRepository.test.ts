import { describe, expect, it } from 'vitest';
import type { DeliveryNote } from '@/types';
import { MockDeliveryNoteRepository } from './MockDeliveryNoteRepository';

function makeDeliveryNote(overrides: Partial<DeliveryNote> = {}): DeliveryNote {
  return {
    id: '',
    deliveryNoteNumber: 'DN-1',
    salesOrderId: 'so_1',
    customerId: 'cust_1',
    warehouseId: 'wh_1',
    deliveryDate: '2026-09-05',
    status: 'draft',
    lineItems: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('MockDeliveryNoteRepository (Phase 5C)', () => {
  it('starts empty — no historical Delivery Notes are fabricated for pre-5C fixtures', async () => {
    const repo = new MockDeliveryNoteRepository();
    expect(await repo.getAll()).toEqual([]);
  });

  it('create / getById / update / delete round-trip', async () => {
    const repo = new MockDeliveryNoteRepository();
    const created = await repo.create(makeDeliveryNote());
    expect(created.id).toBeTruthy();
    expect(await repo.getById(created.id)).toEqual(created);

    const updated = await repo.update(created.id, { status: 'posted', journalEntryId: 'je_1' });
    expect(updated.status).toBe('posted');
    expect(updated.journalEntryId).toBe('je_1');
    expect(updated.id).toBe(created.id); // id never changes

    await repo.delete(created.id);
    expect(await repo.getById(created.id)).toBeUndefined();
  });

  it('update throws for an unknown id', async () => {
    const repo = new MockDeliveryNoteRepository();
    await expect(repo.update('ghost', { notes: 'x' })).rejects.toThrow(/not found/i);
  });

  it('getBySalesOrderId filters correctly, ignoring other orders', async () => {
    const repo = new MockDeliveryNoteRepository([
      makeDeliveryNote({ id: 'dn_1', salesOrderId: 'so_1' }),
      makeDeliveryNote({ id: 'dn_2', salesOrderId: 'so_1' }),
      makeDeliveryNote({ id: 'dn_3', salesOrderId: 'so_2' }),
    ]);
    const forSo1 = await repo.getBySalesOrderId('so_1');
    expect(forSo1.map((d) => d.id).sort()).toEqual(['dn_1', 'dn_2']);
  });

  it('getByCustomerId filters correctly, ignoring other customers', async () => {
    const repo = new MockDeliveryNoteRepository([
      makeDeliveryNote({ id: 'dn_1', customerId: 'cust_a' }),
      makeDeliveryNote({ id: 'dn_2', customerId: 'cust_b' }),
    ]);
    expect((await repo.getByCustomerId('cust_a')).map((d) => d.id)).toEqual(['dn_1']);
  });

  it('constructor copies the initial data — mutations never leak into the caller\'s array', async () => {
    const seed = [makeDeliveryNote({ id: 'dn_1' })];
    const repo = new MockDeliveryNoteRepository(seed);
    await repo.update('dn_1', { notes: 'changed' });
    expect(seed[0].notes).toBeUndefined();
  });
});
