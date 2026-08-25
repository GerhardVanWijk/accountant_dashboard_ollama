import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { CustomerReceiptForm, type CustomerReceiptFormProps } from './CustomerReceiptForm';

export interface CustomerReceiptFormModalProps extends Omit<CustomerReceiptFormProps, 'onCancel'> {
  title?: string;
  onClose: () => void;
}

/** Modal shell hosting CustomerReceiptForm, built on the shared v0 Dialog primitive. */
export function CustomerReceiptFormModal({ title = 'Record customer receipt', onClose, ...formProps }: CustomerReceiptFormModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <CustomerReceiptForm {...formProps} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
