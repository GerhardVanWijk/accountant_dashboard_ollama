import { useMemo } from 'react';
import { Loader2, Plus, Truck } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
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
import { useBills } from '@/features/purchases/hooks';
import { calculateAging, billsToOpenBills } from '../utils/calculateAging';
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
 *
 * The summary SectionCard (M15, docs/... v0 fidelity restoration) restores
 * v0's `app/app/suppliers/page.tsx` 4-FigureBlock stat row, reproduced
 * label-for-label/grid-for-grid where the real domain supports it:
 * "Total payable" is the real `Supplier.balance` sum (matches v0's own
 * `s.balance` sum exactly); "Active accounts" is the real `status` field.
 * v0's "Due for release" (its mock's separate "approved and awaiting
 * payment" figure) has no equivalent field on the real `Supplier` type —
 * the honest substitute is real AP aging overdue exposure, reusing this
 * feature's own existing `calculateAging()`/`billsToOpenBills()` against
 * real posted Bills (`useBills()`), the exact pattern
 * SupplierDetailPage.tsx already established — kept as "Overdue" to match
 * the Customers page's parallel figure rather than inventing a distinct
 * "awaiting release" concept the backend doesn't model. v0's "Average
 * terms" (a numeric days figure averaged across suppliers) could NOT be
 * reproduced truthfully: the real `Supplier.paymentTerms` is a closed
 * label enum (`'Net14' | 'Net30' | 'EOM'`), and `'EOM'` (end of month) has
 * no fixed day count to average — inventing one would be a fabricated
 * figure. The honest substitute is the real `onHold` boolean (already
 * exposed elsewhere in this table via the "Hold"/"Release" action), giving
 * this row the same Total/Overdue/Active/On-hold shape as the Customers
 * page rather than displaying an invented number.
 */
export function SupplierListPage({ suppliersState, onView, onEdit, onCreate }: SupplierListPageProps) {
  const { suppliers, loading, error, refetch, setOnHold, setStatus } = suppliersState;
  const { bills } = useBills();
  const canCreate = useCanAccess('supplier_management', 'create');
  const canUpdate = useCanAccess('supplier_management', 'update');

  const summary = useMemo(() => {
    const openBills = billsToOpenBills(bills);
    const totalPayable = suppliers.reduce((sum, s) => sum + s.balance, 0);
    const overdue = suppliers.reduce((sum, s) => {
      const aging = calculateAging(s.id, new Date(), openBills);
      return sum + aging.days30 + aging.days60 + aging.days90Plus;
    }, 0);
    const activeCount = suppliers.filter((s) => s.status === 'active').length;
    const onHoldCount = suppliers.filter((s) => s.onHold).length;
    return { totalPayable, overdue, activeCount, onHoldCount };
  }, [suppliers, bills]);

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

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <FigureBlock
            label="Total payable"
            value={formatCurrency(summary.totalPayable)}
            hint={`Across ${suppliers.length} account${suppliers.length === 1 ? '' : 's'}`}
          />
          <FigureBlock
            label="Overdue"
            value={formatCurrency(summary.overdue)}
            hint="Past agreed payment terms"
            tone="negative"
          />
          <FigureBlock
            label="Active accounts"
            value={String(summary.activeCount)}
            hint="Currently trading"
            tone="positive"
          />
          <FigureBlock
            label="On hold"
            value={String(summary.onHoldCount)}
            hint="Purchasing frozen"
            tone={summary.onHoldCount > 0 ? 'warning' : 'default'}
          />
        </div>
      </SectionCard>

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
