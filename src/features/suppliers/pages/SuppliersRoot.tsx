import { useSearchParams } from 'react-router-dom';
import { useSuppliers } from '../hooks/useSuppliers';
import { SupplierListPage } from './SupplierListPage';
import { SupplierDetailSheet } from '../components/SupplierDetailSheet';
import { SupplierFormPage } from './SupplierFormPage';

/**
 * Entry point rendered by src/features/purchases/pages/VendorsPage.tsx at
 * the single `/purchases/vendors` route. `?record=<id>` opens a supplier
 * as a wide overlay ON TOP of the always-mounted list (same pattern as
 * InvoicesPage/CustomersPage) — the old `?view=detail&id=` used a full
 * content swap that unmounted SupplierListPage, losing its search/filter
 * state every time a row was opened. Create/edit stay as their own
 * `?view=` full-page forms (a genuinely different, complete-and-return
 * workflow, not a "peek at a record" one).
 *
 * useSuppliers() is fetched once here and threaded one level down to
 * each sub-page, so every view shares one in-sync list instead of
 * re-fetching independently (and per docs/DO_NOT_BREAK.md, without
 * prop-drilling more than 2 levels).
 */
export function SuppliersRoot() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') ?? 'list';
  const formId = searchParams.get('id') ?? undefined;
  const selectedSupplierId = searchParams.get('record') ?? undefined;
  const detailOpen = Boolean(selectedSupplierId);
  const suppliersState = useSuppliers();

  const goToList = () => setSearchParams({});
  const openSupplier = (supplierId: string) => setSearchParams({ record: supplierId });
  const closeSupplier = () => setSearchParams({});
  const goToEdit = (supplierId: string) => setSearchParams({ view: 'edit', id: supplierId });
  const goToCreate = () => setSearchParams({ view: 'create' });

  if (view === 'create') {
    return (
      <SupplierFormPage mode="create" suppliersState={suppliersState} onDone={goToList} onCancel={goToList} />
    );
  }

  if (view === 'edit' && formId) {
    return (
      <SupplierFormPage
        mode="edit"
        supplierId={formId}
        suppliersState={suppliersState}
        onDone={() => openSupplier(formId)}
        onCancel={() => openSupplier(formId)}
      />
    );
  }

  return (
    <>
      <SupplierListPage
        suppliersState={suppliersState}
        onView={openSupplier}
        onEdit={goToEdit}
        onCreate={goToCreate}
      />
      <SupplierDetailSheet
        supplierId={selectedSupplierId}
        suppliersState={suppliersState}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeSupplier();
        }}
        onEdit={() => selectedSupplierId && goToEdit(selectedSupplierId)}
      />
    </>
  );
}
