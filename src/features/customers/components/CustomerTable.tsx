import { useEffect, useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import type { Customer } from '@/types';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/utils/formatCurrency';
import { CreditHoldBadge, CustomerStatusBadge } from './CustomerStatusBadge';
import { Pagination } from './Pagination';

export interface CustomerTableProps {
  customers: Customer[];
  onView: (customer: Customer) => void;
  onEdit: (customer: Customer) => void;
  onToggleActive: (customer: Customer) => void;
  pageSize?: number;
}

const columnHelper = createColumnHelper<Customer>();

/** Sortable data table for the customer list, built on TanStack Table. */
export function CustomerTable({ customers, onView, onEdit, onToggleActive, pageSize = 8 }: CustomerTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

  const columns = useMemo(
    () => [
      columnHelper.accessor('customerNumber', {
        header: 'Number',
        cell: (info) => <span className="font-mono text-xs text-text-secondary">{info.getValue()}</span>,
      }),
      columnHelper.accessor('name', {
        header: 'Customer',
        cell: (info) => {
          const customer = info.row.original;
          return (
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => onView(customer)}
                className="text-left text-sm font-medium text-text-primary hover:text-primary hover:underline"
              >
                {customer.name}
              </button>
              {customer.email && <span className="text-xs text-text-secondary">{customer.email}</span>}
            </div>
          );
        },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => (
          <div className="flex flex-wrap gap-xs">
            <CustomerStatusBadge status={info.getValue()} />
            {info.row.original.creditHold && <CreditHoldBadge />}
          </div>
        ),
      }),
      columnHelper.accessor('balance', {
        header: 'Balance',
        cell: (info) => (
          <span className="text-sm text-text-primary">
            {formatCurrency(info.getValue(), info.row.original.currency)}
          </span>
        ),
      }),
      columnHelper.accessor('creditLimit', {
        header: 'Credit Limit',
        cell: (info) => {
          const value = info.getValue();
          return (
            <span className="text-sm text-text-secondary">
              {typeof value === 'number' ? formatCurrency(value, info.row.original.currency) : '—'}
            </span>
          );
        },
      }),
      columnHelper.accessor('paymentTerms', {
        header: 'Terms',
        cell: (info) => <span className="text-sm text-text-secondary">{info.getValue() ?? '—'}</span>,
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (info) => {
          const customer = info.row.original;
          return (
            <div className="flex flex-wrap justify-end gap-xs">
              <Button variant="ghost" className="px-sm py-xs text-xs" onClick={() => onView(customer)}>
                View
              </Button>
              <Button variant="ghost" className="px-sm py-xs text-xs" onClick={() => onEdit(customer)}>
                Edit
              </Button>
              <Button variant="ghost" className="px-sm py-xs text-xs" onClick={() => onToggleActive(customer)}>
                {customer.status === 'active' ? 'Inactivate' : 'Activate'}
              </Button>
            </div>
          );
        },
      }),
    ],
    [onEdit, onToggleActive, onView],
  );

  const table = useReactTable({
    data: customers,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // Keep the current page in range whenever the filtered dataset shrinks
  // (e.g. a search/filter change) so we never render an empty out-of-range page.
  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [customers]);

  return (
    <div className="flex flex-col gap-md">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border bg-background">
                {headerGroup.headers.map((header) => {
                  const sortDirection = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      className="px-md py-sm text-xs font-semibold uppercase tracking-wide text-text-secondary"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-xs hover:text-text-primary"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span aria-hidden="true" className="text-text-muted">
                            {sortDirection === 'asc' ? '↑' : sortDirection === 'desc' ? '↓' : ''}
                          </span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-background">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-md py-sm align-top">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={pagination.pageIndex + 1}
        pageCount={Math.max(table.getPageCount(), 1)}
        totalItems={customers.length}
        pageSize={pagination.pageSize}
        onPageChange={(page) => table.setPageIndex(page - 1)}
      />
    </div>
  );
}
