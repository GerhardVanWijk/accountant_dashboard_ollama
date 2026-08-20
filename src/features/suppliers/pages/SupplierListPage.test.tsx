import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Supplier } from '@/types';
import type { UseSuppliersResult } from '../hooks/useSuppliers';
import { SupplierListPage } from './SupplierListPage';

function buildSuppliersState(overrides: Partial<UseSuppliersResult> = {}): UseSuppliersResult {
  return {
    suppliers: [],
    loading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
    createSupplier: vi.fn(),
    updateSupplier: vi.fn(),
    deleteSupplier: vi.fn(),
    setStatus: vi.fn(),
    setOnHold: vi.fn(),
    ...overrides,
  };
}

const sampleSupplier: Supplier = {
  id: 'sup_test_001',
  supplierNumber: 'SUP-TEST-001',
  name: 'Test Vendor Co.',
  email: 'billing@testvendor.example',
  currency: 'ZAR',
  balance: 1000,
  creditLimit: 5000,
  category: 'Services',
  status: 'active',
  onHold: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const noop = () => undefined;

describe('SupplierListPage', () => {
  it('shows a loading state', () => {
    render(
      <SupplierListPage
        suppliersState={buildSuppliersState({ loading: true })}
        onView={noop}
        onEdit={noop}
        onCreate={noop}
      />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with a retry action', () => {
    render(
      <SupplierListPage
        suppliersState={buildSuppliersState({ error: new Error('Network down') })}
        onView={noop}
        onEdit={noop}
        onCreate={noop}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/network down/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no suppliers', () => {
    render(
      <SupplierListPage suppliersState={buildSuppliersState({ suppliers: [] })} onView={noop} onEdit={noop} onCreate={noop} />,
    );
    expect(screen.getByText(/no suppliers yet/i)).toBeInTheDocument();
  });

  it('renders supplier rows once data has loaded', () => {
    render(
      <SupplierListPage
        suppliersState={buildSuppliersState({ suppliers: [sampleSupplier] })}
        onView={noop}
        onEdit={noop}
        onCreate={noop}
      />,
    );
    expect(screen.getByText('Test Vendor Co.')).toBeInTheDocument();
    expect(screen.getByText('SUP-TEST-001')).toBeInTheDocument();
  });

  it('filters rows by the search box', () => {
    const other: Supplier = { ...sampleSupplier, id: 'sup_test_002', supplierNumber: 'SUP-TEST-002', name: 'Other Vendor' };
    render(
      <SupplierListPage
        suppliersState={buildSuppliersState({ suppliers: [sampleSupplier, other] })}
        onView={noop}
        onEdit={noop}
        onCreate={noop}
      />,
    );
    expect(screen.getByText('Test Vendor Co.')).toBeInTheDocument();
    expect(screen.getByText('Other Vendor')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search suppliers/i), { target: { value: 'Other' } });

    expect(screen.queryByText('Test Vendor Co.')).not.toBeInTheDocument();
    expect(screen.getByText('Other Vendor')).toBeInTheDocument();
  });
});
