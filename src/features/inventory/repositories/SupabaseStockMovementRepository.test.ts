import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseStockMovementRepository } from './SupabaseStockMovementRepository';
import type { StockMovement } from '@/types';

/**
 * Round-trip coverage for the Inventory Accounting Module columns
 * (migration 0022). The bug this guards: `StockMovementRow` /
 * `rowToStockMovement` silently ignored `source_document_type` /
 * `source_document_id` / `unit_cost` / `total_cost` / `movement_date` /
 * `created_by`, so EVERY `StockMovement` object in the running app had
 * `sourceDocumentType === undefined` — which broke the movement-evidence
 * resolver, the stock-movement drawer, and the Purchase Order "Received"
 * metric (a fully-received PO showed "Received 0" because
 * `m.sourceDocumentType === 'purchase_order'` was never true).
 */

const DB_ROW = {
  id: '0572c2d5-ff4e-44d9-966a-eec1a327c4b2',
  product_id: 'df499aeb-88a0-4815-bbda-ea22e6b1bebc',
  warehouse_id: '692a3d01-9835-4340-b5ab-44fe96067490',
  type: 'goods_received',
  quantity_delta: '40.000',
  unit_cost: '1500.0000',
  total_cost: '60000.00',
  movement_date: '2026-09-09',
  source_document_type: 'purchase_order',
  source_document_id: '3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f',
  source_document_line_id: null,
  reference: 'purchase_order:3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f',
  notes: null,
  created_by: 'system',
  reversal_of_movement_id: null,
  created_at: '2026-09-09T22:08:50.514Z',
  updated_at: '2026-09-09T22:08:50.514Z',
};

function fakeClient() {
  const captured: { table?: string; op?: string; payload?: Record<string, unknown> } = {};
  function result() {
    if (captured.table === 'companies') return { data: { id: 'company-1' }, error: null };
    if (captured.payload) return { data: { ...DB_ROW, ...captured.payload }, error: null };
    return { data: [DB_ROW], error: null };
  }
  function single() {
    if (captured.table === 'companies') return { data: { id: 'company-1' }, error: null };
    if (captured.payload) return { data: { ...DB_ROW, ...captured.payload }, error: null };
    return { data: DB_ROW, error: null };
  }
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(single()),
    single: () => Promise.resolve(single()),
    then: (resolve: (v: unknown) => void) => resolve(result()),
    insert: (payload: Record<string, unknown>) => {
      captured.op = 'insert';
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

describe('SupabaseStockMovementRepository — structured source columns round-trip', () => {
  it('rowToStockMovement maps the migration-0022 columns onto the entity', async () => {
    const { client } = fakeClient();
    const repo = new SupabaseStockMovementRepository(client);
    const [m] = await repo.getAll();
    expect(m.sourceDocumentType).toBe('purchase_order');
    expect(m.sourceDocumentId).toBe('3dcf3f9d-1f9b-4b1e-bb5f-b84ea37fd23f');
    expect(m.sourceDocumentLineId).toBeUndefined();
    expect(m.unitCost).toBe(1500);
    expect(m.totalCost).toBe(60000);
    expect(m.movementDate).toBe('2026-09-09');
    expect(m.createdBy).toBe('system');
    expect(m.quantityDelta).toBe(40);
  });

  it('getById maps the same columns', async () => {
    const { client } = fakeClient();
    const repo = new SupabaseStockMovementRepository(client);
    const m = await repo.getById('0572c2d5-ff4e-44d9-966a-eec1a327c4b2');
    expect(m?.sourceDocumentType).toBe('purchase_order');
    expect(m?.unitCost).toBe(1500);
  });

  it('create() persists the structured source columns from the entity', async () => {
    const { client, captured } = fakeClient();
    const repo = new SupabaseStockMovementRepository(client);
    const entity: StockMovement = {
      id: '',
      createdAt: '',
      updatedAt: '',
      productId: 'p1',
      warehouseId: 'w1',
      type: 'goods_received',
      quantityDelta: 5,
      unitCost: 20,
      totalCost: 100,
      movementDate: '2026-09-10',
      sourceDocumentType: 'purchase_order',
      sourceDocumentId: 'po-1',
    };
    await repo.create(entity);
    expect(captured.payload).toMatchObject({
      source_document_type: 'purchase_order',
      source_document_id: 'po-1',
      unit_cost: 20,
      total_cost: 100,
      movement_date: '2026-09-10',
    });
  });
});
