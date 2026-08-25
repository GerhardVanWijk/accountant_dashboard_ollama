'use client';

/**
 * The workhorse list view used by every register in the app.
 *
 * Search, filtering, sorting and paging all operate on the rows handed in —
 * the table never fetches or derives data of its own.
 *
 * Ported verbatim from accounting-v0-frontend/components/app/data-table.tsx.
 */

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from 'lucide-react';

import { Button } from '@/components/ui/shadcn/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/shadcn/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/shadcn/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/table';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Supplying this makes the column sortable. */
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  headClassName?: string;
  cellClassName?: string;
  /** Hides the column below the `md` breakpoint. */
  hideBelowMd?: boolean;
}

export interface DataTableFilter<T> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  match: (row: T, value: string) => boolean;
}

const alignClass = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  searchable,
  searchPlaceholder = 'Search',
  filters,
  initialSortKey,
  initialSortDirection = 'asc',
  pageSize = 12,
  emptyTitle = 'Nothing to show',
  emptyDescription = 'No records match the current search and filters.',
  toolbar,
  footerRow,
  caption,
  renderDetail,
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T) => string;
  /** Fields concatenated and matched against the search term. */
  searchable?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: DataTableFilter<T>[];
  initialSortKey?: string;
  initialSortDirection?: 'asc' | 'desc';
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Extra controls rendered to the right of the search and filters. */
  toolbar?: ReactNode;
  /** A totals row pinned beneath the body. */
  footerRow?: ReactNode;
  caption?: string;
  /**
   * Renders an extra full-width row beneath a row. Return null to leave the
   * row collapsed — used for drill-downs such as journal double-entry lines.
   */
  renderDetail?: (row: T) => ReactNode;
}) {
  const [term, setTerm] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | undefined>(initialSortKey);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    initialSortDirection,
  );
  const [page, setPage] = useState(0);

  const visible = useMemo(() => {
    let next = rows;

    if (searchable && term.trim()) {
      const needle = term.trim().toLowerCase();
      next = next.filter((row) => searchable(row).toLowerCase().includes(needle));
    }

    for (const filter of filters ?? []) {
      const value = filterValues[filter.key];
      if (value && value !== 'all') {
        next = next.filter((row) => filter.match(row, value));
      }
    }

    const column = columns.find((c) => c.key === sortKey);
    if (column?.sortValue) {
      const read = column.sortValue;
      next = [...next].sort((a, b) => {
        const left = read(a);
        const right = read(b);
        const result =
          typeof left === 'number' && typeof right === 'number'
            ? left - right
            : String(left).localeCompare(String(right), 'en-ZA');
        return sortDirection === 'asc' ? result : -result;
      });
    }

    return next;
  }, [rows, term, filterValues, filters, searchable, columns, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const paged = visible.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize,
  );

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setPage(0);
  }

  const hasControls = Boolean(searchable || filters?.length || toolbar);

  return (
    <div className="flex flex-col gap-4">
      {hasControls ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {searchable ? (
              <InputGroup className="w-full sm:w-72">
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  value={term}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  onChange={(event) => {
                    setTerm(event.target.value);
                    setPage(0);
                  }}
                />
              </InputGroup>
            ) : null}

            {(filters ?? []).map((filter) => {
              const items = [
                { value: 'all', label: filter.label },
                ...filter.options,
              ];
              return (
                <Select
                  key={filter.key}
                  items={items}
                  value={filterValues[filter.key] ?? 'all'}
                  onValueChange={(value) => {
                    setFilterValues((prev) => ({
                      ...prev,
                      [filter.key]: String(value),
                    }));
                    setPage(0);
                  }}
                >
                  <SelectTrigger
                    className="h-9 w-full sm:w-auto sm:min-w-40"
                    aria-label={filter.label}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {items.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              );
            })}
          </div>

          {toolbar ? (
            <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border">
        {visible.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                {columns.map((column) => {
                  const sortable = Boolean(column.sortValue);
                  const active = sortKey === column.key;
                  const Icon = !active
                    ? ChevronsUpDown
                    : sortDirection === 'asc'
                      ? ArrowUp
                      : ArrowDown;

                  return (
                    <TableHead
                      key={column.key}
                      aria-sort={
                        active
                          ? sortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                      className={cn(
                        'px-4 text-xs font-medium tracking-wide text-muted-foreground uppercase',
                        alignClass[column.align ?? 'left'],
                        column.hideBelowMd && 'hidden md:table-cell',
                        column.headClassName,
                      )}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                            active && 'text-foreground',
                            column.align === 'right' && 'flex-row-reverse',
                          )}
                        >
                          {column.header}
                          <Icon className="size-3.5" aria-hidden="true" />
                        </button>
                      ) : (
                        column.header
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((row) => {
                const detail = renderDetail?.(row);
                return (
                  <Fragment key={getRowKey(row)}>
                    <TableRow
                      className={cn(detail && 'border-b-0 bg-muted/25')}
                    >
                      {columns.map((column) => (
                        <TableCell
                          key={column.key}
                          className={cn(
                            'px-4 py-3',
                            alignClass[column.align ?? 'left'],
                            column.hideBelowMd && 'hidden md:table-cell',
                            column.cellClassName,
                          )}
                        >
                          {column.cell(row)}
                        </TableCell>
                      ))}
                    </TableRow>
                    {detail ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={columns.length}
                          className="bg-muted/25 p-0"
                        >
                          {detail}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
            {footerRow ? <TableFooter>{footerRow}</TableFooter> : null}
          </Table>
        )}
      </div>

      {visible.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {caption ? `${caption} — ` : ''}
            Showing{' '}
            <span className="figure font-medium text-foreground">
              {currentPage * pageSize + 1}–
              {Math.min((currentPage + 1) * pageSize, visible.length)}
            </span>{' '}
            of{' '}
            <span className="figure font-medium text-foreground">
              {visible.length}
            </span>
          </p>

          {pageCount > 1 ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <span className="figure text-xs text-muted-foreground">
                Page {currentPage + 1} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
