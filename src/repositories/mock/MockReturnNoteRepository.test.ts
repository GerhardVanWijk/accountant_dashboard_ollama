import { describe, expect, it } from 'vitest';
import type { ReturnNote } from '@/types';
import { MockReturnNoteRepository } from './MockReturnNoteRepository';

function makeReturnNote(overrides: Partial<ReturnNote> = {}): ReturnNote {
  return {
    id: '',
    returnNoteNumber: 'RN-1',
    deliveryNoteId: 'dn_1',
    salesOrderId: 'so_1',
    customerId: 'cust_1',
    warehouseId: 'wh_1',
    returnDate: '2026-09-05',
    status: 'draft',
    lineItems: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('MockReturnNoteRepository (Phase 5D)', () => {
  it('starts empty — no historical Return Notes are fabricated for pre-5D fixtures', async () => {
    const repo = new MockReturnNoteRepository();
    expect(await repo.getAll()).toEqual([]);
  });

  it('create / getById / update / delete round-trip', async () => {
    const repo = new MockReturnNoteRepository();
    const created = await repo.create(makeReturnNote());
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
    const repo = new MockReturnNoteRepository();
    await expect(repo.update('ghost', { notes: 'x' })).rejects.toThrow(/not found/i);
  });

  it('getByDeliveryNoteId filters correctly, ignoring other deliveries', async () => {
    const repo = new MockReturnNoteRepository([
      makeReturnNote({ id: 'rn_1', deliveryNoteId: 'dn_1' }),
      makeReturnNote({ id: 'rn_2', deliveryNoteId: 'dn_1' }),
      makeReturnNote({ id: 'rn_3', deliveryNoteId: 'dn_2' }),
    ]);
    const forDn1 = await repo.getByDeliveryNoteId('dn_1');
    expect(forDn1.map((r) => r.id).sort()).toEqual(['rn_1', 'rn_2']);
  });

  it('getBySalesOrderId filters correctly, ignoring other orders', async () => {
    const repo = new MockReturnNoteRepository([
      makeReturnNote({ id: 'rn_1', salesOrderId: 'so_1' }),
      makeReturnNote({ id: 'rn_2', salesOrderId: 'so_2' }),
    ]);
    expect((await repo.getBySalesOrderId('so_1')).map((r) => r.id)).toEqual(['rn_1']);
  });

  it('getByCustomerId filters correctly, ignoring other customers', async () => {
    const repo = new MockReturnNoteRepository([
      makeReturnNote({ id: 'rn_1', customerId: 'cust_a' }),
      makeReturnNote({ id: 'rn_2', customerId: 'cust_b' }),
    ]);
    expect((await repo.getByCustomerId('cust_a')).map((r) => r.id)).toEqual(['rn_1']);
  });

  it('constructor copies the initial data — mutations never leak into the caller\'s array', async () => {
    const seed = [makeReturnNote({ id: 'rn_1' })];
    const repo = new MockReturnNoteRepository(seed);
    await repo.update('rn_1', { notes: 'changed' });
    expect(seed[0].notes).toBeUndefined();
  });
});
