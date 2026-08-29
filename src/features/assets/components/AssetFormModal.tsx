import { useState } from 'react';

import { FormShell, FormHeader } from '@/components/app/form';
import { AssetForm, type AssetFormProps } from './AssetForm';

export interface AssetFormModalProps extends Omit<AssetFormProps, 'onCancel' | 'onDirtyChange'> {
  onClose: () => void;
}

/** `AssetForm` in the shared Vertex form shell (P3E). */
export function AssetFormModal({ onClose, ...formProps }: AssetFormModalProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <FormShell open onClose={onClose} size="md" mode={formProps.asset ? 'edit' : 'create'} isDirty={dirty}>
      <FormHeader title={formProps.asset ? 'Edit asset' : 'Add asset'} />
      <AssetForm {...formProps} onCancel={onClose} onDirtyChange={setDirty} />
    </FormShell>
  );
}
