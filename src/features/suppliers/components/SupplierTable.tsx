import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import type { Supplier } from '@/types';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/utils/formatCurrency';
import { cn } from '@/utils/cn';
import { StatusBadge } from './StatusBadge';

export interface SupplierTableProps {
  suppliers: Supplier[];
  onView: (supplier: Supplier) => void;
  onEdit: (supplier: Supplier) => void;
  onToggleHold: (supplier: Supplier) => void;
  onToggleStatus: (supplier: Supplier) => void;
}

const columnHelper = createColumnHelper<Supplier>();
const PAGE_SIZE = 8;

/**
 * TanStack Table-backed Supplier Master Directory table: sortable
 * columns, client-side pagination, quick row actions. Filtering happens
 * upstream in SupplierListPage — this component only sorts/paginates
 * whatever `suppliers` array it's given.
 */
export function SupplierTable({ suppliers, onView, onEdit, onToggleHold, onToggleStatus }: SupplierTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Supplier',
        cell: (info) => (
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => onView(info.row.original)}
              className="text-left text-sm font-medium text-text-primary hover:text-primary hover:underline"
            >
              {info.getValue()}
            </button>
            <span className="text-xs text-text-muted">{info.row.original.supplierNumber}</span>
          </div>
        ),
      }),
      columnHelper.accessor('category', {
        header: 'Category',
        cell: (info) => (
          <span className="text-sm text-text-secondary">{info.getValue() ?? '—'}</span>
        ),
      }),
      columnHelper.accessor('balance', {
        header: 'Balance',
        cell: (info) => (
          <span className="text-sm font-medium text-text-primary">
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
              {value != null ? formatCurrency(value, info.row.original.currency) : '—'}
            </span>
          );
        },
      }),
      columnHelper.accessor('paymentTerms', {
        header: 'Terms',
        enableSorting: false,
        cell: (info) => <span className="text-sm text-text-secondary">{info.getValue() ?? '—'}</span>,
      }),
      columnHelper.display({
        id: 'status',
        header: 'Standing',
        cell: (info) => <StatusBadge status={info.row.original.status} onHold={info.row.original.onHold} />,
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (info) => {
          const supplier = info.row.original;
          return (
            <div className="flex flex-wrap items-center gap-xs">
              <Button variant="ghost" className="px-sm py-xs text-xs" onClick={() => onView(supplier)}>
                View
              </Button>
              <Button variant="ghost" className="px-sm py-xs text-xs" onClick={() => onEdit(supplier)}>
                Edit
              </Button>
              <Button variant="ghost" className="px-sm py-xs text-xs" onClick={() => onToggleHold(supplier)}>
                {supplier.onHold ? 'Release Hold' : 'Put On Hold'}
              </Button>
              <Button variant="ghost" className="px-sm py-xs text-xs" onClick={() => onToggleStatus(supplier)}>
                {supplier.status === 'active' ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          );
        },
      }),
    ],
    [onEdit, onToggleHold, onToggleStatus, onView],
  );

  const table = useReactTable({
    data: suppliers,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const totalRows = table.getFilteredRowModel().rows.length;
  const rangeStart = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = Math.min(totalRows, (pageIndex + 1) * pageSize);

  return (
    <div className="flex flex-col gap-md">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-background">
              {table.getHeaderGroups().map((headerGroup) =>
                headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDirection = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className="px-md py-sm text-left text-xs font-semibold uppercase tracking-wide text-text-secondary"
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-xs hover:text-text-primary"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <Icon
                            name="chevronDown"
                            size={14}
                            className={cn(
                              'transition-transform',
                              sortDirection === 'asc' && 'rotate-180',
                              !sortDirection && 'opacity-30',
                            )}
                          />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                }),
              )}
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0 hover:bg-background">
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

      <div className="flex flex-col items-center justify-between gap-sm md:flex-row">
        <p className="text-xs text-text-secondary">
          Showing {rangeStart}-{rangeEnd} of {totalRows} suppliers
        </p>
        <div className="flex items-center gap-sm">
          <Button
            variant="ghost"
            className="px-sm py-xs text-xs"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <Icon name="chevronDown" size={14} className="rotate-90" />
            Prev
          </Button>
          <span className="text-xs text-text-secondary">
            Page {pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
          </span>
          <Button
            variant="ghost"
            className="px-sm py-xs text-xs"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            Next
            <Icon name="chevronDown" size={14} className="-rotate-90" />
          </Button>
        </div>
      </div>
    </div>
  );
}
