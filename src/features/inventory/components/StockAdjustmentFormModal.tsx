import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { StockAdjustmentForm, type StockAdjustmentFormProps } from './StockAdjustmentForm';

export interface StockAdjustmentFormModalProps extends Omit<StockAdjustmentFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `StockAdjustmentForm` in the shared Vertex form shell (P3E). */
export function StockAdjustmentFormModal({ onClose, ...formProps }: StockAdjustmentFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="md" mode="create" isDirty={dirty}>
      <FormHeader title="Stock adjustment" />
      <StockAdjustmentForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
