import { useState } from 'react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/shadcn/empty';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import type { UseSuppliersResult } from '../hooks/useSuppliers';
import { SupplierForm } from '../components/SupplierForm';
import { mapFormValuesToSupplierPatch } from '../utils/supplierFormSchema';

export interface SupplierFormPageProps {
  mode: 'create' | 'edit';
  supplierId?: string;
  suppliersState: UseSuppliersResult;
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Hosts SupplierForm for both creation and edit — reads/writes through
 * the shared useSuppliers() mutations passed down from SuppliersRoot so
 * every view stays in sync after a save. Re-skinned onto v0's
 * PageHeader/SectionCard shell; the form itself, validation, and the
 * mutation wiring are unchanged.
 */
export function SupplierFormPage({ mode, supplierId, suppliersState, onDone, onCancel }: SupplierFormPageProps) {
  const { suppliers, loading, error, refetch, createSupplier, updateSupplier } = suppliersState;
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (mode === 'edit') {
    if (loading) {
      return (
        <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading supplier…</p>
        </div>
      );
    }
    if (error) {
      return (
        <div role="alert" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button variant="outline" size="sm" onClick={refetch}>
            Try again
          </Button>
        </div>
      );
    }

    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier) {
      return (
        <SectionCard>
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Supplier not found</EmptyTitle>
              <EmptyDescription>This supplier may have been removed.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </SectionCard>
      );
    }

    return (
      <>
        <PageHeader title={`Edit ${supplier.name}`} description="Update this supplier's account details." />
        {submitError && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {submitError}
          </div>
        )}
        <SectionCard>
          <SupplierForm
            initialValues={supplier}
            submitLabel="Save changes"
            onCancel={onCancel}
            onSubmit={async (values) => {
              setSubmitError(null);
              try {
                await updateSupplier(supplier.id, mapFormValuesToSupplierPatch(values));
                onDone();
              } catch (err) {
                setSubmitError(err instanceof Error ? err.message : 'Could not save supplier.');
              }
            }}
          />
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Add supplier" description="Create a new accounts-payable vendor record." />
      {submitError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {submitError}
        </div>
      )}
      <SectionCard>
        <SupplierForm
          submitLabel="Create supplier"
          onCancel={onCancel}
          onSubmit={async (values) => {
            setSubmitError(null);
            try {
              await createSupplier(mapFormValuesToSupplierPatch(values));
              onDone();
            } catch (err) {
              setSubmitError(err instanceof Error ? err.message : 'Could not create supplier.');
            }
          }}
        />
      </SectionCard>
    </>
  );
}
