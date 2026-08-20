/**
 * Sidebar navigation model, derived 1:1 from docs/ROUTES.md. Keep this
 * in sync with src/app/router.tsx — every route must have a nav entry
 * and vice versa (docs/DO_NOT_BREAK.md: "Navigation updated for new
 * routes").
 */
export interface NavItem {
  path: string;
  label: string;
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    section: 'Sidebar Top',
    items: [{ path: '/', label: 'Executive Overview' }],
  },
  {
    section: 'Accounting',
    items: [
      { path: '/accounting/coa', label: 'Chart of Accounts' },
      { path: '/accounting/journals', label: 'General Journals' },
      { path: '/accounting/ledger', label: 'General Ledger Detail' },
    ],
  },
  {
    section: 'Sales',
    items: [
      { path: '/sales/customers', label: 'Customer Directory' },
      { path: '/sales/invoices', label: 'Sales Invoices' },
    ],
  },
  {
    section: 'Purchases',
    items: [
      { path: '/purchases/vendors', label: 'Vendor Directory' },
      { path: '/purchases/bills', label: 'Supplier Bills' },
    ],
  },
  {
    section: 'Inventory',
    items: [
      { path: '/inventory/products', label: 'Products & Services' },
      { path: '/inventory/warehouses', label: 'Multi-Warehouse Stock' },
    ],
  },
  {
    section: 'Tax',
    items: [{ path: '/tax/vat-return', label: 'VAT201 Reporting' }],
  },
  {
    section: 'Reports',
    items: [{ path: '/reports', label: 'Financial Statements Hub' }],
  },
  {
    section: 'Admin',
    items: [
      { path: '/admin/users', label: 'User & Role Management' },
      { path: '/admin/audit', label: 'System Audit Trail' },
    ],
  },
];
