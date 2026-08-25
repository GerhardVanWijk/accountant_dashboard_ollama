import { Loader2, Plus, Truck } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/shadcn/empty';
import type { UseSuppliersResult } from '../hooks/useSuppliers';
import { SupplierTable } from '../components/SupplierTable';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';

export interface SupplierListPageProps {
  suppliersState: UseSuppliersResult;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onCreate: () => void;
}

/**
 * Supplier Master Directory: v0 PageHeader/SectionCard shell around the
 * shared v0 DataTable (via SupplierTable) — search, filter, sort and
 * pagination all live inside that table, matching v0's organisation
 * module pattern. Loading/error/empty states follow the same idiom M1
 * established for the dashboard (docs/V0_DASHBOARD_INTEGRATION.md).
 * Data comes from the real useSuppliers() hook, unchanged.
 */
export function SupplierListPage({ suppliersState, onView, onEdit, onCreate }: SupplierListPageProps) {
  const { suppliers, loading, error, refetch, setOnHold, setStatus } = suppliersState;
  const canCreate = useCanAccess('supplier_management', 'create');
  const canUpdate = useCanAccess('supplier_management', 'update');

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Manage vendor accounts, credit terms, and accounts-payable standing."
        actions={
          canCreate ? (
            <Button size="sm" onClick={onCreate}>
              <Plus data-icon="inline-start" />
              Add supplier
            </Button>
          ) : undefined
        }
      />

      {loading && (
        <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading suppliers…</p>
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button variant="outline" size="sm" onClick={refetch}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && suppliers.length === 0 && (
        <SectionCard>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Truck />
              </EmptyMedia>
              <EmptyTitle>No suppliers yet</EmptyTitle>
              <EmptyDescription>Add your first vendor to start tracking accounts payable.</EmptyDescription>
            </EmptyHeader>
            {canCreate && (
              <EmptyContent>
                <Button size="sm" onClick={onCreate}>
                  <Plus data-icon="inline-start" />
                  Add supplier
                </Button>
              </EmptyContent>
            )}
          </Empty>
        </SectionCard>
      )}

      {!loading && !error && suppliers.length > 0 && (
        <SectionCard bodyClassName="p-5">
          <SupplierTable
            suppliers={suppliers}
            onView={(supplier) => onView(supplier.id)}
            onEdit={canUpdate ? (supplier) => onEdit(supplier.id) : undefined}
            onToggleHold={
              canUpdate
                ? (supplier) => {
                    void setOnHold(supplier.id, !supplier.onHold);
                  }
                : undefined
            }
            onToggleStatus={
              canUpdate
                ? (supplier) => {
                    void setStatus(supplier.id, supplier.status === 'active' ? 'inactive' : 'active');
                  }
                : undefined
            }
          />
        </SectionCard>
      )}
    </>
  );
}
