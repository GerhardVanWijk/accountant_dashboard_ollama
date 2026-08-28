import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { wideFormDialogClass } from '@/components/app/form-surface';
import { SalesOrderForm, type SalesOrderFormProps } from './SalesOrderForm';

export interface SalesOrderFormModalProps extends Omit<SalesOrderFormProps, 'onCancel'> {
  title: string;
  onClose: () => void;
}

/** Modal shell hosting SalesOrderForm for both create and edit flows, built on the shared v0 Dialog primitive — mirrors InvoiceFormModal.tsx/QuoteFormModal.tsx. */
export function SalesOrderFormModal({ title, onClose, ...formProps }: SalesOrderFormModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={wideFormDialogClass}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <SalesOrderForm {...formProps} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
