import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { wideFormDialogClass } from '@/components/app/form-surface';
import { InvoiceForm } from './InvoiceForm';
import type { Invoice } from '@/types';

export interface InvoiceFormModalProps {
  title: string;
  invoice?: Invoice;
  customers: Map<string, string>;
  onSubmit: (data: Partial<Invoice>) => void;
  onClose: () => void;
  isLoading?: boolean;
}

/** Modal shell hosting InvoiceForm for both create and edit flows, built on the shared v0 Dialog primitive. */
export function InvoiceFormModal({ title, onClose, ...formProps }: InvoiceFormModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={wideFormDialogClass}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <InvoiceForm {...formProps} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
