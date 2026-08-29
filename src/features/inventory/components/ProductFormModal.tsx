import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { ProductForm, type ProductFormProps } from './ProductForm';

export interface ProductFormModalProps extends Omit<ProductFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `ProductForm` in the shared Vertex form shell (P3E). */
export function ProductFormModal({ onClose, ...formProps }: ProductFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="md" mode={formProps.product ? 'edit' : 'create'} isDirty={dirty}>
      <FormHeader title={formProps.product ? 'Edit product' : 'New product'} />
      <ProductForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
