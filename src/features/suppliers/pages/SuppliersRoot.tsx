import { useSearchParams } from 'react-router-dom';
import { useSuppliers } from '../hooks/useSuppliers';
import { SupplierListPage } from './SupplierListPage';
import { SupplierDetailPage } from './SupplierDetailPage';
import { SupplierFormPage } from './SupplierFormPage';

/**
 * Entry point rendered by src/features/purchases/pages/VendorsPage.tsx
 * at the single `/purchases/vendors` route. Since that's the only route
 * this bee is allowed to register, list/detail/create/edit are switched
 * client-side via `?view=` search params instead of nested router
 * routes — still deep-linkable/shareable/back-button-friendly, just not
 * separate router.tsx entries.
 *
 * useSuppliers() is fetched once here and threaded one level down to
 * each sub-page, so every view shares one in-sync list instead of
 * re-fetching independently (and per docs/DO_NOT_BREAK.md, without
 * prop-drilling more than 2 levels).
 */
export function SuppliersRoot() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') ?? 'list';
  const id = searchParams.get('id') ?? undefined;
  const suppliersState = useSuppliers();

  const goToList = () => setSearchParams({});
  const goToDetail = (supplierId: string) => setSearchParams({ view: 'detail', id: supplierId });
  const goToEdit = (supplierId: string) => setSearchParams({ view: 'edit', id: supplierId });
  const goToCreate = () => setSearchParams({ view: 'create' });

  if (view === 'create') {
    return (
      <SupplierFormPage mode="create" suppliersState={suppliersState} onDone={goToList} onCancel={goToList} />
    );
  }

  if (view === 'edit' && id) {
    return (
      <SupplierFormPage
        mode="edit"
        supplierId={id}
        suppliersState={suppliersState}
        onDone={() => goToDetail(id)}
        onCancel={() => goToDetail(id)}
      />
    );
  }

  if (view === 'detail' && id) {
    return (
      <SupplierDetailPage
        supplierId={id}
        suppliersState={suppliersState}
        onBack={goToList}
        onEdit={() => goToEdit(id)}
      />
    );
  }

  return (
    <SupplierListPage
      suppliersState={suppliersState}
      onView={goToDetail}
      onEdit={goToEdit}
      onCreate={goToCreate}
    />
  );
}
