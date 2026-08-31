import { useState } from 'react';
import { FormShell, FormHeader } from '@/components/app/form';
import { CategoryForm, type CategoryFormProps } from './CategoryForm';

export interface CategoryFormModalProps extends Omit<CategoryFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

export function CategoryFormModal({ onClose, category, ...formProps }: CategoryFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="md" mode={category ? 'edit' : 'create'} isDirty={dirty}>
      <FormHeader title={category ? `Edit ${category.name}` : 'New product category'} />
      <CategoryForm {...formProps} category={category} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
