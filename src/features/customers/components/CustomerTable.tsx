import { MoreHorizontal } from 'lucide-react';
import type { Customer } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { CustomerStatusBadge, CreditHoldBadge } from './CustomerStatusBadge';

export interface CustomerTableProps {
  customers: Customer[];
  onView: (customer: Customer) => void;
  /** Omit (M11: gated by customer_management:update) to hide the row's Edit/Inactivate menu items entirely. */
  onEdit?: (customer: Customer) => void;
  onToggleActive?: (customer: Customer) => void;
  /**
   * Real per-customer overdue total (Phase 3 fidelity fix), computed by
   * the caller via `calculateFleetSummary` from real invoice data — never
   * fabricated in this component. Matches v0's PartyTable "Overdue"
   * extraColumn, positioned the same way (between Balance and Status).
   * Omit to hide the column.
   */
  overdueByCustomerId?: Map<string, number>;
}

/**
 * Customer master directory register, built on the shared v0 DataTable
 * (src/components/app/data-table.tsx) — search, status/credit filters,
 * sorting and pagination all live inside that table, matching v0's
 * PartyTable pattern. Real Customer fields only — no v0 Party fields
 * (code, category, a single `contact` object) this domain doesn't have.
 */
export function CustomerTable({ customers, onView, onEdit, onToggleActive, overdueByCustomerId }: CustomerTableProps) {
  const columns: DataTableColumn<Customer>[] = [
    {
      key: 'name',
      header: 'Account',
      sortValue: (c) => c.name,
      cell: (c) => (
        <button type="button" onClick={() => onView(c)} className="flex flex-col text-left">
          <span className="figure text-sm font-medium text-foreground underline-offset-4 hover:text-brand hover:underline">
            {c.name}
          </span>
          <span className="text-xs text-muted-foreground">{c.customerNumber}</span>
        </button>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      sortValue: (c) => c.email ?? '',
      hideBelowMd: true,
      cell: (c) => {
        const primary = c.contacts?.find((contact) => contact.isPrimary) ?? c.contacts?.[0];
        return (
          <div className="flex flex-col">
            <span>{primary?.name ?? c.email ?? '—'}</span>
            <span className="text-xs text-muted-foreground">{c.email ?? c.phone ?? '—'}</span>
          </div>
        );
      },
    },
    {
      key: 'location',
      header: 'Location',
      sortValue: (c) => c.billingAddress?.city ?? '',
      hideBelowMd: true,
      cell: (c) => <span>{c.billingAddress?.city ?? '—'}</span>,
    },
    {
      key: 'terms',
      header: 'Terms',
      align: 'right',
      sortValue: (c) => c.paymentTerms ?? '',
      cell: (c) => <span className="figure text-muted-foreground tabular-nums">{c.paymentTerms ?? '—'}</span>,
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      sortValue: (c) => c.balance,
      cell: (c) => <Amount value={c.balance} className="text-sm font-medium" />,
    },
    ...(overdueByCustomerId
      ? [
          {
            key: 'overdue',
            header: 'Overdue',
            align: 'right' as const,
            sortValue: (c: Customer) => overdueByCustomerId.get(c.id) ?? 0,
            cell: (c: Customer) => {
              const overdue = overdueByCustomerId.get(c.id) ?? 0;
              return overdue > 0 ? (
                <Amount value={overdue} className="text-sm font-medium text-negative" />
              ) : (
                <span className="text-xs text-muted-foreground">&mdash;</span>
              );
            },
          } satisfies DataTableColumn<Customer>,
        ]
      : []),
    {
      key: 'status',
      header: 'Status',
      sortValue: (c) => (c.creditHold ? 'hold' : c.status),
      cell: (c) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <CustomerStatusBadge status={c.status} />
          {c.creditHold ? <CreditHoldBadge /> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (c) =>
        onEdit || onToggleActive ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.name}`} />}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && <DropdownMenuItem onClick={() => onEdit(c)}>Edit</DropdownMenuItem>}
              {onToggleActive && (
                <DropdownMenuItem onClick={() => onToggleActive(c)}>{c.status === 'active' ? 'Inactivate' : 'Activate'}</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  return (
    <DataTable
      rows={customers}
      columns={columns}
      getRowKey={(c) => c.id}
      searchable={(c) => [c.name, c.customerNumber, c.email ?? ''].join(' ')}
      searchPlaceholder="Search customers by name, number or email"
      initialSortKey="balance"
      initialSortDirection="desc"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ],
          match: (c, value) => c.status === value,
        },
        {
          key: 'creditHold',
          label: 'All credit',
          options: [
            { value: 'hold', label: 'On hold' },
            { value: 'clear', label: 'Clear' },
          ],
          match: (c, value) => (value === 'hold' ? Boolean(c.creditHold) : !c.creditHold),
        },
      ]}
      emptyTitle="No customers found"
      emptyDescription="Adjust the search or filters to widen the results, or create a new customer."
      caption="Customer accounts"
    />
  );
}
