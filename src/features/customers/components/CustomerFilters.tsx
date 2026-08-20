import { Icon } from '@/components/ui/Icon';

export type StatusFilterValue = 'all' | 'active' | 'inactive';
export type CreditHoldFilterValue = 'all' | 'hold' | 'clear';

export interface CustomerFiltersState {
  search: string;
  status: StatusFilterValue;
  creditHold: CreditHoldFilterValue;
}

export interface CustomerFiltersProps {
  value: CustomerFiltersState;
  onChange: (value: CustomerFiltersState) => void;
}

const selectClassName =
  'rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** Search + status + credit-hold filter controls for the customer list. */
export function CustomerFilters({ value, onChange }: CustomerFiltersProps) {
  return (
    <div className="flex flex-col gap-sm md:flex-row md:items-center md:gap-md">
      <label className="relative flex-1 md:max-w-sm">
        <span className="sr-only">Search customers</span>
        <Icon
          name="search"
          size={16}
          className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="search"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder="Search by name, number, or email…"
          className="w-full rounded-md border border-border bg-panel py-sm pl-2xl pr-sm text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </label>

      <label className="flex items-center gap-xs text-sm text-text-secondary">
        Status
        <select
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value as StatusFilterValue })}
          className={selectClassName}
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>

      <label className="flex items-center gap-xs text-sm text-text-secondary">
        Credit
        <select
          value={value.creditHold}
          onChange={(e) => onChange({ ...value, creditHold: e.target.value as CreditHoldFilterValue })}
          className={selectClassName}
        >
          <option value="all">All</option>
          <option value="hold">On Hold</option>
          <option value="clear">Clear</option>
        </select>
      </label>
    </div>
  );
}
