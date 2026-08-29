import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { WarehouseForm, type WarehouseFormProps } from './WarehouseForm';

export interface WarehouseFormModalProps extends Omit<WarehouseFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `WarehouseForm` in the shared Vertex form shell (P3E). */
export function WarehouseFormModal({ onClose, ...formProps }: WarehouseFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="md" mode={formProps.warehouse ? 'edit' : 'create'} isDirty={dirty}>
      <FormHeader title={formProps.warehouse ? 'Edit warehouse' : 'New warehouse'} />
      <WarehouseForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
