import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useAuthStore } from '@/stores/authStore';
import { entitlementForPath } from './entitlementRouteMap';
import { EntitlementGate } from './components/EntitlementGate';
import { useEntitlementStore } from './stores/entitlementStore';
import type { EntitlementKey } from './entitlements';

function setEntitlements(keys: EntitlementKey[], loaded = true) {
  if (loaded) useEntitlementStore.getState().set('co_1', keys, null, null);
  else useEntitlementStore.getState().clear();
}

afterEach(() => {
  cleanup();
  useEntitlementStore.getState().clear();
  useAuthStore.setState({ profile: null });
});

describe('entitlementForPath', () => {
  it('resolves the most specific prefix', () => {
    expect(entitlementForPath('/inventory/products')).toBe('inventory');
    expect(entitlementForPath('/sales/quotes')).toBe('sales');
    expect(entitlementForPath('/sales/credit-notes')).toBe('sales_receipts');
    expect(entitlementForPath('/sales/receipts/abc')).toBe('sales_receipts');
    expect(entitlementForPath('/tax/vat-return')).toBe('vat');
    expect(entitlementForPath('/tax/capital-gains')).toBe('advanced_tax');
    expect(entitlementForPath('/assets/register')).toBe('assets');
    expect(entitlementForPath('/assets/depreciation')).toBe('assets_depreciation');
  });

  it('returns null for ungated / marketing paths', () => {
    expect(entitlementForPath('/')).toBeNull();
    expect(entitlementForPath('/help')).toBeNull();
    expect(entitlementForPath('/product/banking')).toBeNull();
  });
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<EntitlementGate />}>
          <Route path="/inventory/*" element={<div>INVENTORY PAGE</div>} />
          <Route path="/sales/*" element={<div>SALES PAGE</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('EntitlementGate', () => {
  it('blocks a route the plan does not include and shows the upgrade panel', () => {
    setEntitlements(['sales', 'banking']);
    renderAt('/inventory/products');
    expect(screen.queryByText('INVENTORY PAGE')).not.toBeInTheDocument();
    expect(screen.getByText(/isn't part of your plan/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view plans/i })).toHaveAttribute('href', '/settings/subscription');
  });

  it('allows a route the plan includes', () => {
    setEntitlements(['sales', 'inventory']);
    renderAt('/inventory/products');
    expect(screen.getByText('INVENTORY PAGE')).toBeInTheDocument();
  });

  it('allows everything until entitlements have loaded (fail-open UX; server still guards writes)', () => {
    setEntitlements([], false);
    renderAt('/inventory/products');
    expect(screen.getByText('INVENTORY PAGE')).toBeInTheDocument();
  });

  it('superuser bypasses entitlement gating', () => {
    useAuthStore.setState({ profile: { id: 'u', role: 'superuser', isActive: true, createdAt: '', updatedAt: '' } });
    setEntitlements(['sales']);
    renderAt('/inventory/products');
    expect(screen.getByText('INVENTORY PAGE')).toBeInTheDocument();
  });

  it('a company admin does NOT bypass entitlement gating', () => {
    useAuthStore.setState({ profile: { id: 'u', role: 'admin', isActive: true, createdAt: '', updatedAt: '' } });
    setEntitlements(['sales']);
    renderAt('/inventory/products');
    expect(screen.queryByText('INVENTORY PAGE')).not.toBeInTheDocument();
    expect(screen.getByText(/isn't part of your plan/i)).toBeInTheDocument();
  });
});
