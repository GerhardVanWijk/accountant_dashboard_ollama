import { Button } from '@/components/ui/Button';

export interface PaginationProps {
  page: number;
  pageCount: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

/** Small prev/next pagination control shared by the customer list. */
export function Pagination({ page, pageCount, totalItems, pageSize, onPageChange }: PaginationProps) {
  if (totalItems === 0) return null;

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col items-center justify-between gap-sm border-t border-border pt-md sm:flex-row">
      <p className="text-sm text-text-secondary">
        Showing {firstItem}-{lastItem} of {totalItems}
      </p>
      <div className="flex items-center gap-sm">
        <Button
          variant="ghost"
          className="px-sm py-xs text-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </Button>
        <span className="text-sm text-text-secondary">
          Page {page} of {pageCount}
        </span>
        <Button
          variant="ghost"
          className="px-sm py-xs text-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
