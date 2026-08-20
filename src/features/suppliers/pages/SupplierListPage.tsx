import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import type { UseSuppliersResult } from '../hooks/useSuppliers';
import { SupplierFilters } from '../components/SupplierFilters';
import { SupplierTable } from '../components/SupplierTable';
import { defaultSupplierFilters, type SupplierFilters as SupplierFiltersState } from '../types/supplier.types';

export interface SupplierListPageProps {
  suppliersState: UseSuppliersResult;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onCreate: () => void;
}

/**
 * Supplier Master Directory: searchable/filterable/sortable list with
 * quick row actions. Loading/error/empty/data states per
 * docs/ARCHITECTURE.md § Component State.
 */
export function SupplierListPage({ suppliersState, onView, onEdit, onCreate }: SupplierListPageProps) {
  const { suppliers, loading, error, refetch, setOnHold, setStatus } = suppliersState;
  const [filters, setFilters] = useState<SupplierFiltersState>(defaultSupplierFilters);

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return suppliers.filter((supplier) => {
      if (search) {
        const haystack = `${supplier.name} ${supplier.supplierNumber} ${supplier.email ?? ''}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (filters.category !== 'all' && supplier.category !== filters.category) return false;
      if (filters.status !== 'all' && supplier.status !== filters.status) return false;
      if (filters.onHold === 'on-hold' && !supplier.onHold) return false;
      if (filters.onHold === 'not-on-hold' && supplier.onHold) return false;
      return true;
    });
  }, [suppliers, filters]);

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Vendor Directory</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Manage vendor accounts, credit terms, and accounts-payable standing.
          </p>
        </div>
        <Button variant="primary" onClick={onCreate}>
          <Icon name="suppliers" size={16} />
          Add Supplier
        </Button>
      </div>

      <SupplierFilters filters={filters} onChange={setFilters} />

      {loading && <Spinner label="Loading suppliers…" />}

      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && suppliers.length === 0 && (
        <EmptyState
          title="No suppliers yet"
          message="Add your first vendor to start tracking accounts payable."
          action={
            <Button variant="primary" onClick={onCreate}>
              Add Supplier
            </Button>
          }
        />
      )}

      {!loading && !error && suppliers.length > 0 && filtered.length === 0 && (
        <EmptyState title="No matching suppliers" message="Try adjusting your search or filters." />
      )}

      {!loading && !error && filtered.length > 0 && (
        <SupplierTable
          suppliers={filtered}
          onView={(supplier) => onView(supplier.id)}
          onEdit={(supplier) => onEdit(supplier.id)}
          onToggleHold={(supplier) => {
            void setOnHold(supplier.id, !supplier.onHold);
          }}
          onToggleStatus={(supplier) => {
            void setStatus(supplier.id, supplier.status === 'active' ? 'inactive' : 'active');
          }}
        />
      )}
    </div>
  );
}
