/**
 * Minimal placeholder data for the ported v0 shell chrome (user menu,
 * notification menu) — NOT full application data. Ported from
 * accounting-v0-frontend/lib/app/mock/admin.ts, trimmed to just what
 * user-menu.tsx/notification-menu.tsx need, with hrefs remapped to this
 * app's real routes. Per the M0 plan, this stays mock until a later phase
 * wires currentUser to the real authStore/profile and notifications to a
 * real backend feed — this app has no notifications feature yet.
 */

export interface ShellUser {
  name: string;
  email: string;
  role: string;
  initials: string;
}

export const currentUser: ShellUser = {
  name: 'Lerato Mokoena',
  email: 'lerato.mokoena@vertexaccounting.co.za',
  role: 'Accountant',
  initials: 'LM',
};

export interface ShellNotification {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  timestamp: string;
  read: boolean;
  href?: string;
}

export const notifications: ShellNotification[] = [
  {
    id: 'nt-1',
    title: 'VAT201 due in 32 days',
    description: 'The current return is open with an amount payable to SARS.',
    severity: 'warning',
    timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    read: false,
    href: '/tax/vat-return',
  },
  {
    id: 'nt-2',
    title: 'Provisional tax payment due soon',
    description: 'First IRP6 payment for the current financial year.',
    severity: 'critical',
    timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    read: false,
    href: '/tax/provisional-tax',
  },
  {
    id: 'nt-3',
    title: 'Overdue invoices need follow-up',
    description: 'Several customer invoices are more than 90 days overdue.',
    severity: 'critical',
    timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    read: false,
    href: '/sales/invoices',
  },
  {
    id: 'nt-4',
    title: 'Bank feed imported new transactions',
    description: 'Some items could not be auto-matched and need review.',
    severity: 'info',
    timestamp: new Date(Date.now() - 21 * 60 * 60 * 1000).toISOString(),
    read: true,
    href: '/banking/reconciliation',
  },
];
