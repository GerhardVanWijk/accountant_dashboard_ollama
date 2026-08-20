import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Customer } from '@/types';
import { CustomerListPage } from './CustomerListPage';
import { useCustomers } from '../hooks/useCustomers';
import { useCustomerMutations } from '../hooks/useCustomerMutations';

vi.mock('../hooks/useCustomers');
vi.mock('../hooks/useCustomerMutations');

const mockedUseCustomers = vi.mocked(useCustomers);
const mockedUseCustomerMutations = vi.mocked(useCustomerMutations);

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

describe('CustomerListPage', () => {
  beforeEach(() => {
    mockedUseCustomerMutations.mockReturnValue({
      saving: false,
      error: null,
      createCustomer: vi.fn(),
      updateCustomer: vi.fn(),
      inactivateCustomer: vi.fn(),
      activateCustomer: vi.fn(),
      setCreditHold: vi.fn(),
    });
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
});
