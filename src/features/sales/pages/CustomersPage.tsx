import { useState } from 'react';
import type { Customer } from '@/types';
import { CustomerListPage } from '@/features/customers/pages/CustomerListPage';
import { CustomerDetailPage } from '@/features/customers/pages/CustomerDetailPage';
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

type View = { type: 'list' } | { type: 'detail'; customerId: string };
type FormState = { mode: 'create' } | { mode: 'edit'; customer: Customer } | null;

/**
 * Route target for /sales/customers (docs/ROUTES.md). Orchestrates the
 * Customer module's list/detail views and create/edit modal — there is
 * no dedicated /sales/customers/:id route (router.tsx is out of scope
 * for this bee), so navigation between list and detail is in-page state.
 */
export function CustomersPage() {
  const [view, setView] = useState<View>({ type: 'list' });
  const [formState, setFormState] = useState<FormState>(null);
  // Bumped after every create/edit mutation to force CustomerListPage and
  // CustomerDetailPage to remount and refetch — they each own their data
  // fetch via useCustomers()/useCustomer() rather than receiving props,
  // so a remount is the simplest way to guarantee they see fresh data.
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
      {view.type === 'list' && (
        <CustomerListPage
          key={dataVersion}
          onView={(customer) => setView({ type: 'detail', customerId: customer.id })}
          onCreate={() => setFormState({ mode: 'create' })}
          onEdit={(customer) => setFormState({ mode: 'edit', customer })}
        />
      )}

      {view.type === 'detail' && (
        <CustomerDetailPage
          key={`${view.customerId}-${dataVersion}`}
          customerId={view.customerId}
          onBack={() => setView({ type: 'list' })}
          onEdit={(customer) => setFormState({ mode: 'edit', customer })}
        />
      )}

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
