import { useState } from 'react';
import { FormShell, FormHeader } from '@/components/app/form';
import { StockTakeSetupForm, type StockTakeSetupFormProps } from './StockTakeSetupForm';

export interface StockTakeSetupFormModalProps extends Omit<StockTakeSetupFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `StockTakeSetupForm` in the shared Vertex form shell (P3E), mirroring `StockAdjustmentDocumentFormModal`. */
export function StockTakeSetupFormModal({ onClose, stockTake, ...formProps }: StockTakeSetupFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="md" mode={stockTake ? 'edit' : 'create'} isDirty={dirty}>
      <FormHeader title={stockTake ? `Edit ${stockTake.stockTakeNumber}` : 'New stock take'} />
      <StockTakeSetupForm stockTake={stockTake} {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
