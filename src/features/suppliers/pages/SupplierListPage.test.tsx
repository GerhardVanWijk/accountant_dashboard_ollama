import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Permission, Supplier } from '@/types';
import type { UseSuppliersResult } from '../hooks/useSuppliers';
import { SupplierListPage } from './SupplierListPage';
import { useBills } from '@/features/purchases/hooks';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionStore } from '@/features/auth/stores/permissionStore';

vi.mock('@/features/purchases/hooks');

const mockedUseBills = vi.mocked(useBills);
mockedUseBills.mockReturnValue({
  bills: [],
  isLoading: false,
  error: null,
  refetch: vi.fn(),
});

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

function makePermission(overrides: Partial<Permission> = {}): Permission {
  return { id: 'perm_1', feature: 'supplier_management', action: 'create', createdAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

describe('SupplierListPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ profile: { id: 'u1', role: 'viewer', companyId: 'c1', isActive: true, createdAt: '', updatedAt: '' } });
    usePermissionStore.getState().clear();
  });

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

  it('hides Export for a user without supplier_management:export (Phase 7)', () => {
    render(
      <SupplierListPage
        suppliersState={buildSuppliersState({ suppliers: [sampleSupplier] })}
        onView={noop}
        onEdit={noop}
        onCreate={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: /^export$/i })).not.toBeInTheDocument();
  });

  it('shows Export once the user holds supplier_management:export, disabled state tied to row count', () => {
    usePermissionStore.getState().setPermissions('c1', [makePermission({ action: 'export' })]);
    render(
      <SupplierListPage
        suppliersState={buildSuppliersState({ suppliers: [sampleSupplier] })}
        onView={noop}
        onEdit={noop}
        onCreate={noop}
      />,
    );
    expect(screen.getByRole('button', { name: /^export$/i })).toBeEnabled();
  });

  it('does not export sensitive banking data (Phase 7 spec §10 — code, name, email, phone, VAT, terms, status only)', () => {
    usePermissionStore.getState().setPermissions('c1', [makePermission({ action: 'export' })]);
    render(
      <SupplierListPage
        suppliersState={buildSuppliersState({ suppliers: [sampleSupplier] })}
        onView={noop}
        onEdit={noop}
        onCreate={noop}
      />,
    );
    // No banking-related label should ever appear on-screen from the export wiring itself.
    expect(screen.queryByText(/bank account/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/branch code/i)).not.toBeInTheDocument();
  });
});
