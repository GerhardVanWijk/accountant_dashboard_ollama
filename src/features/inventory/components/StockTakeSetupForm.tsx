import { useEffect, useState } from 'react';
import type { ProductCategory, StockTake, StockTakeScope, Warehouse } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { EnumSelect, SearchableSelect } from '@/components/app/combobox';
import { FormBody, FormFooter } from '@/components/app/form';
import type { CreateStockTakeDTO, UpdateStockTakeDTO } from '../services/stockTakeService';

export interface StockTakeSetupFormProps {
  stockTake?: StockTake;
  warehouses: Warehouse[];
  categories: ProductCategory[];
  onSubmit: (data: CreateStockTakeDTO | UpdateStockTakeDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sets up a stock take's SCOPE only — warehouse, what it covers (all
 * products / one category / a hand-picked list) and the count date. There
 * is no line editor here: `stockTakeService.freeze()` atomically derives
 * `expectedQty`/frozen `unitCost` for the whole scope server-side once
 * this draft is frozen — a user never types a line directly (Phase 3C
 * item 6, docs/INVENTORY_ACCOUNTING.md § "Stock take").
 */
export function StockTakeSetupForm({ stockTake, warehouses, categories, onSubmit, onCancel, onDirtyChange }: StockTakeSetupFormProps) {
  const [warehouseId, setWarehouseId] = useState(stockTake?.warehouseId ?? warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? '');
  const [scope, setScope] = useState<StockTakeScope>(stockTake?.scope ?? 'all');
  const [categoryId, setCategoryId] = useState(stockTake?.scopeRef.categoryId ?? '');
  const [productIdsText, setProductIdsText] = useState((stockTake?.scopeRef.productIds ?? []).join(', '));
  const [countDate, setCountDate] = useState(stockTake?.countDate ?? today());
  const [notes, setNotes] = useState(stockTake?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => {
      setDirty(true);
      setter(v);
    };
  }

  const submit = async () => {
    setFormError(null);
    if (!warehouseId) {
      setFormError('Select a warehouse.');
      return;
    }
    if (scope === 'category' && !categoryId) {
      setFormError('Select a category.');
      return;
    }
    const productIds = productIdsText
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (scope === 'items' && productIds.length === 0) {
      setFormError('List at least one product id.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        warehouseId,
        scope,
        scopeRef: scope === 'category' ? { categoryId } : scope === 'items' ? { productIds } : {},
        countDate,
        notes: notes || undefined,
        lineItems: stockTake?.lineItems ?? [],
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save the stock take.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FormBody>
        {formError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="stk-warehouse">Warehouse</FieldLabel>
            <EnumSelect
              id="stk-warehouse"
              value={warehouseId}
              onValueChange={(v) => markDirty(setWarehouseId)(v)}
              placeholder="Select…"
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="stk-date">Count date</FieldLabel>
            <Input id="stk-date" type="date" value={countDate} onChange={(e) => markDirty(setCountDate)(e.target.value)} />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="stk-scope">Scope</FieldLabel>
          <EnumSelect
            id="stk-scope"
            value={scope}
            onValueChange={(v) => markDirty(setScope)(v as StockTakeScope)}
            options={[
              { value: 'all', label: 'All products' },
              { value: 'category', label: 'One category' },
              { value: 'items', label: 'Hand-picked products' },
            ]}
          />
          <FieldDescription>What this count sheet covers — freezing derives the expected quantity and cost for every product in scope.</FieldDescription>
        </Field>

        {scope === 'category' && (
          <Field>
            <FieldLabel htmlFor="stk-category">Category</FieldLabel>
            <SearchableSelect
              id="stk-category"
              aria-label="Category"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              value={categoryId || null}
              onChange={(id) => markDirty(setCategoryId)(id ?? '')}
              placeholder="Select a category"
              emptyMessage="No categories match."
            />
          </Field>
        )}

        {scope === 'items' && (
          <Field>
            <FieldLabel htmlFor="stk-products">Product ids</FieldLabel>
            <Input id="stk-products" value={productIdsText} onChange={(e) => markDirty(setProductIdsText)(e.target.value)} placeholder="prod_1, prod_2" />
            <FieldDescription>Comma-separated product ids.</FieldDescription>
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="stk-notes">Notes</FieldLabel>
          <Textarea id="stk-notes" rows={2} value={notes} onChange={(e) => markDirty(setNotes)(e.target.value)} />
        </Field>
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting} onClick={() => void submit()}>
          {stockTake ? 'Save draft' : 'Create draft'}
        </Button>
      </FormFooter>
    </div>
  );
}
