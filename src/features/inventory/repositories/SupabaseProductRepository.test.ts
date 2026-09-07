import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseProductRepository } from './SupabaseProductRepository';
import type { Product } from '@/types';

/**
 * Round-trip coverage for `products.category_id` (+ the sales/purchase
 * description and per-product account-override columns). The bug this
 * guards: the repository's `ProductRow` / `rowToProduct` / `productToRow`
 * silently ignoring `category_id`, so the running app's `Product` objects
 * always had `categoryId === undefined` even when the DB row was linked —
 * which broke the Categories page counts, the New/Edit Product category
 * field, and the product → category → generic account resolution.
 */

const DB_ROW = {
  id: 'p1',
  sku: 'CON-001',
  name: 'Black Toner Cartridge',
  description: null,
  type: 'good',
  unit_price: 1249,
  cost_price: 783.08,
  tax_rate_id: null,
  track_inventory: true,
  quantity_on_hand: 170,
  reorder_level: null,
  status: 'active',
  barcode: null,
  uom: 'EA',
  category: 'Consumables',
  category_id: 'cat-consumables',
  valuation_method: 'weighted_average',
  sales_description: 'Black toner, high yield',
  purchase_description: null,
  sales_account_id: null,
  inventory_account_id: null,
  cogs_account_id: null,
  purchase_account_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

/** Minimal Supabase client fake: captures the write payload, echoes a row back. */
function fakeClient() {
  const captured: { table?: string; op?: string; payload?: Record<string, unknown> } = {};

  function result() {
    if (captured.table === 'companies') return { data: { id: 'company-1' }, error: null };
    if (captured.payload) return { data: { ...DB_ROW, ...captured.payload }, error: null };
    return { data: [DB_ROW], error: null };
  }

  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(result()),
    single: () => Promise.resolve(result()),
    then: (resolve: (v: unknown) => void) => resolve(result()),
    insert: (payload: Record<string, unknown>) => {
      captured.op = 'insert';
      captured.payload = payload;
      return builder;
    },
    update: (payload: Record<string, unknown>) => {
      captured.op = 'update';
      captured.payload = payload;
      return builder;
    },
  };

  const client = {
    from: vi.fn((table: string) => {
      captured.table = table;
      captured.op = undefined;
      captured.payload = undefined;
      return builder;
    }),
  } as unknown as SupabaseClient;
  return { client, captured };
}

function makeProduct(over: Partial<Product> = {}): Product {
  return {
    id: '',
    sku: 'NEW-1',
    name: 'New product',
    type: 'good',
    unitPrice: 10,
    costPrice: 5,
    trackInventory: true,
    quantityOnHand: 0,
    status: 'active',
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

describe('SupabaseProductRepository — category_id round-trip', () => {
  it('rowToProduct maps category_id → categoryId (and the extended columns)', async () => {
    const { client } = fakeClient();
    const repo = new SupabaseProductRepository(client);
    const [p] = await repo.getAll();
    expect(p.categoryId).toBe('cat-consumables');
    expect(p.category).toBe('Consumables');
    expect(p.salesDescription).toBe('Black toner, high yield');
    expect(p.purchaseDescription).toBeUndefined();
  });

  it('create() writes category_id from the entity', async () => {
    const { client, captured } = fakeClient();
    const repo = new SupabaseProductRepository(client);
    await repo.create(makeProduct({ categoryId: 'cat-furniture', category: 'Furniture' }));
    expect(captured.payload).toMatchObject({ category_id: 'cat-furniture', category: 'Furniture' });
  });

  it('update() writes category_id, and clearing it sends null', async () => {
    const { client, captured } = fakeClient();
    const repo = new SupabaseProductRepository(client);
    await repo.update('p1', { categoryId: 'cat-printers' });
    expect(captured.payload).toMatchObject({ category_id: 'cat-printers' });

    await repo.update('p1', { categoryId: undefined, category: undefined });
    // `undefined` in the patch means "not provided" → not written; the form
    // always sends an explicit value, so an explicit clear arrives as ''.
    await repo.update('p1', { categoryId: '' as unknown as undefined });
    expect(captured.payload).toHaveProperty('category_id', null);
  });

  it('does not write category_id when the patch omits it', async () => {
    const { client, captured } = fakeClient();
    const repo = new SupabaseProductRepository(client);
    await repo.update('p1', { unitPrice: 99 });
    expect(captured.payload).not.toHaveProperty('category_id');
  });
});
