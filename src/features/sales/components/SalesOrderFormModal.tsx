import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { SalesOrderForm, type SalesOrderFormProps } from './SalesOrderForm';

export interface SalesOrderFormModalProps extends Omit<SalesOrderFormProps, 'onCancel' | 'onDirtyChange'> {
  title: string;
  onClose: () => void;
}

/** `SalesOrderForm` in the shared Vertex form shell (P3G). */
export function SalesOrderFormModal({ title, onClose, ...formProps }: SalesOrderFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="lg" mode={formProps.salesOrder ? 'edit' : 'create'} isDirty={dirty}>
      <FormHeader title={title} />
      <SalesOrderForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
