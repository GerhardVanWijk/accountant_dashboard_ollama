import type { StockMovement } from '@/types';

function nowISO(): string {
  return new Date().toISOString();
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `stkmv_${String(counter).padStart(8, '0')}`;
}

/**
 * Seed data for MockStockMovementRepository — the perpetual-inventory
 * ledger (docs/INVENTORY_DOMAIN.md). Every product's `quantityOnHand` in
 * src/mock-data/products.ts is DERIVED by summing these entries (see the
 * `sumQuantityOnHand` helper there), never hand-typed, so seed data stays
 * internally consistent with the ledger by construction.
 *
 * Entries are grouped per product below; each group nets to that product's
 * intended on-hand quantity. Products prod_00000017/prod_00000018 are
 * non-stock services (trackInventory: false) and intentionally have no
 * movements.
 */
export const seedStockMovements: StockMovement[] = [
  // P1 Ballpoint Pen (Box of 50) — target 150, single warehouse
  { id: nextId(), productId: 'prod_00000001', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 100, reference: 'STK-OPEN-0001', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000001', warehouseId: 'wh_00000001', type: 'goods_received', quantityDelta: 80, reference: 'GRN-2201', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000001', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -30, reference: 'INV-3301', createdAt: nowISO(), updatedAt: nowISO() },

  // P2 A4 Copy Paper (Ream) — target 40
  { id: nextId(), productId: 'prod_00000002', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 60, reference: 'STK-OPEN-0002', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000002', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -20, reference: 'INV-3302', createdAt: nowISO(), updatedAt: nowISO() },

  // P3 Stapler Heavy Duty — target 60
  { id: nextId(), productId: 'prod_00000003', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 50, reference: 'STK-OPEN-0003', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000003', warehouseId: 'wh_00000001', type: 'goods_received', quantityDelta: 20, reference: 'GRN-2203', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000003', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -10, reference: 'INV-3303', createdAt: nowISO(), updatedAt: nowISO() },

  // P4 32GB USB Flash Drive — target 90 total, split wh1=70 / wh3=20 via transfer
  { id: nextId(), productId: 'prod_00000004', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 100, reference: 'STK-OPEN-0004', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000004', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -10, reference: 'INV-3304', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000004', warehouseId: 'wh_00000001', type: 'transfer_out', quantityDelta: -20, reference: 'TRF-1004', notes: 'Rebalance to Durban Depot', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000004', warehouseId: 'wh_00000003', type: 'transfer_in', quantityDelta: 20, reference: 'TRF-1004', notes: 'Rebalance from Main Distribution Centre', createdAt: nowISO(), updatedAt: nowISO() },

  // P5 Wireless Mouse — target 45
  { id: nextId(), productId: 'prod_00000005', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 60, reference: 'STK-OPEN-0005', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000005', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -15, reference: 'INV-3305', createdAt: nowISO(), updatedAt: nowISO() },

  // P6 Wireless Keyboard — target 8 (low stock: reorderLevel 10)
  { id: nextId(), productId: 'prod_00000006', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 30, reference: 'STK-OPEN-0006', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000006', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -22, reference: 'INV-3306', createdAt: nowISO(), updatedAt: nowISO() },

  // P7 1TB External Hard Drive — target 0 (out of stock: reorderLevel 8)
  { id: nextId(), productId: 'prod_00000007', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 15, reference: 'STK-OPEN-0007', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000007', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -15, reference: 'INV-3307', createdAt: nowISO(), updatedAt: nowISO() },

  // P8 Instant Coffee 750g — target 55
  { id: nextId(), productId: 'prod_00000008', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 80, reference: 'STK-OPEN-0008', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000008', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -25, reference: 'INV-3308', createdAt: nowISO(), updatedAt: nowISO() },

  // P9 Rooibos Tea (100 bags) — target 65
  { id: nextId(), productId: 'prod_00000009', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 90, reference: 'STK-OPEN-0009', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000009', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -25, reference: 'INV-3309', createdAt: nowISO(), updatedAt: nowISO() },

  // P10 Bottled Water 500ml (Case of 24) — target 18 (low stock: reorderLevel 30)
  { id: nextId(), productId: 'prod_00000010', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 50, reference: 'STK-OPEN-0010', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000010', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -32, reference: 'INV-3310', createdAt: nowISO(), updatedAt: nowISO() },

  // P11 Hand Sanitiser 5L — target 35
  { id: nextId(), productId: 'prod_00000011', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 50, reference: 'STK-OPEN-0011', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000011', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -15, reference: 'INV-3311', createdAt: nowISO(), updatedAt: nowISO() },

  // P12 Disinfectant Wipes (Pack of 80) — target 0 (out of stock: reorderLevel 15)
  { id: nextId(), productId: 'prod_00000012', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 20, reference: 'STK-OPEN-0012', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000012', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -20, reference: 'INV-3312', createdAt: nowISO(), updatedAt: nowISO() },

  // P13 Bin Liners 60L (Roll of 50) — target 22, includes an adjustment (damage write-off)
  { id: nextId(), productId: 'prod_00000013', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 40, reference: 'STK-OPEN-0013', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000013', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -15, reference: 'INV-3313', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000013', warehouseId: 'wh_00000001', type: 'adjustment', quantityDelta: -3, reference: 'ADJ-4013', notes: 'Water-damaged stock written off during shelving audit', createdAt: nowISO(), updatedAt: nowISO() },

  // P14 Medium Shipping Box — target 480 total, split wh1=400 / wh2=80 via transfer
  { id: nextId(), productId: 'prod_00000014', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 600, reference: 'STK-OPEN-0014', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000014', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -120, reference: 'INV-3314', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000014', warehouseId: 'wh_00000001', type: 'transfer_out', quantityDelta: -80, reference: 'TRF-1014', notes: 'Rebalance to Cape Town Warehouse', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000014', warehouseId: 'wh_00000002', type: 'transfer_in', quantityDelta: 80, reference: 'TRF-1014', notes: 'Rebalance from Main Distribution Centre', createdAt: nowISO(), updatedAt: nowISO() },

  // P15 Packing Tape 48mm — target 150
  { id: nextId(), productId: 'prod_00000015', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 200, reference: 'STK-OPEN-0015', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000015', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -50, reference: 'INV-3315', createdAt: nowISO(), updatedAt: nowISO() },

  // P16 Bubble Wrap 10m Roll — target 12 (low stock: reorderLevel 20)
  { id: nextId(), productId: 'prod_00000016', warehouseId: 'wh_00000001', type: 'opening', quantityDelta: 40, reference: 'STK-OPEN-0016', createdAt: nowISO(), updatedAt: nowISO() },
  { id: nextId(), productId: 'prod_00000016', warehouseId: 'wh_00000001', type: 'sale', quantityDelta: -28, reference: 'INV-3316', createdAt: nowISO(), updatedAt: nowISO() },
];
