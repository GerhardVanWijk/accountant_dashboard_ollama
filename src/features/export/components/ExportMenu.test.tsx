import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportMenu } from './ExportMenu';
import { downloadCSV } from '../csvExport';
import { downloadXLSX } from '../xlsxExport';
import type { ExportDataset } from '../types';

vi.mock('../csvExport', () => ({ downloadCSV: vi.fn() }));
vi.mock('../xlsxExport', () => ({ downloadXLSX: vi.fn() }));

const mockedDownloadCSV = downloadCSV as unknown as ReturnType<typeof vi.fn>;
const mockedDownloadXLSX = downloadXLSX as unknown as ReturnType<typeof vi.fn>;

interface Row {
  sku: string;
}

function makeDataset(overrides: Partial<ExportDataset<Row>> = {}): ExportDataset<Row> {
  return {
    title: 'Inventory',
    columns: [{ key: 'sku', header: 'SKU', accessor: (r) => r.sku }],
    rows: [{ sku: 'PEN-1' }],
    filename: 'inventory-2026-09-01',
    ...overrides,
  };
}

describe('ExportMenu', () => {
  let printSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
  });

  afterEach(() => {
    printSpy.mockRestore();
  });

  it('renders nothing when not allowed', () => {
    const { container } = render(<ExportMenu dataset={makeDataset()} allowed={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('disables the trigger when there are no rows', () => {
    render(<ExportMenu dataset={makeDataset({ rows: [] })} />);
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });

  it('calls window.print() for "Print / Save PDF"', () => {
    render(<ExportMenu dataset={makeDataset()} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /print \/ save pdf/i }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('calls downloadCSV with the dataset for "Export CSV"', () => {
    const dataset = makeDataset();
    render(<ExportMenu dataset={dataset} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /export csv/i }));
    expect(mockedDownloadCSV).toHaveBeenCalledWith(dataset);
  });

  it('calls downloadXLSX with the dataset for "Export Excel"', async () => {
    const dataset = makeDataset();
    render(<ExportMenu dataset={dataset} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /export excel/i }));
    await vi.waitFor(() => expect(mockedDownloadXLSX).toHaveBeenCalledWith(dataset));
  });
});
