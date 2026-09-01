import { useState } from 'react';
import { FormShell, FormHeader } from '@/components/app/form';
import { SupplierReturnDocumentForm, type SupplierReturnDocumentFormProps } from './SupplierReturnDocumentForm';

export interface SupplierReturnDocumentFormModalProps extends Omit<SupplierReturnDocumentFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `SupplierReturnDocumentForm` in the shared Vertex form shell (P3E), mirroring `StockAdjustmentDocumentFormModal`. */
export function SupplierReturnDocumentFormModal({ onClose, supplierReturn, ...formProps }: SupplierReturnDocumentFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="lg" mode={supplierReturn ? 'edit' : 'create'} isDirty={dirty}>
      <FormHeader title={supplierReturn ? `Edit ${supplierReturn.returnNumber}` : 'New supplier return'} />
      <SupplierReturnDocumentForm supplierReturn={supplierReturn} {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
