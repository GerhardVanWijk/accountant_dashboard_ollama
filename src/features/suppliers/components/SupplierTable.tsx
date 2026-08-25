import { MoreHorizontal } from 'lucide-react';
import type { Supplier, SupplierCategory } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Amount } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { StatusBadge } from './StatusBadge';

export interface SupplierTableProps {
  suppliers: Supplier[];
  onView: (supplier: Supplier) => void;
  onEdit: (supplier: Supplier) => void;
  onToggleHold: (supplier: Supplier) => void;
  onToggleStatus: (supplier: Supplier) => void;
}

/**
 * Supplier Master Directory register, built on the shared v0 DataTable
 * (src/components/app/data-table.tsx) — search, category/status/hold
 * filters, sorting, and pagination all come from that shared component,
 * matching v0's PartyTable pattern (accounting-v0-frontend's
 * components/app/organisation/party-table.tsx) rather than a bespoke
 * filter bar. Real Supplier fields only — no v0 Party fields (code,
 * a single `contact` object) this domain doesn't have.
 */
export function SupplierTable({ suppliers, onView, onEdit, onToggleHold, onToggleStatus }: SupplierTableProps) {
  const columns: DataTableColumn<Supplier>[] = [
    {
      key: 'name',
      header: 'Account',
      sortValue: (s) => s.name,
      cell: (s) => (
        <button
          type="button"
          onClick={() => onView(s)}
          className="flex flex-col text-left"
        >
          <span className="figure text-sm font-medium text-foreground underline-offset-4 hover:text-brand hover:underline">
            {s.name}
          </span>
          <span className="text-xs text-muted-foreground">{s.supplierNumber}</span>
        </button>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      sortValue: (s) => s.contactPerson ?? '',
      hideBelowMd: true,
      cell: (s) => (
        <div className="flex flex-col">
          <span>{s.contactPerson || '—'}</span>
          <span className="text-xs text-muted-foreground">{s.email || '—'}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortValue: (s) => s.category ?? '',
      hideBelowMd: true,
      cell: (s) => <span>{s.category ?? '—'}</span>,
    },
    {
      key: 'terms',
      header: 'Terms',
      align: 'right',
      sortValue: (s) => s.paymentTerms ?? '',
      cell: (s) => (
        <span className="figure text-muted-foreground tabular-nums">{s.paymentTerms ?? '—'}</span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      sortValue: (s) => s.balance,
      cell: (s) => <Amount value={s.balance} className="text-sm font-medium" />,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (s) => (s.onHold ? 'on-hold' : s.status),
      cell: (s) => <StatusBadge status={s.status} onHold={s.onHold} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (s) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.name}`} />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(s)}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleHold(s)}>
              {s.onHold ? 'Release hold' : 'Put on hold'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleStatus(s)}>
              {s.status === 'active' ? 'Deactivate' : 'Activate'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const categories = [...new Set(suppliers.map((s) => s.category).filter((c): c is SupplierCategory => Boolean(c)))].sort();

  return (
    <DataTable
      rows={suppliers}
      columns={columns}
      getRowKey={(s) => s.id}
      searchable={(s) => [s.name, s.supplierNumber, s.contactPerson ?? '', s.email ?? ''].join(' ')}
      searchPlaceholder="Search suppliers by name, number or contact"
      initialSortKey="balance"
      initialSortDirection="desc"
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'on-hold', label: 'On hold' },
            { value: 'inactive', label: 'Inactive' },
          ],
          match: (s, value) => (value === 'on-hold' ? Boolean(s.onHold) : !s.onHold && s.status === value),
        },
        ...(categories.length > 0
          ? [
              {
                key: 'category',
                label: 'All categories',
                options: categories.map((c) => ({ value: c, label: c })),
                match: (s: Supplier, value: string) => s.category === value,
              },
            ]
          : []),
      ]}
      emptyTitle="No suppliers found"
      emptyDescription="Adjust the search or filters to widen the results, or add a new supplier."
      caption="Supplier accounts"
    />
  );
}
