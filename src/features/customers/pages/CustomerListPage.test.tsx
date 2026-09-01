import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Customer, Permission } from '@/types';
import { CustomerListPage } from './CustomerListPage';
import { useCustomers } from '../hooks/useCustomers';
import { useCustomerMutations } from '../hooks/useCustomerMutations';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionStore } from '@/features/auth/stores/permissionStore';

vi.mock('../hooks/useCustomers');
vi.mock('../hooks/useCustomerMutations');
vi.mock('@/features/sales/hooks/useInvoices');

const mockedUseCustomers = vi.mocked(useCustomers);
const mockedUseCustomerMutations = vi.mocked(useCustomerMutations);
const mockedUseInvoices = vi.mocked(useInvoices);

function baseCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust_1',
    customerNumber: 'CUST-0001',
    name: 'Acme Trading Co.',
    email: 'accounts@acme.example',
    currency: 'ZAR',
    balance: 1000,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const noopProps = {
  onView: vi.fn(),
  onCreate: vi.fn(),
  onEdit: vi.fn(),
};

function makePermission(overrides: Partial<Permission> = {}): Permission {
  return { id: 'perm_1', feature: 'customer_management', action: 'create', createdAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

describe('CustomerListPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ profile: { id: 'u1', role: 'viewer', companyId: 'c1', isActive: true, createdAt: '', updatedAt: '' } });
    usePermissionStore.getState().clear();
    mockedUseCustomerMutations.mockReturnValue({
      saving: false,
      error: null,
      createCustomer: vi.fn(),
      updateCustomer: vi.fn(),
      inactivateCustomer: vi.fn(),
      activateCustomer: vi.fn(),
      setCreditHold: vi.fn(),
    });
    mockedUseInvoices.mockReturnValue({ invoices: [], loading: false, error: null, refetch: vi.fn() });
  });

  it('shows a loading spinner while fetching', () => {
    mockedUseCustomers.mockReturnValue({ customers: [], loading: true, error: null, refetch: vi.fn() });
    render(<CustomerListPage {...noopProps} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with retry when the fetch fails', () => {
    const refetch = vi.fn();
    mockedUseCustomers.mockReturnValue({
      customers: [],
      loading: false,
      error: new Error('Network unavailable'),
      refetch,
    });
    render(<CustomerListPage {...noopProps} />);
    expect(screen.getByText(/network unavailable/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no customers at all', () => {
    mockedUseCustomers.mockReturnValue({ customers: [], loading: false, error: null, refetch: vi.fn() });
    render(<CustomerListPage {...noopProps} />);
    expect(screen.getByText(/no customers yet/i)).toBeInTheDocument();
  });

  it('renders the customer table when data is present', () => {
    mockedUseCustomers.mockReturnValue({
      customers: [baseCustomer(), baseCustomer({ id: 'cust_2', name: 'Northwind Distribution', customerNumber: 'CUST-0002' })],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<CustomerListPage {...noopProps} />);
    expect(screen.getByText('Acme Trading Co.')).toBeInTheDocument();
    expect(screen.getByText('Northwind Distribution')).toBeInTheDocument();
  });

  it('hides "New customer" for a user without customer_management:create', () => {
    mockedUseCustomers.mockReturnValue({ customers: [baseCustomer()], loading: false, error: null, refetch: vi.fn() });
    render(<CustomerListPage {...noopProps} />);
    expect(screen.queryByRole('button', { name: /new customer/i })).not.toBeInTheDocument();
  });

  it('shows "New customer" once the user holds customer_management:create', () => {
    usePermissionStore.getState().setPermissions('c1', [makePermission()]);
    mockedUseCustomers.mockReturnValue({ customers: [baseCustomer()], loading: false, error: null, refetch: vi.fn() });
    render(<CustomerListPage {...noopProps} />);
    expect(screen.getByRole('button', { name: /new customer/i })).toBeInTheDocument();
  });

  it('an admin sees "New customer" regardless of fine-grained permission assignments', () => {
    useAuthStore.setState({ profile: { id: 'u1', role: 'admin', companyId: 'c1', isActive: true, createdAt: '', updatedAt: '' } });
    mockedUseCustomers.mockReturnValue({ customers: [baseCustomer()], loading: false, error: null, refetch: vi.fn() });
    render(<CustomerListPage {...noopProps} />);
    expect(screen.getByRole('button', { name: /new customer/i })).toBeInTheDocument();
  });

  it('hides Export for a user without customer_management:export (Phase 7)', () => {
    mockedUseCustomers.mockReturnValue({ customers: [baseCustomer()], loading: false, error: null, refetch: vi.fn() });
    render(<CustomerListPage {...noopProps} />);
    expect(screen.queryByRole('button', { name: /^export$/i })).not.toBeInTheDocument();
  });

  it('shows Export once the user holds customer_management:export, disabled state tied to row count', () => {
    usePermissionStore.getState().setPermissions('c1', [makePermission({ action: 'export' })]);
    mockedUseCustomers.mockReturnValue({ customers: [baseCustomer()], loading: false, error: null, refetch: vi.fn() });
    render(<CustomerListPage {...noopProps} />);
    expect(screen.getByRole('button', { name: /^export$/i })).toBeEnabled();
  });
});
