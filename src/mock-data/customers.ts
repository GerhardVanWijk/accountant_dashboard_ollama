import type { Customer } from '@/types';

function nowISO(): string {
  return new Date().toISOString();
}

/** Seed data for MockCustomerRepository (src/repositories/mock/). */
export const seedCustomers: Customer[] = [
  {
    id: 'cust_00000001',
    customerNumber: 'CUST-0001',
    name: 'Acme Trading Co.',
    email: 'accounts@acmetrading.example',
    phone: '+27 21 555 0100',
    billingAddress: {
      line1: '12 Market Street',
      city: 'Cape Town',
      postalCode: '8001',
      country: 'South Africa',
    },
    taxNumber: 'VAT4001234567',
    currency: 'ZAR',
    balance: 12500.0,
    status: 'active',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'cust_00000002',
    customerNumber: 'CUST-0002',
    name: 'Northwind Distribution',
    email: 'billing@northwind.example',
    phone: '+27 11 555 0101',
    billingAddress: {
      line1: '48 Industrial Ave',
      city: 'Johannesburg',
      postalCode: '2000',
      country: 'South Africa',
    },
    currency: 'ZAR',
    balance: 0,
    status: 'active',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
];
