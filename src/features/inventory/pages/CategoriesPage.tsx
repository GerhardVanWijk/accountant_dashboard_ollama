import { useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { ProductCategory } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { StatusBadge } from '@/components/app/status-badge';
import { ConfirmDialog } from '@/components/app/form';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { useAccounts } from '@/features/accounting/hooks/useAccounts';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useProductCategories } from '../hooks/useProductCategories';
import { useProducts } from '../hooks/useProducts';
import { CategoryFormModal } from '../components/CategoryFormModal';
import type {
  CreateProductCategoryDTO,
  UpdateProductCategoryDTO,
} from '../services/productCategoryService';

type Dialog = { kind: 'create' } | { kind: 'edit'; category: ProductCategory } | null;

interface CategoryRow {
  category: ProductCategory;
  productCount: number;
  mappedAccounts: number;
}

/**
 * Product categories — route `/inventory/categories`. Relational
 * `product_categories` (fork B, migration 0024), NOT free-text editing.
 * Each category can carry GL account mappings that drive where its
 * products post.
 */
export function CategoriesPage() {
  const { categories, loading, error, refetch, createCategory, updateCategory, deleteCategory } =
    useProductCategories();
  const { products } = useProducts();
  const { accounts } = useAccounts();
  const { taxRates } = useAllTaxRates();

  const canCreate = useCanAccess('inventory', 'create');
  const canUpdate = useCanAccess('inventory', 'update');
  const canDelete = useCanAccess('inventory', 'delete');

  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rows: CategoryRow[] = useMemo(() => {
    const countByCategory = new Map<string, number>();
    for (const p of products) {
      if (p.categoryId) countByCategory.set(p.categoryId, (countByCategory.get(p.categoryId) ?? 0) + 1);
    }
    return categories.map((category) => ({
      category,
      productCount: countByCategory.get(category.id) ?? 0,
      mappedAccounts: [
        category.revenueAccountId,
        category.cogsAccountId,
        category.inventoryAccountId,
        category.adjustmentAccountId,
      ].filter(Boolean).length,
    }));
  }, [categories, products]);

  const activeCount = categories.filter((c) => c.isActive).length;
  const mappedCount = rows.filter((r) => r.mappedAccounts > 0).length;

  async function handleSubmit(data: CreateProductCategoryDTO | UpdateProductCategoryDTO) {
    if (dialog?.kind === 'edit') await updateCategory(dialog.category.id, data as UpdateProductCategoryDTO);
    else await createCategory(data as CreateProductCategoryDTO);
    setDialog(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCategory(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this category.');
    } finally {
      setDeleting(false);
    }
  }

  const columns: DataTableColumn<CategoryRow>[] = [
    {
      key: 'name',
      header: 'Category',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{r.category.name}</span>
          {r.category.description && (
            <span className="text-xs text-muted-foreground">{r.category.description}</span>
          )}
        </div>
      ),
      sortValue: (r) => r.category.name,
    },
    {
      key: 'products',
      header: 'Products',
      align: 'right',
      cell: (r) => <span className="figure tabular-nums">{r.productCount}</span>,
      sortValue: (r) => r.productCount,
    },
    {
      key: 'accounts',
      header: 'Account mappings',
      align: 'right',
      cell: (r) =>
        r.mappedAccounts === 0 ? (
          <span className="text-xs text-muted-foreground">Standard</span>
        ) : (
          <span className="figure tabular-nums">{r.mappedAccounts} of 4</span>
        ),
      sortValue: (r) => r.mappedAccounts,
      hideBelowMd: true,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <StatusBadge status={r.category.isActive ? 'active' : 'inactive'} />,
      sortValue: (r) => (r.category.isActive ? 'active' : 'inactive'),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) =>
        canUpdate || canDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.category.name}`} />}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canUpdate && (
                <DropdownMenuItem onClick={() => setDialog({ kind: 'edit', category: r.category })}>
                  Edit
                </DropdownMenuItem>
              )}
              {canUpdate && (
                <DropdownMenuItem
                  onClick={() => void updateCategory(r.category.id, { isActive: !r.category.isActive })}
                >
                  {r.category.isActive ? 'Deactivate' : 'Activate'}
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(r.category)}>
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Product categories"
        description="Group items and set the GL accounts a whole family posts to."
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
              <Plus data-icon="inline-start" />
              New category
            </Button>
          ) : undefined
        }
      />

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-3">
          <FigureBlock label="Categories" value={String(categories.length)} hint={`${activeCount} active`} />
          <FigureBlock label="With account mappings" value={String(mappedCount)} hint="Override the standard accounts" />
          <FigureBlock
            label="Uncategorised products"
            value={String(products.filter((p) => !p.categoryId).length)}
            hint="Not assigned to a category"
          />
        </div>
      </SectionCard>

      {loading ? (
        <div role="status" className="flex min-h-[30vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading categories…</p>
        </div>
      ) : error ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <SectionCard title="All categories" bodyClassName="p-4 sm:p-5">
          <DataTable
            rows={rows}
            columns={columns}
            getRowKey={(r) => r.category.id}
            searchable={(r) => `${r.category.name} ${r.category.description ?? ''}`}
            searchPlaceholder="Search categories"
            initialSortKey="name"
            emptyTitle="No categories yet"
            emptyDescription="Create a category to group products and set their default GL accounts."
          />
        </SectionCard>
      )}

      {dialog && (
        <CategoryFormModal
          category={dialog.kind === 'edit' ? dialog.category : undefined}
          accounts={accounts}
          taxRates={taxRates}
          onSubmit={handleSubmit}
          onClose={() => setDialog(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This cannot be undone. A category still assigned to any product cannot be deleted."
        destructive
        confirmLabel="Delete category"
        pending={deleting}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
