import { useMemo } from 'react';
import { Loader2, Plus, Truck } from 'lucide-react';
import { FigureBlock } from '@/components/app/figure';
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
import { formatCurrency } from '@/lib/app/format';
import type { UseSuppliersResult } from '../hooks/useSuppliers';
import { SupplierTable } from '../components/SupplierTable';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { useBills } from '@/features/purchases/hooks';
import { calculateFleetSummary } from '../utils/supplierFinancials';

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
 *
 * Phase 3 fidelity fix: v0's SuppliersPage has a 4-tile stat row above
 * the table (total payable / due for release / active / average terms)
 * this page was missing entirely. Added back using real data —
 * `Supplier.balance` (the same stored field v0 itself sums) and real
 * Bill data via useBills() (Purchases module), the same source
 * SupplierDetailPage already converts via billsToOpenBills for its own
 * aging figures — not the temporary mock bills dataset. v0's "Average
 * terms (days)" tile has no real equivalent (paymentTerms is categorical,
 * not a day count) — substituted with "On hold" (the real `onHold` flag),
 * mirroring the Customer fleet summary's same substitution.
 */
export function SupplierListPage({ suppliersState, onView, onEdit, onCreate }: SupplierListPageProps) {
  const { suppliers, loading, error, refetch, setOnHold, setStatus } = suppliersState;
  const { bills } = useBills();
  const canCreate = useCanAccess('supplier_management', 'create');
  const canUpdate = useCanAccess('supplier_management', 'update');

  const fleetSummary = useMemo(
    () => calculateFleetSummary(suppliers, bills),
    [suppliers, bills],
  );

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

      {!loading && !error && (
        <SectionCard>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FigureBlock
              label="Total payable"
              value={formatCurrency(fleetSummary.totalPayable)}
              hint={`Across ${suppliers.length} accounts`}
            />
            <FigureBlock
              label="Due for release"
              value={formatCurrency(fleetSummary.totalOutstanding)}
              hint="Approved and awaiting payment"
              tone="warning"
            />
            <FigureBlock
              label="Active accounts"
              value={String(fleetSummary.activeCount)}
              hint="Currently trading"
              tone="positive"
            />
            <FigureBlock
              label="On hold"
              value={String(fleetSummary.onHoldCount)}
              hint="Purchasing frozen"
              tone={fleetSummary.onHoldCount > 0 ? 'warning' : 'default'}
            />
          </div>
        </SectionCard>
      )}

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
            outstandingBySupplierId={fleetSummary.outstandingBySupplierId}
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
