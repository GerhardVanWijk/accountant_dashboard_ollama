import { describe, it, expect } from 'vitest';
import { navGroups, sectionForPath, segmentLabels } from './navigation';

const group = (title: string) => navGroups.find((g) => g.title === title);

describe('navigation — Inventory module', () => {
  it('has an Inventory quick-access under Organisation, flagged quickAccess, pointing at the module', () => {
    const organisation = group('Organisation')!;
    const inventory = organisation.items.find((i) => i.title === 'Inventory');
    expect(inventory?.href).toBe('/inventory');
    expect(inventory?.quickAccess).toBe(true);
  });

  it('has a dedicated Inventory operational group after Purchases & Expenses', () => {
    const titles = navGroups.map((g) => g.title);
    expect(titles).toContain('Inventory');
    expect(titles.indexOf('Inventory')).toBeGreaterThan(titles.indexOf('Purchases & Expenses'));
  });

  it('the Inventory group leads with Overview then the day-to-day pages, ending in Operations / Reports', () => {
    const items = group('Inventory')!.items;
    expect(items.map((i) => i.href)).toEqual([
      '/inventory',
      '/inventory/products',
      '/inventory/categories',
      '/inventory/warehouses',
      '/inventory/movements',
      '/inventory/operations',
      '/inventory/reports',
    ]);
    // both Inventory links point at the same module home
    expect(group('Organisation')!.items.find((i) => i.title === 'Inventory')!.href).toBe(items[0].href);
  });

  it('sectionForPath resolves every inventory subpage to the Inventory group, never Organisation', () => {
    for (const path of [
      '/inventory',
      '/inventory/products',
      '/inventory/categories',
      '/inventory/warehouses',
      '/inventory/movements',
      '/inventory/operations',
      '/inventory/reports',
      '/inventory/reports/inventory-reconciliation',
    ]) {
      expect(sectionForPath(path)).toBe('Inventory');
    }
  });

  it('Fixed Assets is assets-only — no Products or Warehouses', () => {
    const items = group('Fixed Assets')!.items;
    expect(items.every((i) => i.href.startsWith('/assets/'))).toBe(true);
    expect(items.some((i) => /product|warehouse|inventor/i.test(i.title))).toBe(false);
  });

  it('resolves breadcrumb labels for the new inventory segments', () => {
    expect(segmentLabels.categories).toBe('Categories');
    expect(segmentLabels.movements).toBe('Stock Movements');
  });
});
