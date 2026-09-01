import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Company } from '@/types';
import { PrintableReport } from './PrintableReport';
import { useCompany } from '@/features/admin/hooks/useCompany';
import type { ExportDataset } from '../types';

vi.mock('@/features/admin/hooks/useCompany', () => ({
  useCompany: vi.fn(),
}));

const mockedUseCompany = useCompany as unknown as ReturnType<typeof vi.fn>;

interface Row {
  sku: string;
  qty: number;
}

const rows: Row[] = [
  { sku: 'PEN-1', qty: 10 },
  { sku: 'PEN-2', qty: 5 },
];

function makeDataset(overrides: Partial<ExportDataset<Row>> = {}): ExportDataset<Row> {
  return {
    title: 'Inventory Stock on Hand',
    subtitle: 'As at 1 September 2026',
    filters: [{ label: 'Warehouse', value: 'Main Warehouse' }],
    columns: [
      { key: 'sku', header: 'SKU', accessor: (r) => r.sku },
      { key: 'qty', header: 'Qty', accessor: (r) => r.qty, align: 'right', total: (rs) => rs.reduce((sum, r) => sum + r.qty, 0) },
    ],
    rows,
    filename: 'inventory-2026-09-01',
    generatedAt: new Date(Date.UTC(2026, 8, 1, 14, 32)),
    ...overrides,
  };
}

function makeCompany(overrides: Partial<Company> = {}): Company {
  return { id: 'co_1', name: 'Vertex Trading (Pty) Ltd', registrationNumber: '2020/123456/07', vatRegistrationNumber: '4123456789', ...overrides } as Company;
}

describe('PrintableReport', () => {
  beforeEach(() => {
    mockedUseCompany.mockReturnValue({ company: makeCompany(), loading: false, error: null, refetch: vi.fn() });
  });

  it('renders the company name, registration and VAT number', () => {
    render(<PrintableReport dataset={makeDataset()} />);
    expect(screen.getByText('Vertex Trading (Pty) Ltd', { ignore: false })).toBeInTheDocument();
    expect(screen.getByText(/2020\/123456\/07/, { ignore: false })).toBeInTheDocument();
    expect(screen.getByText(/4123456789/, { ignore: false })).toBeInTheDocument();
  });

  it('renders gracefully with no company loaded', () => {
    mockedUseCompany.mockReturnValue({ company: undefined, loading: true, error: null, refetch: vi.fn() });
    render(<PrintableReport dataset={makeDataset()} />);
    expect(screen.getByText('Inventory Stock on Hand', { ignore: false })).toBeInTheDocument();
  });

  it('renders title, subtitle, filters and the generated timestamp', () => {
    render(<PrintableReport dataset={makeDataset()} />);
    expect(screen.getByText('Inventory Stock on Hand', { ignore: false })).toBeInTheDocument();
    expect(screen.getByText('As at 1 September 2026', { ignore: false })).toBeInTheDocument();
    expect(screen.getByText(/Warehouse: Main Warehouse/, { ignore: false })).toBeInTheDocument();
    expect(screen.getByText(/Generated:/, { ignore: false })).toBeInTheDocument();
  });

  it('renders every row and column', () => {
    render(<PrintableReport dataset={makeDataset()} />);
    expect(screen.getByText('PEN-1', { ignore: false })).toBeInTheDocument();
    expect(screen.getByText('PEN-2', { ignore: false })).toBeInTheDocument();
  });

  it('renders a totals row when a column defines total()', () => {
    render(<PrintableReport dataset={makeDataset()} />);
    expect(screen.getByText('Total', { ignore: false })).toBeInTheDocument();
    expect(screen.getByText('15', { ignore: false })).toBeInTheDocument();
  });

  it('renders no buttons, inputs or other screen-only controls', () => {
    render(<PrintableReport dataset={makeDataset()} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('shows an empty-state message when there are no rows', () => {
    render(<PrintableReport dataset={makeDataset({ rows: [] })} />);
    expect(screen.getByText(/no records match/i, { ignore: false })).toBeInTheDocument();
  });
});
