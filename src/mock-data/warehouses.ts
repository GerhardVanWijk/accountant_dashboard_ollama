import type { Warehouse } from '@/types';

function nowISO(): string {
  return new Date().toISOString();
}

/** Seed data for MockWarehouseRepository (src/features/inventory/repositories/). */
export const seedWarehouses: Warehouse[] = [
  {
    id: 'wh_00000001',
    name: 'Main Distribution Centre',
    code: 'JHB-DC',
    address: {
      line1: '48 Industrial Ave',
      city: 'Johannesburg',
      postalCode: '2000',
      country: 'South Africa',
    },
    isDefault: true,
    status: 'active',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'wh_00000002',
    name: 'Cape Town Warehouse',
    code: 'CPT-WH',
    address: {
      line1: '12 Market Street',
      city: 'Cape Town',
      postalCode: '8001',
      country: 'South Africa',
    },
    isDefault: false,
    status: 'active',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'wh_00000003',
    name: 'Durban Depot',
    code: 'DBN-DP',
    address: {
      line1: '7 Harbour Road',
      city: 'Durban',
      postalCode: '4001',
      country: 'South Africa',
    },
    isDefault: false,
    status: 'active',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
];
