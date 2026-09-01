import { useState } from 'react';
import { FormShell, FormHeader } from '@/components/app/form';
import { OpeningStockBatchDocumentForm, type OpeningStockBatchDocumentFormProps } from './OpeningStockBatchDocumentForm';

export interface OpeningStockBatchDocumentFormModalProps extends Omit<OpeningStockBatchDocumentFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `OpeningStockBatchDocumentForm` in the shared Vertex form shell (P3E), mirroring `StockAdjustmentDocumentFormModal`. */
export function OpeningStockBatchDocumentFormModal({ onClose, batch, ...formProps }: OpeningStockBatchDocumentFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="lg" mode={batch ? 'edit' : 'create'} isDirty={dirty}>
      <FormHeader title={batch ? `Edit ${batch.batchNumber}` : 'New opening stock batch'} />
      <OpeningStockBatchDocumentForm batch={batch} {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
