import { Icon } from '@/components/ui/Icon';
import { SUPPLIER_CATEGORIES, type SupplierFilters as SupplierFiltersState } from '../types/supplier.types';

export interface SupplierFiltersProps {
  filters: SupplierFiltersState;
  onChange: (filters: SupplierFiltersState) => void;
}

const selectClass =
  'rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/**
 * Search + filter controls for the Supplier Master Directory. Pure
 * controlled UI — filtering itself happens in SupplierListPage, not here.
 */
export function SupplierFilters({ filters, onChange }: SupplierFiltersProps) {
  return (
    <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
      <div className="relative w-full md:max-w-sm">
        <Icon
          name="search"
          size={16}
          className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search by name, number, or email…"
          aria-label="Search suppliers"
          className="w-full rounded-md border border-border bg-panel py-xs pl-2xl pr-sm text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </div>

      <div className="flex flex-wrap items-center gap-sm">
        <label className="sr-only" htmlFor="supplier-filter-category">
          Category
        </label>
        <select
          id="supplier-filter-category"
          value={filters.category}
          onChange={(e) =>
            onChange({ ...filters, category: e.target.value as SupplierFiltersState['category'] })
          }
          className={selectClass}
        >
          <option value="all">All categories</option>
          {SUPPLIER_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="supplier-filter-status">
          Status
        </label>
        <select
          id="supplier-filter-status"
          value={filters.status}
          onChange={(e) => onChange({ ...filters, status: e.target.value as SupplierFiltersState['status'] })}
          className={selectClass}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <label className="sr-only" htmlFor="supplier-filter-onhold">
          Account standing
        </label>
        <select
          id="supplier-filter-onhold"
          value={filters.onHold}
          onChange={(e) => onChange({ ...filters, onHold: e.target.value as SupplierFiltersState['onHold'] })}
          className={selectClass}
        >
          <option value="all">All standing</option>
          <option value="on-hold">On hold</option>
          <option value="not-on-hold">Not on hold</option>
        </select>
      </div>
    </div>
  );
}
