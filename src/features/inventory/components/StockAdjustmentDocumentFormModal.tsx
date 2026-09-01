import { useState } from 'react';
import { FormShell, FormHeader } from '@/components/app/form';
import { StockAdjustmentDocumentForm, type StockAdjustmentDocumentFormProps } from './StockAdjustmentDocumentForm';

export interface StockAdjustmentDocumentFormModalProps extends Omit<StockAdjustmentDocumentFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `StockAdjustmentDocumentForm` in the shared Vertex form shell (P3E). */
export function StockAdjustmentDocumentFormModal({ onClose, adjustment, ...formProps }: StockAdjustmentDocumentFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="lg" mode={adjustment ? 'edit' : 'create'} isDirty={dirty}>
      <FormHeader title={adjustment ? `Edit ${adjustment.adjustmentNumber}` : 'New stock adjustment'} />
      <StockAdjustmentDocumentForm adjustment={adjustment} {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
