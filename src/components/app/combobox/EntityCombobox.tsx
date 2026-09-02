import { useMemo, type ReactNode } from 'react';
import { Building2, UsersRound } from 'lucide-react';

import type { Customer, Supplier } from '@/types';
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect';

interface EntityComboboxBaseProps {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  clearable?: boolean;
  id?: string;
  triggerClassName?: string;
  'aria-label'?: string;
}

function toOptions<T extends { id: string; name: string; status: string }>(
  rows: T[],
  currentValue: string | null,
  meta: (row: T) => { description?: ReactNode; keywords: string },
  icon: ReactNode,
): SearchableSelectOption[] {
  return rows
    .filter((r) => r.status === 'active' || r.id === currentValue)
    .map((r) => {
      const m = meta(r);
      return {
        value: r.id,
        label: r.name,
        description: m.description,
        keywords: m.keywords,
        icon,
      };
    });
}

/**
 * Customer picker built on `SearchableSelect` (docs brief Part D). Searches
 * name, customer number, email and tax number; the row shows
 * `Customer · CUS-1042`. Presentational — caller passes `customers` from
 * `useCustomers()`.
 */
export function CustomerCombobox({
  customers,
  value,
  onChange,
  placeholder = 'Select a customer',
  disabled,
  invalid,
  clearable,
  id,
  triggerClassName,
  'aria-label': ariaLabel = 'Customer',
}: EntityComboboxBaseProps & { customers: Customer[] }) {
  const options = useMemo(
    () =>
      toOptions(
        customers,
        value,
        (c) => ({
          description: `Customer · ${c.customerNumber}`,
          keywords: [c.name, c.customerNumber, c.email, c.taxNumber].filter(Boolean).join(' '),
        }),
        <UsersRound className="size-3.5 text-muted-foreground" />,
      ),
    [customers, value],
  );

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="Search name, number, email…"
      emptyMessage="No customers match."
      disabled={disabled}
      invalid={invalid}
      clearable={clearable}
      id={id}
      triggerClassName={triggerClassName}
      aria-label={ariaLabel}
    />
  );
}

/**
 * Supplier picker built on `SearchableSelect` (docs brief Part D). Searches
 * name, supplier/account number, email and tax number; the row shows
 * `Supplier · SUP-3012`.
 */
export function SupplierCombobox({
  suppliers,
  value,
  onChange,
  placeholder = 'Select a supplier',
  disabled,
  invalid,
  clearable,
  id,
  triggerClassName,
  'aria-label': ariaLabel = 'Supplier',
}: EntityComboboxBaseProps & { suppliers: Supplier[] }) {
  const options = useMemo(
    () =>
      toOptions(
        suppliers,
        value,
        (s) => ({
          description: `Supplier · ${s.supplierNumber}`,
          keywords: [s.name, s.supplierNumber, s.email, s.taxNumber].filter(Boolean).join(' '),
        }),
        <Building2 className="size-3.5 text-muted-foreground" />,
      ),
    [suppliers, value],
  );

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="Search name, number, email…"
      emptyMessage="No suppliers match."
      disabled={disabled}
      invalid={invalid}
      clearable={clearable}
      id={id}
      triggerClassName={triggerClassName}
      aria-label={ariaLabel}
    />
  );
}
