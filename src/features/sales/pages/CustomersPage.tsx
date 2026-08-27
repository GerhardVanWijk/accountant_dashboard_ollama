import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Customer } from '@/types';
import { CustomerListPage } from '@/features/customers/pages/CustomerListPage';
import { CustomerDetailSheet } from '@/features/customers/components/CustomerDetailSheet';
import { CustomerFormModal } from '@/features/customers/components/CustomerFormModal';
import { useCustomerMutations } from '@/features/customers/hooks/useCustomerMutations';
import { useCustomers } from '@/features/customers/hooks/useCustomers';
import {
  blankFormValues,
  customerToFormValues,
  formValuesToCreateDTO,
  formValuesToUpdatePatch,
} from '@/features/customers/utils/customerFormMapping';
import type { CustomerFormValues } from '@/features/customers/utils/customerFormSchema';

type FormState = { mode: 'create' } | { mode: 'edit'; customer: Customer } | null;

/**
 * Route target for /sales/customers (docs/ROUTES.md). The list stays
 * mounted at all times — a customer opens as a wide overlay
 * (CustomerDetailSheet), deep-linkable via ?record=<id>, matching the
 * InvoicesPage reference pattern instead of the old full-page swap that
 * used to unmount CustomerListPage (losing its search/filter state) every
 * time a row was opened.
 */
export function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCustomerId = searchParams.get('record') ?? undefined;
  const detailOpen = Boolean(selectedCustomerId);
  function openCustomer(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('record', id);
      return next;
    });
  }
  function closeCustomer() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('record');
      return next;
    });
  }

  const [formState, setFormState] = useState<FormState>(null);
  // Bumped after every create/edit mutation to force CustomerListPage to
  // remount and refetch — it owns its data fetch via useCustomers() rather
  // than receiving props, so a remount is the simplest way to guarantee it
  // sees fresh data. CustomerDetailSheet's own CustomerDetailPage refetches
  // itself independently (useCustomer(customerId)) and stays mounted.
  const [dataVersion, setDataVersion] = useState(0);
  const { customers, refetch: refetchList } = useCustomers();
  const { createCustomer, updateCustomer, saving, error } = useCustomerMutations();

  function nextCustomerNumber(): string {
    const max = customers.reduce((highest, c) => {
      const n = Number(c.customerNumber.replace(/\D/g, ''));
      return Number.isFinite(n) ? Math.max(highest, n) : highest;
    }, 0);
    return `CUST-${String(max + 1).padStart(4, '0')}`;
  }

  async function handleFormSubmit(values: CustomerFormValues): Promise<void> {
    if (formState?.mode === 'edit') {
      await updateCustomer(formState.customer.id, formValuesToUpdatePatch(values));
    } else {
      await createCustomer(formValuesToCreateDTO(values));
    }
    setFormState(null);
    refetchList();
    setDataVersion((t) => t + 1);
  }

  return (
    <>
      <CustomerListPage
        key={dataVersion}
        onView={(customer) => openCustomer(customer.id)}
        onCreate={() => setFormState({ mode: 'create' })}
        onEdit={(customer) => setFormState({ mode: 'edit', customer })}
      />

      <CustomerDetailSheet
        customerId={selectedCustomerId}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeCustomer();
        }}
        onEdit={(customer) => setFormState({ mode: 'edit', customer })}
      />

      {formState && (
        <CustomerFormModal
          title={formState.mode === 'create' ? 'New Customer' : `Edit ${formState.customer.name}`}
          mode={formState.mode}
          defaultValues={formState.mode === 'edit' ? customerToFormValues(formState.customer) : blankFormValues(nextCustomerNumber())}
          onSubmit={handleFormSubmit}
          onClose={() => setFormState(null)}
          submitting={saving}
          submitError={error?.message ?? null}
        />
      )}
    </>
  );
}
