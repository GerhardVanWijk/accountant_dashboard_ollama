import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { StockTransferForm, type StockTransferFormProps } from './StockTransferForm';

export interface StockTransferFormModalProps extends Omit<StockTransferFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `StockTransferForm` in the shared Vertex form shell (P3E). */
export function StockTransferFormModal({ onClose, ...formProps }: StockTransferFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="md" mode="create" isDirty={dirty}>
      <FormHeader title="Stock transfer" />
      <StockTransferForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
