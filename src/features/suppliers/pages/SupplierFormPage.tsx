import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
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
 * every view stays in sync after a save.
 */
export function SupplierFormPage({ mode, supplierId, suppliersState, onDone, onCancel }: SupplierFormPageProps) {
  const { suppliers, loading, error, refetch, createSupplier, updateSupplier } = suppliersState;
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (mode === 'edit') {
    if (loading) return <Spinner label="Loading supplier…" />;
    if (error) return <ErrorState message={error.message} onRetry={refetch} />;

    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier) {
      return <EmptyState title="Supplier not found" message="This supplier may have been removed." />;
    }

    return (
      <div className="flex flex-col gap-md">
        <h1 className="text-2xl font-semibold text-text-primary">Edit {supplier.name}</h1>
        {submitError && <ErrorState title="Could not save supplier" message={submitError} />}
        <Card>
          <SupplierForm
            initialValues={supplier}
            submitLabel="Save Changes"
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
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-md">
      <h1 className="text-2xl font-semibold text-text-primary">Add Supplier</h1>
      {submitError && <ErrorState title="Could not create supplier" message={submitError} />}
      <Card>
        <SupplierForm
          submitLabel="Create Supplier"
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
      </Card>
    </div>
  );
}
