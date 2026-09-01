import { useState } from 'react';
import { FormShell, FormHeader } from '@/components/app/form';
import { StockTransferDocumentForm, type StockTransferDocumentFormProps } from './StockTransferDocumentForm';

export interface StockTransferDocumentFormModalProps extends Omit<StockTransferDocumentFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `StockTransferDocumentForm` in the shared Vertex form shell (P3E), mirroring `StockAdjustmentDocumentFormModal`. */
export function StockTransferDocumentFormModal({ onClose, transfer, ...formProps }: StockTransferDocumentFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="lg" mode={transfer ? 'edit' : 'create'} isDirty={dirty}>
      <FormHeader title={transfer ? `Edit ${transfer.transferNumber}` : 'New stock transfer'} />
      <StockTransferDocumentForm transfer={transfer} {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
