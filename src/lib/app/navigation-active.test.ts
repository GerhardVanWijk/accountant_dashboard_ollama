import { describe, it, expect } from 'vitest';
import { BoxesIcon, PackageIcon, TruckIcon } from 'lucide-react';
import {
  activeAccordionGroupTitle,
  groupHoldsActive,
  isNavItemActive,
  type NavGroup,
} from '@/lib/app/navigation';

const NAV: NavGroup[] = [
  {
    title: 'Organisation',
    items: [
      { title: 'Suppliers', href: '/purchases/vendors', icon: TruckIcon },
      { title: 'Inventory', href: '/inventory', icon: BoxesIcon, quickAccess: true },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { title: 'Overview', href: '/inventory', icon: BoxesIcon },
      { title: 'Products', href: '/inventory/products', icon: PackageIcon },
      { title: 'Reports', href: '/inventory/reports', icon: PackageIcon },
    ],
  },
];

describe('AppSidebar — active-section resolution', () => {
  it('a quick-access item is active only on its exact route, never on the module subpages', () => {
    const quick = { href: '/inventory', quickAccess: true };
    expect(isNavItemActive('/inventory', quick)).toBe(true);
    expect(isNavItemActive('/inventory/products', quick)).toBe(false);

    const real = { href: '/inventory' };
    expect(isNavItemActive('/inventory/products', real)).toBe(true);
  });

  it('the Organisation group never "holds active" for an inventory subpage (quick-access excluded)', () => {
    const organisation = NAV[0];
    expect(groupHoldsActive(organisation, '/inventory/products')).toBe(false);
    expect(groupHoldsActive(organisation, '/purchases/vendors')).toBe(true);
  });

  it('every /inventory route opens the operational Inventory group, not Organisation', () => {
    for (const path of ['/inventory', '/inventory/products', '/inventory/reports', '/inventory/reports/x']) {
      expect(activeAccordionGroupTitle(NAV, path)).toBe('Inventory');
    }
  });

  it('a genuine Organisation route opens Organisation', () => {
    expect(activeAccordionGroupTitle(NAV, '/purchases/vendors')).toBe('Organisation');
  });

  it('prefers the most specific match when two sections overlap', () => {
    const groups: NavGroup[] = [
      { title: 'Broad', items: [
        { title: 'A', href: '/x', icon: BoxesIcon },
        { title: 'B', href: '/y', icon: BoxesIcon },
      ] },
      { title: 'Specific', items: [
        { title: 'C', href: '/x/deep', icon: BoxesIcon },
        { title: 'D', href: '/x/other', icon: BoxesIcon },
      ] },
    ];
    expect(activeAccordionGroupTitle(groups, '/x/deep')).toBe('Specific');
    expect(activeAccordionGroupTitle(groups, '/x')).toBe('Broad');
  });
});
