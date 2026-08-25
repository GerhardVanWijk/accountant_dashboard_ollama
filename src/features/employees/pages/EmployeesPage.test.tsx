import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Employee } from '@/types';
import { EmployeesPage } from './EmployeesPage';
import { employeeService } from '../services';
import { useAuthStore } from '@/stores/authStore';

vi.mock('../services', () => ({
  employeeService: {
    getEmployees: vi.fn(),
    createEmployee: vi.fn(),
    updateEmployee: vi.fn(),
    deleteEmployee: vi.fn(),
  },
}));

const mockedGetEmployees = employeeService.getEmployees as unknown as ReturnType<typeof vi.fn>;
const mockedCreateEmployee = employeeService.createEmployee as unknown as ReturnType<typeof vi.fn>;

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp_1',
    employeeNumber: 'EMP-0001',
    firstName: 'Thandiwe',
    lastName: 'Nkosi',
    employmentType: 'permanent',
    payFrequency: 'monthly',
    status: 'active',
    startDate: '2026-01-01',
    basicSalary: 38000,
    standardAllowances: [],
    standardDeductions: [],
    uifExempt: false,
    currency: 'ZAR',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('EmployeesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // M11: page actions are now gated by useCanAccess('payroll', ...) — an
    // admin bypasses fine-grained permission checks (see docs/PERMISSIONS.md),
    // so tests exercising the create/edit/delete flows sign in as one rather
    // than threading a fine-grained permission grant through every test.
    useAuthStore.setState({ profile: { id: 'u1', role: 'admin', companyId: 'c1', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } });
  });

  it('shows a loading state while employees are being fetched', () => {
    mockedGetEmployees.mockReturnValue(new Promise(() => {}));
    render(<EmployeesPage />);
    expect(screen.getByText(/loading employees/i)).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    mockedGetEmployees.mockRejectedValue(new Error('Network unreachable'));
    render(<EmployeesPage />);
    expect(await screen.findByText(/network unreachable/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no employees', async () => {
    mockedGetEmployees.mockResolvedValue([]);
    render(<EmployeesPage />);
    expect(await screen.findByText(/no employees yet/i)).toBeInTheDocument();
  });

  it('renders employee rows once data loads', async () => {
    mockedGetEmployees.mockResolvedValue([makeEmployee()]);
    render(<EmployeesPage />);
    expect(await screen.findByText('EMP-0001')).toBeInTheDocument();
    expect(screen.getByText('Thandiwe Nkosi')).toBeInTheDocument();
  });

  it('creates a new employee through the form', async () => {
    mockedGetEmployees.mockResolvedValue([]);
    mockedCreateEmployee.mockResolvedValue(makeEmployee());
    render(<EmployeesPage />);
    await screen.findByText(/no employees yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /new employee/i })[0]);
    fireEvent.change(screen.getByLabelText(/employee number/i), { target: { value: 'EMP-0002' } });
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByLabelText(/basic salary/i), { target: { value: '15000' } });

    mockedGetEmployees.mockResolvedValue([makeEmployee({ id: 'emp_2', employeeNumber: 'EMP-0002', firstName: 'Jane', lastName: 'Doe' })]);
    fireEvent.click(screen.getByRole('button', { name: /add employee/i }));

    await waitFor(() => expect(mockedCreateEmployee).toHaveBeenCalledTimes(1));
    expect(mockedCreateEmployee.mock.calls[0][0]).toMatchObject({ employeeNumber: 'EMP-0002', firstName: 'Jane', lastName: 'Doe', basicSalary: 15000 });
  });
});
