import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LayoutDashboardIcon, PackageIcon } from 'lucide-react';
import { GlobalSearch } from './global-search';
import type { GlobalSearchRecord } from './global-search-records';

const navMock = vi.fn();
vi.mock('@/features/auth/hooks/useVisibleNavGroups', () => ({
  useVisibleNavGroups: () => navMock(),
}));

const recordsMock = vi.fn();
vi.mock('./global-search-records', () => ({
  useGlobalSearchRecords: (enabled: boolean) => recordsMock(enabled),
}));

const RECORDS: GlobalSearchRecord[] = [
  { type: 'product', id: 'p1', code: 'PRN-008', name: '2-Colour Printing Calculator', href: '/inventory/products/p1', keywords: 'PRN-008 2-Colour Printing Calculator product item' },
  { type: 'customer', id: 'c1', code: 'CUS-1042', name: 'ABC Office Supplies', href: '/sales/customers?record=c1', keywords: 'CUS-1042 ABC Office Supplies customer' },
  { type: 'supplier', id: 's1', code: 'SUP-3', name: 'Paper Mills Ltd', href: '/purchases/vendors?record=s1', keywords: 'SUP-3 Paper Mills Ltd supplier vendor' },
];

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderSearch() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <GlobalSearch />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  navMock.mockReturnValue([
    { title: 'Overview', items: [{ title: 'Dashboard', href: '/', icon: LayoutDashboardIcon }] },
    { title: 'Inventory', items: [{ title: 'Stock Movements', href: '/inventory/movements', icon: PackageIcon }] },
  ]);
  recordsMock.mockReturnValue({ records: RECORDS, loading: false, error: false });
});
afterEach(cleanup);

describe('GlobalSearch', () => {
  it('opens from the header button and shows "Jump to" shortcuts, not a duplicated hint', () => {
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: /search everything/i }));
    expect(screen.getByPlaceholderText(/search pages, products, customers and suppliers/i)).toBeInTheDocument();
    // The pre-typing state offers common destinations instead of repeating
    // the input's own placeholder sentence as body text (docs brief Part A).
    expect(screen.getByText('Jump to')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    // The only element repeating the placeholder sentence is the sr-only
    // DialogDescription — there is no visible body paragraph doing it.
    const echoes = screen.queryAllByText(
      (_, el) =>
        el?.tagName === 'P' &&
        !el.closest('[data-slot="dialog-header"]') &&
        /^search pages, products, customers and suppliers$/i.test((el.textContent ?? '').trim()),
    );
    expect(echoes).toHaveLength(0);
  });

  it('shows the keyboard hint footer', () => {
    renderSearch();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.getByText('Navigate')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('opens with Ctrl/Cmd+K', () => {
    renderSearch();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.getByPlaceholderText(/search pages, products/i)).toBeInTheDocument();
  });

  it('searches navigation and navigates on select', async () => {
    renderSearch();
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    fireEvent.change(screen.getByPlaceholderText(/search pages, products/i), { target: { value: 'stock movements' } });
    const item = await screen.findByText('Stock Movements');
    fireEvent.click(item);
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/inventory/movements'));
  });

  it('finds a product by SKU and navigates to its record', async () => {
    renderSearch();
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    fireEvent.change(screen.getByPlaceholderText(/search pages, products/i), { target: { value: 'PRN-008' } });
    const hit = await screen.findByText('PRN-008');
    fireEvent.click(hit);
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/inventory/products/p1'));
  });

  it('finds a customer by name and navigates to its record', async () => {
    renderSearch();
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    fireEvent.change(screen.getByPlaceholderText(/search pages, products/i), { target: { value: 'ABC Office' } });
    fireEvent.click(await screen.findByText('CUS-1042'));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/sales/customers?record=c1'));
  });

  it('finds a supplier by name and deep-links to its record (consistent with products/customers)', async () => {
    renderSearch();
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    fireEvent.change(screen.getByPlaceholderText(/search pages, products/i), { target: { value: 'Paper Mills' } });
    fireEvent.click(await screen.findByText('SUP-3'));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/purchases/vendors?record=s1'));
  });

  it('shows an explicit no-results state', async () => {
    renderSearch();
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    fireEvent.change(screen.getByPlaceholderText(/search pages, products/i), { target: { value: 'zzz-nothing-matches' } });
    expect(await screen.findByText(/no results for/i)).toBeInTheDocument();
  });

  it('only asks the record index to load once the palette is open', () => {
    renderSearch();
    expect(recordsMock).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: /search everything/i }));
    expect(recordsMock).toHaveBeenLastCalledWith(true);
  });
});
